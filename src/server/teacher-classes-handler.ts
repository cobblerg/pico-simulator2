// Public GET/POST /api/teacher/classes 요청 처리 로직 (Stage 0-D10-B, POST는
// D11-C2에서 추가)
//
// 이 파일은 순수 함수다 — Vercel/Node HTTP 타입에 의존하지 않는다.
// api/teacher/classes.ts(얇은 HTTP 어댑터)가 이 함수를 감싼다.
//
// GET의 목적은 "이 교사가 담당하는 학급 목록"만 반환하는 것이다 — 학생
// 목록/timeline/feedback은 이번 단계 범위 밖이다(0-D10-B design review
// §범위). POST의 목적은 "이 교사의 새 학급을 생성"하는 것이다(D11-C0
// Product Contract §D 권장안 그대로) — roster/학생 등록은 D11-C3 범위이며
// 이 파일에 추가하지 않는다(D11-C2 YAGNI).
//
// 흐름(GET/POST 공통): Authorization 헤더 → extractBearerToken() → 토큰
// 무효면 즉시 401. 유효하면 resolveTeacherFromAccessToken()으로 teacherId를
// 서버가 직접 확보한다(teacher-me-handler.ts와 동일한 재사용) — 이 handler
// 안 어디에도 브라우저가 보낸 teacherId를 받는 코드 경로가 없다(POST body에도
// teacherId 필드를 두지 않는다 — 클라이언트가 보내도 무시된다).
//
// 응답 설계: "인증 실패(401)"와 "인증은 성공했지만 미승인(200
// not_approved)"을 /api/teacher/me와 동일한 규약으로 GET/POST 모두에서
// 유지한다 — endpoint마다 다른 규약을 쓰면 브라우저가 여러 판단 로직을
// 가져야 하므로 일관성을 깬다. auth_user_id나 다른 내부 DB 상태는 어떤
// 분기에서도 응답에 넣지 않는다.
import { SupabaseClient } from '@supabase/supabase-js';
import { extractBearerToken, resolveTeacherFromAccessToken } from './teacher-session';
import { listTeacherClasses, TeacherClassSummary } from './teacher-authorization';
import { createTeacherClassWithGeneratedCode } from './teacher-class-creation';

export type TeacherClassesHandlerResult = { httpStatus: number; body: unknown };

const SMALLINT_MIN = -32768;
const SMALLINT_MAX = 32767;

// school_class.grade/class_number는 DB에 smallint로 저장된다(migration
// 20260925090000) — 이 범위를 넘는 값은 어차피 insert 시 DB 에러가 되므로
// handler 단계에서 미리 걸러낸다. 이 이상의 "학년/반 번호다운" 범위(예: 1~6)는
// 스키마가 강제하지 않는 임의 정책이라 여기서 새로 만들지 않는다(D11-C0/C2
// "arbitrary max를 임의로 만들지 않는다" 원칙).
function isValidCreateClassBody(v: unknown): v is { schoolYear: string; grade: number; classNumber: number } {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as { schoolYear?: unknown; grade?: unknown; classNumber?: unknown };
  if (typeof c.schoolYear !== 'string' || c.schoolYear.trim().length === 0) return false;
  if (typeof c.grade !== 'number' || !Number.isInteger(c.grade) || c.grade < SMALLINT_MIN || c.grade > SMALLINT_MAX) return false;
  if (
    typeof c.classNumber !== 'number' ||
    !Number.isInteger(c.classNumber) ||
    c.classNumber < SMALLINT_MIN ||
    c.classNumber > SMALLINT_MAX
  ) {
    return false;
  }
  return true;
}

export async function handleTeacherClassesRequest(
  method: string | undefined,
  authorizationHeader: string | undefined | null,
  rawBody: string,
  client: SupabaseClient
): Promise<TeacherClassesHandlerResult> {
  if (method !== 'GET' && method !== 'POST') {
    return { httpStatus: 405, body: { error: 'method not allowed' } };
  }

  const token = extractBearerToken(authorizationHeader);
  if (!token) {
    return { httpStatus: 401, body: { error: 'unauthorized' } };
  }

  let resolved;
  try {
    resolved = await resolveTeacherFromAccessToken(client, token);
  } catch {
    return { httpStatus: 500, body: { error: 'internal error' } };
  }

  if (resolved.status === 'invalid-token') {
    return { httpStatus: 401, body: { error: 'unauthorized' } };
  }
  if (resolved.status === 'not-approved') {
    return { httpStatus: 200, body: { status: 'not_approved' } };
  }

  // 이 시점의 resolved.teacher.teacherId만이 신뢰할 수 있는 teacherId다 —
  // 아래 두 분기 모두 이 값 외에는 어떤 것도 넘기지 않는다.
  if (method === 'POST') {
    let parsed: unknown;
    try {
      parsed = rawBody.length > 0 ? JSON.parse(rawBody) : undefined;
    } catch {
      return { httpStatus: 400, body: { error: 'invalid json' } };
    }

    if (!isValidCreateClassBody(parsed)) {
      // classCode는 요청 body에서 절대 받지 않는다 — 클라이언트가 보내도
      // isValidCreateClassBody가 검사하는 필드에 없으므로 조용히 무시된다.
      return { httpStatus: 400, body: { error: 'invalid request' } };
    }

    let created;
    try {
      created = await createTeacherClassWithGeneratedCode(client, resolved.teacher.teacherId, {
        schoolYear: parsed.schoolYear.trim(),
        grade: parsed.grade,
        classNumber: parsed.classNumber,
      });
    } catch {
      return { httpStatus: 500, body: { error: 'internal error' } };
    }

    if (created.status === 'ok') {
      const summary: TeacherClassSummary = created.schoolClass;
      return { httpStatus: 200, body: { status: 'ok', schoolClass: summary } };
    }
    // code-exhausted/insert-failed/ownership-failed 모두 내부 DB detail 없이
    // 동일한 controlled 500으로 응답한다 — 원인 구분은 서버 로그(§8의
    // compensation 실패 로그 등) 안에서만 이루어진다.
    return { httpStatus: 500, body: { error: 'internal error' } };
  }

  // 이 시점의 resolved.teacher.teacherId만이 신뢰할 수 있는 teacherId다 —
  // listTeacherClasses()에 이 값 외에는 어떤 것도 넘기지 않는다.
  let classes: TeacherClassSummary[];
  try {
    classes = await listTeacherClasses(client, resolved.teacher.teacherId);
  } catch {
    return { httpStatus: 500, body: { error: 'internal error' } };
  }

  return { httpStatus: 200, body: { status: 'ok', classes } };
}
