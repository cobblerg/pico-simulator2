// Public /api/events 요청 처리 로직 (Stage 0-D9-B)
//
// 이 파일은 순수 함수다 — Vercel/Node HTTP 타입에 의존하지 않는다.
// api/events.ts(얇은 HTTP 어댑터)가 이 함수를 감싼다.
//
// 처리 순서(0-D9-B 요청 그대로):
//   1. POST 확인
//   2. JSON request validation(구조적 검증만 — 필드 내용은 7번에서)
//   3~5. student_session cookie 추출 + verifyStudentSession() + session
//        identity 확인
//   6. Enrollment DB consistency 확인 — browser가 보낸 identity는 여기서
//      전혀 쓰지 않는다. session.enrollmentId로 DB를 조회해 재확인한
//      값만 이후 단계에서 쓴다.
//   7. activityId/eventType/payload validation(형식/화이트리스트/크기)
//   8. learning_event INSERT
//   9. generic response
//
// 이 순서가 중요한 이유: 인증(6번까지)을 입력 내용 검증(7번)보다 먼저
// 끝낸다 — 신뢰하지 않는 요청의 payload를 굳이 자세히 들여다보지 않는다.
import { StudentSessionIdentity, parseStudentSessionCookie, verifyStudentSession } from './student-session';
import { LearningEventDataSource } from './learning-event-data';

export type LearningEventHandlerResult = { httpStatus: number; body: unknown };

// ---------- eventType allowlist ----------
//
// 0-D9 architecture review가 조사한 28종 전부를 무비판적으로 허용하지
// 않는다. 제외한 것과 이유:
//   - teacher-activity/teacher-link: 학생 학습 Event API가 아니라 교사
//     조작이다 — 이 API의 성격과 맞지 않는다.
//   - repl: 자유 입력이라 PII가 들어갈 수 있다(0-D9 review §10).
//   - open/tab/copy-code/download-main: 교육적으로 낮은 가치의 UI 조작
//     이벤트다.
//   - project-export: standalone 전용이며(__STANDALONE__ 빌드에서만
//     발생) 위 셋과 같은 범주로 판단해 제외.
const ALLOWED_EVENT_TYPES = new Set([
  'mission-open',
  'activity-open',
  'paste',
  'part-add',
  'part-move',
  'part-remove',
  'run',
  'run-end',
  'error',
  'stop',
  'checkpoint',
  'reset',
  'project-save',
  'project-open',
  'project-share',
  'project-restart',
  'real-connect',
  'real-run',
  'real-run-end',
  'real-save',
  // D11-B8: AI Coach 학습 과정 이벤트 (coach-*)
  'coach-open',
  'coach-hint',
  'coach-retry',
  'coach-reflection',
]);

// ---------- 제한값 ----------
const MAX_ACTIVITY_ID_LENGTH = 32;
const ACTIVITY_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/; // m1~m6를 포함하되 미래 확장을 과하게 막지 않는 최소 형식
const MAX_PAYLOAD_JSON_BYTES = 32 * 1024; // 32KB — 0-D9 architecture review에서 정한 상한
// run/real-run의 code 필드 상한. project.ts의 parseFile()이 공유 프로젝트
// 파일 import 시 쓰는 50000자 상한과는 다른 값이다 — 그건 "가끔 한 번
// 일어나는 파일 import"를 위한 관대한 상한이고, 이건 "반복적으로 발생하는
// 이벤트"를 위한 상한이라 32KB 전체 payload 예산에 여유 있게 들어맞도록
// 더 작게 잡았다.
const MAX_CODE_LENGTH = 20000;
// project.ts의 VALID_GP(0~22, 26, 27, 28 — 총 26개)/cleanParts()의
// slice(0, 26)과 동일한 상수를 재사용한다 — 유효 GPIO 핀이 26개뿐이므로
// 정상적인 회로는 이보다 많은 부품을 가질 수 없다.
const MAX_PARTS_COUNT = 26;
const MAX_SHORT_TEXT_LENGTH = 2000; // error/checkpoint의 메시지류 필드

const IDENTITY_FIELD_NAMES = ['studentId', 'enrollmentId', 'classId'] as const;

function isString(v: unknown): v is string {
  return typeof v === 'string';
}
function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean';
}
function pickString(obj: Record<string, unknown>, key: string): string | undefined {
  return isString(obj[key]) ? obj[key] : undefined;
}
function pickTruncatedString(obj: Record<string, unknown>, key: string, maxLen: number): string | undefined {
  const v = pickString(obj, key);
  return v === undefined ? undefined : v.length > maxLen ? v.slice(0, maxLen) : v;
}
function pickNumber(obj: Record<string, unknown>, key: string): number | undefined {
  return isFiniteNumber(obj[key]) ? obj[key] : undefined;
}
function pickNullableNumber(obj: Record<string, unknown>, key: string): number | null | undefined {
  if (obj[key] === null) return null;
  return isFiniteNumber(obj[key]) ? obj[key] : undefined;
}
function pickBoolean(obj: Record<string, unknown>, key: string): boolean | undefined {
  return isBoolean(obj[key]) ? obj[key] : undefined;
}
function pickEnum<T>(obj: Record<string, unknown>, key: string, allowed: readonly T[]): T | undefined {
  return (allowed as readonly unknown[]).includes(obj[key]) ? (obj[key] as T) : undefined;
}
function withDefined(out: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== undefined) out[key] = value;
}

type SanitizeResult = { ok: true; payload: Record<string, unknown> } | { ok: false };

// ---------- eventType별 payload sanitizer ----------
//
// 설계 결정: 화이트리스트에 없는 "여분의 필드"는 요청을 거부하지 않고
// 조용히 버린다(reject가 아니라 drop) — 이유:
//   - payload는 자유 형식 데이터를 담는 용도이므로, 클라이언트가 향후
//     무해한 필드를 추가로 보내도(예: 새 브라우저 event sink 버전) API가
//     매번 400으로 깨지지 않아야 한다.
//   - name(project-save/open)처럼 저장하지 않기로 정한 필드를 막는 것이

//     목적이지, 클라이언트를 벌하는 것이 목적이 아니다 — drop만으로
//     "그 필드가 DB에 절대 안 들어간다"는 보안 목표는 완전히 달성된다.
//   - 테스트 가능성: 각 sanitizer가 순수 함수라 "이 필드가 들어와도 결과
//     payload에 없다"를 직접 검증할 수 있다.
// 반대로 code/parts 크기 제한처럼 명시적 상한을 넘는 경우는 예외적으로
// 이벤트 전체를 거부한다(ok:false, 결국 400) — 이는 "여분의 필드"가
// 아니라 리소스 남용 방어이므로 조용히 잘라내지 않고 명확히 실패시켜야
// 클라이언트/운영자가 문제를 알아챌 수 있다.
//
// mission 필드는 모든 이벤트에서 제거한다 — activityId(top-level, 이미
// 검증됨)가 canonical한 유일한 source이고, payload 안에 mission을 따로
// 남겨두면 activityId와 모순되는 값을 저장할 가능성 자체가 생기기
// 때문이다(0-D9 review §9의 권장 방향).
const SANITIZERS: Record<string, (p: Record<string, unknown>) => SanitizeResult> = {
  'mission-open': () => ({ ok: true, payload: {} }),
  'activity-open': (p) => {
    const out: Record<string, unknown> = {};
    withDefined(out, 'via', pickString(p, 'via'));
    return { ok: true, payload: out };
  },
  paste: (p) => {
    const out: Record<string, unknown> = {};
    withDefined(out, 'lines', pickNumber(p, 'lines'));
    return { ok: true, payload: out };
  },
  'part-add': (p) => {
    const out: Record<string, unknown> = {};
    withDefined(out, 'kind', pickString(p, 'kind'));
    withDefined(out, 'gp', pickNumber(p, 'gp'));
    return { ok: true, payload: out };
  },
  'part-move': (p) => {
    const out: Record<string, unknown> = {};
    withDefined(out, 'kind', pickString(p, 'kind'));
    withDefined(out, 'from', pickNumber(p, 'from'));
    withDefined(out, 'to', pickNumber(p, 'to'));
    return { ok: true, payload: out };
  },
  'part-remove': (p) => {
    const out: Record<string, unknown> = {};
    withDefined(out, 'kind', pickString(p, 'kind'));
    withDefined(out, 'gp', pickNumber(p, 'gp'));
    return { ok: true, payload: out };
  },
  run: (p) => {
    const code = pickString(p, 'code');
    if (code !== undefined && code.length > MAX_CODE_LENGTH) return { ok: false };
    const partsRaw = p.parts;
    let parts: string[] | undefined;
    if (partsRaw !== undefined) {
      if (!Array.isArray(partsRaw)) return { ok: false };
      if (partsRaw.length > MAX_PARTS_COUNT) return { ok: false };
      if (!partsRaw.every((x) => typeof x === 'string')) return { ok: false };
      parts = partsRaw as string[];
    }
    const out: Record<string, unknown> = {};
    withDefined(out, 'code', code);
    withDefined(out, 'parts', parts);
    return { ok: true, payload: out };
  },
  'run-end': (p) => {
    const out: Record<string, unknown> = {};
    withDefined(out, 'ok', pickBoolean(p, 'ok'));
    withDefined(out, 'ms', pickNumber(p, 'ms'));
    return { ok: true, payload: out };
  },
  error: (p) => {
    const out: Record<string, unknown> = {};
    withDefined(out, 'type', pickString(p, 'type'));
    withDefined(out, 'line', pickNullableNumber(p, 'line'));
    withDefined(out, 'msg', pickTruncatedString(p, 'msg', MAX_SHORT_TEXT_LENGTH));
    return { ok: true, payload: out };
  },
  stop: () => ({ ok: true, payload: {} }),
  checkpoint: (p) => {
    const out: Record<string, unknown> = {};
    withDefined(out, 'ok', pickBoolean(p, 'ok'));
    withDefined(out, 'msg', pickTruncatedString(p, 'msg', MAX_SHORT_TEXT_LENGTH));
    return { ok: true, payload: out };
  },
  reset: () => ({ ok: true, payload: {} }),
  // name은 절대 저장하지 않는다(학생이 프로젝트 이름에 실명을 적을 위험,
  // 0-D9 review §10) — mission과 함께 완전히 제외.
  'project-save': () => ({ ok: true, payload: {} }),
  'project-open': () => ({ ok: true, payload: {} }),
  'project-share': (p) => {
    const out: Record<string, unknown> = {};
    withDefined(out, 'length', pickNumber(p, 'length'));
    return { ok: true, payload: out };
  },
  'project-restart': () => ({ ok: true, payload: {} }),
  'real-connect': () => ({ ok: true, payload: {} }),
  'real-run': (p) => {
    const code = pickString(p, 'code');
    if (code !== undefined && code.length > MAX_CODE_LENGTH) return { ok: false };
    const out: Record<string, unknown> = {};
    withDefined(out, 'code', code);
    return { ok: true, payload: out };
  },
  'real-run-end': (p) => {
    const out: Record<string, unknown> = {};
    withDefined(out, 'ok', pickBoolean(p, 'ok'));
    withDefined(out, 'error', pickTruncatedString(p, 'error', MAX_SHORT_TEXT_LENGTH));
    return { ok: true, payload: out };
  },
  'real-save': () => ({ ok: true, payload: {} }),
  // D11-B8: AI Coach 학습 과정 이벤트. 전부 고정 enum 값만 다루고
  // 자유 텍스트/식별 정보는 담지 않는다.
  'coach-open': () => ({ ok: true, payload: {} }),
  'coach-hint': (p) => {
    const out: Record<string, unknown> = {};
    withDefined(out, 'level', pickEnum(p, 'level', [1, 2, 3] as const));
    withDefined(out, 'focus', pickEnum(p, 'focus', ['code', 'wiring', 'device-behavior', 'not-sure'] as const));
    return { ok: true, payload: out };
  },
  'coach-retry': () => ({ ok: true, payload: {} }),
  'coach-reflection': (p) => {
    const out: Record<string, unknown> = {};
    withDefined(out, 'choice', pickEnum(p, 'choice', ['re-observe', 'resolved'] as const));
    return { ok: true, payload: out };
  },
};

function isValidActivityId(v: unknown): v is string {
  return typeof v === 'string' && v.length <= MAX_ACTIVITY_ID_LENGTH && ACTIVITY_ID_PATTERN.test(v);
}

export async function handleLearningEventRequest(
  method: string | undefined,
  rawBody: string,
  cookieHeader: string | undefined | null,
  dataSource: LearningEventDataSource
): Promise<LearningEventHandlerResult> {
  // 1. POST 확인
  if (method !== 'POST') {
    return { httpStatus: 405, body: { error: 'method not allowed' } };
  }

  // 2. JSON request validation (구조적 검증만)
  let parsed: unknown;
  try {
    parsed = rawBody.length > 0 ? JSON.parse(rawBody) : undefined;
  } catch {
    return { httpStatus: 400, body: { error: 'invalid request' } };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { httpStatus: 400, body: { error: 'invalid request' } };
  }
  const body = parsed as Record<string, unknown>;

  // 3~5. student_session cookie 추출 + verifyStudentSession() + identity 확인
  const session: StudentSessionIdentity | null = verifyStudentSession(parseStudentSessionCookie(cookieHeader));
  if (!session) {
    return { httpStatus: 401, body: { error: 'unauthorized' } };
  }

  // 6. Enrollment DB consistency 확인 — 여기서 확정된 값만 이후 사용한다.
  let confirmed: StudentSessionIdentity | null;
  try {
    confirmed = await dataSource.verifyEnrollmentConsistency(session);
  } catch {
    return { httpStatus: 500, body: { error: 'internal error' } };
  }
  if (!confirmed) {
    // Enrollment가 없거나 session의 studentId/classId와 불일치 — 사유를
    // 구분해서 알려주지 않는다(학생 존재 여부/enrollment 상세를 노출하지
    // 않기 위해 401로 통일한다. 0-D7-B의 "실패 사유를 하나로 접는다"
    // 원칙과 동일).
    return { httpStatus: 401, body: { error: 'unauthorized' } };
  }

  // 7. activityId/eventType/payload validation
  if (IDENTITY_FIELD_NAMES.some((k) => k in body)) {
    // 브라우저가 studentId/enrollmentId/classId를 body에 보내는 것 자체를
    // 거부한다 — 어차피 절대 쓰지 않을 값이지만, 조용히 무시하는 대신
    // 명확히 거부해 잘못된 클라이언트 구현을 빨리 드러낸다.
    return { httpStatus: 400, body: { error: 'invalid request' } };
  }
  if (!isValidActivityId(body.activityId)) {
    return { httpStatus: 400, body: { error: 'invalid request' } };
  }
  const eventType = body.eventType;
  if (typeof eventType !== 'string' || !ALLOWED_EVENT_TYPES.has(eventType)) {
    return { httpStatus: 400, body: { error: 'invalid request' } };
  }
  const rawPayload = body.payload;
  if (rawPayload !== undefined && (typeof rawPayload !== 'object' || rawPayload === null || Array.isArray(rawPayload))) {
    return { httpStatus: 400, body: { error: 'invalid request' } };
  }
  const sanitized = SANITIZERS[eventType]((rawPayload as Record<string, unknown> | undefined) ?? {});
  if (!sanitized.ok) {
    return { httpStatus: 400, body: { error: 'invalid request' } };
  }
  const payloadJsonBytes = Buffer.byteLength(JSON.stringify(sanitized.payload), 'utf8');
  if (payloadJsonBytes > MAX_PAYLOAD_JSON_BYTES) {
    return { httpStatus: 400, body: { error: 'invalid request' } };
  }

  // 8. learning_event INSERT — identity는 반드시 6번에서 재확인된 값만 쓴다.
  try {
    await dataSource.insertLearningEvent({
      enrollmentId: confirmed.enrollmentId,
      studentId: confirmed.studentId,
      classId: confirmed.classId,
      activityId: body.activityId as string,
      eventType,
      payload: sanitized.payload,
    });
  } catch {
    return { httpStatus: 500, body: { error: 'internal error' } };
  }

  // 9. generic response
  return { httpStatus: 200, body: { status: 'ok' } };
}
