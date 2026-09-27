// 학습 이벤트 영구 저장 브라우저 sink (Stage 0-D9-C, durable queue core: D12-1C1)
//
// 기존 logEvent()/picosim:event 확장 지점을 그대로 쓴다 — app.ts의
// logEvent() 자체는 딱 한 줄(activityId 추가, §activityId 설명 참고)만
// 고쳤고, learningLog/picosim:event의 기존 shape과 소비 방식은 그대로다.
// 이 파일은 window의 'picosim:event' 리스너를 하나 더 등록할 뿐이다.
//
//   기존:  logEvent() → learningLog / picosim:event
//   추가:                          picosim:event → learning-event-sink → /api/events
//
// 시뮬레이터 실행/편집/UI는 이 sink의 네트워크 요청을 절대 기다리지
// 않는다 — enqueue()는 항상 동기적으로 즉시 반환하고, 실제 전송은 큐
// 처리 루프가 비동기로(await 없이 fire-and-forget 호출) 수행한다.
//
// 0-D9-B Event API 계약을 그대로 존중한다: 단건 { activityId, eventType,
// payload, clientEventId } POST만 보낸다 — 배열/batch를 보내지 않는다.
//
// PII/identity 경계: request body에는 studentId/enrollmentId/classId를
// 절대 넣지 않는다(서버가 student_session 쿠키에서 결정 — 0-D9-B와 동일
// 경계). payload는 로그된 data 객체를 그대로 전달할 뿐, 이 파일이 임의로
// 필드를 추가하지 않는다 — Student.name/studentNo/classCode/project 자유
// 입력 name을 여기서 추가하는 코드는 없다. 최종 PII 방어선은 서버
// sanitizer다(0-D9-B에서 이미 검증됨) — 이 파일은 "무엇을 보낼지"만
// 걸러내고, "무엇을 저장할지"는 서버가 결정한다.
//
// ---------- D12-1C1: durable queue core ----------
//
// D12-1C0(설계 게이트) 결정 그대로:
//   - 큐 partition key는 enrollmentId다(picosim:event-queue:${enrollmentId}).
//     이 파일은 절대 이 값을 identity로 서버에 보내지 않는다 — 오직
//     "이 브라우저가 지금 어느 큐를 다시 시도해도 되는가"를 결정하는
//     로컬 게이트일 뿐이다(server identity/authorization과 무관, D12-1C0
//     §H "NON-NEGOTIABLE TRUST BOUNDARY" 그대로).
//   - 현재 활성화된 enrollmentId 이외의 picosim:event-queue:* key는 이
//     파일이 절대 읽지/전송하지/지우지 않는다(C1 범위 — cross-enrollment
//     isolation). session 전환 시 이전 큐를 suspend하는 정책은 C2 범위다.
//   - localStorage가 유일한 source of truth다 — 별도의 지속적인 in-memory
//     queue 배열을 두지 않는다. 모든 연산(enqueue/ack 제거/재시도)이 매번
//     localStorage를 다시 읽고 쓴다 — 두 저장소가 서로 diverge할 방법
//     자체를 없앤다(§F "PERSIST-BEFORE-SEND"의 "두 군데가 되어 서로
//     diverge하지 않도록" 요구사항을 이 방식으로 만족).
//   - ACK 제거는 "매번 최신 상태를 다시 읽어 특정 clientEventId만
//     필터링"하는 방식으로 한다(전체 배열을 통째로 덮어쓰지 않음) —
//     여러 탭이 동시에 flush할 때 한쪽의 stale snapshot이 다른 쪽이 방금
//     추가/제거한 항목을 잃어버리게 만드는 lost-update를 막는다(D12-1C0
//     §J/§11 분석).
import { isLearningEventSinkEnabled } from './learning-event-lifecycle';

// 0-D9-B src/server/learning-event-handler.ts의 ALLOWED_EVENT_TYPES와
// 정확히 같은 25종이어야 한다 — 서버가 어차피 이 목록 밖은 400으로
// 거부하지만, 여기서 먼저 걸러야 불필요한 네트워크 요청 자체가 없다.
// teacher-*(교사 조작), repl(자유 입력 PII), open/tab/copy-code/
// download-main/project-export(낮은 교육적 가치)는 제외한다.
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
  // D11-B11: 교사 feedback에서 "확인하고 다시 해보기"를 선택했다는 사실만
  // 기록한다.
  'feedback-retry',
]);

// 큐가 가득 찼을 때 우선적으로 보존할 이벤트 — 학습 성과 판정(checkpoint)과
// 실행 결과(error/run-end)는 "저가치" 이벤트보다 먼저 버려지면 안 된다.
const HIGH_PRIORITY_EVENT_TYPES = new Set(['checkpoint', 'error', 'run-end']);

const MAX_QUEUE_LENGTH = 50;
const MAX_RETRIES = 2; // 최초 시도 포함 최대 3회

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// durable queue에 실제로 저장되는 최소 shape(D12-1C0 §M 그대로) —
// student name/studentNo/classCode/studentId/enrollmentId/classId는
// 절대 이 안에 넣지 않는다(§13). createdAt은 서버에는 보내지 않는다
// (§4/§N) — C3(retention)를 위한 순수 로컬 부기 값이다.
type DurableQueueItem = {
  clientEventId: string;
  activityId: string;
  eventType: string;
  payload: unknown;
  createdAt: number;
};

function storageKey(enrollmentId: string): string {
  return `picosim:event-queue:${enrollmentId}`;
}

function isValidQueueItem(v: unknown): v is DurableQueueItem {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.clientEventId === 'string' &&
    UUID_PATTERN.test(c.clientEventId) &&
    typeof c.activityId === 'string' &&
    c.activityId.length > 0 &&
    typeof c.eventType === 'string' &&
    ALLOWED_EVENT_TYPES.has(c.eventType) &&
    'payload' in c &&
    typeof c.createdAt === 'number' &&
    Number.isFinite(c.createdAt)
  );
}

// 손상된 저장값(invalid JSON, 배열이 아님, item shape 이상) 때문에 앱이
// 깨지면 안 되지만, 손상된 큐를 조용히 정상 학습기록처럼 취급해서도 안
// 된다(§12) — item 단위로 검증해 유효한 항목만 보존하고, 무효한 항목은
// 그냥 버린다(그 항목만 사라질 뿐 나머지 valid item은 보존된다, §12 P).
function readQueue(enrollmentId: string): DurableQueueItem[] {
  let raw: string | null;
  try {
    raw = localStorage.getItem(storageKey(enrollmentId));
  } catch {
    return [];
  }
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return []; // 손상된 JSON — 크래시시키지 않고 빈 큐로 취급
  }
  if (!Array.isArray(parsed)) return [];

  return parsed.filter(isValidQueueItem);
}

// 실패해도(예: storage quota 초과) throw하지 않는다 — 호출부가 반환값으로
// 성공 여부를 판단해 "durable하게 기록되지 않은 이벤트는 전송을 시도하지
// 않는다"는 §5 invariant를 지키게 한다.
function writeQueue(enrollmentId: string, items: DurableQueueItem[]): boolean {
  try {
    if (items.length === 0) {
      localStorage.removeItem(storageKey(enrollmentId));
    } else {
      localStorage.setItem(storageKey(enrollmentId), JSON.stringify(items));
    }
    return true;
  } catch {
    return false;
  }
}

// 특정 clientEventId 하나만 제거한다 — 제거 직전에 항상 최신 상태를 다시
// 읽는다(§J 멀티탭 분석: 이 사이 다른 탭이 새 item을 추가했더라도 그
// item은 이 필터링에서 살아남는다 — position 기반 slice(1)을 쓰지 않는
// 이유가 바로 이것이다).
function removeItemById(enrollmentId: string, clientEventId: string): void {
  const fresh = readQueue(enrollmentId);
  const remaining = fresh.filter((i) => i.clientEventId !== clientEventId);
  writeQueue(enrollmentId, remaining);
}

// 현재 활성화된 enrollment — 이 값 이외의 어떤 picosim:event-queue:* key도
// 이 모듈은 절대 읽지/전송하지/지우지 않는다(§3 cross-enrollment
// isolation, C1 범위에서는 다른 key를 나열(enumerate)하지도 않는다).
let activeEnrollmentId: string | null = null;
let processing = false;

type SendOutcome = 'success' | 'reject' | 'retryable' | 'unauthorized';

// res.ok(200)는 D12-1B 서버 계약상 created/duplicate 둘 다를 의미한다 —
// 응답 body를 파싱하지 않고 status만으로 판단해도 §7의 "둘 다 ACK"
// 요구사항을 그대로 만족한다.
async function sendOne(item: DurableQueueItem): Promise<SendOutcome> {
  try {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activityId: item.activityId,
        eventType: item.eventType,
        payload: item.payload,
        clientEventId: item.clientEventId,
      }),
    });
    if (res.ok) return 'success'; // 200 created 또는 200 duplicate — 둘 다 ACK
    if (res.status === 401) return 'unauthorized'; // 현재 세션이 더 이상 유효하지 않음 — retry 금지
    if (res.status >= 500) return 'retryable';
    return 'reject'; // 400/409 등 — retry 금지, 이 이벤트만 포기(§Q)
  } catch {
    return 'retryable'; // network error
  }
}

// 한 번에 fetch 하나만 진행한다(processing 가드) — 순서를 보존하며 API를
// 동시에 여러 개 두드리지 않는다. 지수 백오프 같은 정교한 재시도 로직은
// 만들지 않는다(D12-1D LATER) — retryable이면 곧바로 다시 시도한다.
//
// D12-1C1 변경점(기존 in-memory 큐 시절과의 차이, 명시적으로 기록): 기존
// 코드는 MAX_RETRIES를 다 소진해도 여전히 'retryable'이면 그 item을
// 포기(discard)했다. durable queue의 존재 이유 자체가 "네트워크가 나중에
// 복구되면 다시 보낸다"이므로, 그 의미를 지키려면 재시도를 다 소진한
// 뒤에도 이 item을 버리지 않고 큐 맨 앞에 그대로 둔 채 루프 전체를
// 멈춰야 한다(순서 보존 — 뒤 item을 새치기해서 보내지 않는다). 다음
// enqueue나 재초기화(활성화)가 processQueue()를 다시 호출할 때 이
// item부터 다시 시도한다. 이것이 test H/I(network/5xx 소진 시 durable
// item 보존)가 요구하는 동작이다.
//
// 401(unauthorized)은 기존 동작을 그대로 보존한다 — 그 학급/학생의 큐
// 전체를 비운다. 이는 C2(session/401 정책 재설계, suspend-not-delete)가
// 명시적으로 교체할 자리로 남겨둔 것이며, 이번 C1에서 새로 만든 문제가
// 아니다(오늘의 in-memory 큐도 401에서 동일하게 전체 폐기했다 — 동작을
// 그대로 이식했을 뿐 durable화로 인해 더 악화되지 않았다).
async function processQueue(): Promise<void> {
  if (processing) return;
  if (!activeEnrollmentId) return;
  const enrollmentId = activeEnrollmentId;
  processing = true;
  try {
    while (true) {
      const current = readQueue(enrollmentId);
      if (current.length === 0) break;
      const item = current[0];

      let outcome: SendOutcome = 'retryable';
      let attempt = 0;
      while (attempt <= MAX_RETRIES) {
        outcome = await sendOne(item);
        attempt++;
        if (outcome !== 'retryable') break;
      }

      if (outcome === 'unauthorized') {
        // TODO(D12-1C2): suspend-not-delete로 교체 예정. 지금은 기존
        // in-memory 큐와 동일한 동작(전체 폐기)을 그대로 유지한다.
        writeQueue(enrollmentId, []);
        break;
      }

      if (outcome === 'retryable') {
        // 재시도를 모두 소진했다 — discard하지 않고 큐 맨 앞에 남긴 채
        // 전체 처리를 멈춘다(순서 보존, 위 주석 참고).
        break;
      }

      // success(created/duplicate ACK) 또는 reject(4xx, 401 제외) — 둘
      // 다 이 item을 큐에서 제거한다.
      removeItemById(enrollmentId, item.clientEventId);
      if (outcome !== 'success') {
        // 학생 화면에는 아무것도 보여주지 않는다(alert/dialog 금지) —
        // 개발용 console.warn만, eventType 외에는 토큰/PII/payload
        // 전체를 출력하지 않는다.
        console.warn(`[picosim] learning event 저장 실패(${item.eventType}): ${outcome}`);
      }
    }
  } finally {
    processing = false;
  }
}

function enqueue(item: { activityId: string; eventType: string; payload: unknown }): void {
  if (!isLearningEventSinkEnabled()) return; // 입장 전 / "다시 입장" 시작 이후에는 아무것도 넣지 않는다
  if (!activeEnrollmentId) return; // sink가 활성화됐는데 enrollment가 아직 없는 비정상 상태 방어

  const enrollmentId = activeEnrollmentId;
  const current = readQueue(enrollmentId);

  // overflow 정책은 기존과 완전히 동일하다(이번 단계에서 정책 자체를
  // 바꾸지 않는다, §10) — 다만 이제는 evict 대상이 이미 durable하게
  // 저장돼 있던 item이라는 점이 기존과 다르다(기존엔 메모리에서만
  // 사라졌다). 전체 손실 위험을 기존보다 악화시키지는 않는다 — 큐가
  // 50개까지 찬 상태는 이미 새로고침 한 번으로도 전부 잃을 수 있던
  // 상태였다.
  if (current.length >= MAX_QUEUE_LENGTH) {
    let idx = -1;
    for (let i = 1; i < current.length; i++) {
      if (!HIGH_PRIORITY_EVENT_TYPES.has(current[i].eventType)) {
        idx = i;
        break;
      }
    }
    current.splice(idx === -1 ? 1 : idx, 1);
  }

  const durableItem: DurableQueueItem = {
    clientEventId: crypto.randomUUID(),
    activityId: item.activityId,
    eventType: item.eventType,
    payload: item.payload,
    createdAt: Date.now(),
  };
  current.push(durableItem);

  // PERSIST-BEFORE-SEND(§5의 핵심 invariant): localStorage 기록이 실패하면
  // 이 이벤트는 durable하다고 간주하지 않으며, network send도 시도하지
  // 않는다 — "저장되지 않았는데 전송을 시도"하는 순서 역전을 만들지
  // 않는다.
  const persisted = writeQueue(enrollmentId, current);
  if (!persisted) return;

  void processQueue();
}

// student-entry-ui.ts가 (1) 정상 입장 accepted 직후, (2) F5로 기존
// StudentContext를 이어받을 때, (3) 로그아웃 실패로 같은 학생이 계속 쓰게
// 될 때 — 기존 enableLearningEventSink()와 함께 호출한다. enrollmentId는
// 오직 "어느 로컬 파티션을 다시 시도해도 되는가"를 정하는 값일 뿐,
// 서버로 전송되지도 서버 identity 판단에 관여하지도 않는다(§2/§H).
//
// 같은 enrollmentId로 다시 호출해도 안전하다(idempotent) — localStorage가
// 유일한 source of truth이므로 다시 읽어도 상태가 갈라지지 않는다.
export function activateLearningEventQueue(enrollmentId: string): void {
  activeEnrollmentId = enrollmentId;
  void processQueue(); // 복원된 durable queue가 있으면 즉시 재개(§6 recovery)
}

// activityId 결정: app.ts의 logEvent()가 dispatch 시점의 현재 mission.id를
// 이벤트 자체(ev.activityId)에 이미 실어 보낸다 — part-add/part-move/
// part-remove/reset/real-*처럼 개별 data payload에 mission이 없는
// 이벤트도 이 필드 하나로 항상 정확한 activityId를 얻는다. 이 sink는
// app.ts의 내부 mutable 변수(mission 등)에 전혀 결합되지 않는다 — 오직
// event.detail.activityId만 읽는다.
export function initLearningEventSink(): void {
  window.addEventListener('picosim:event', (e) => {
    const detail = (e as CustomEvent).detail as { type?: unknown; data?: unknown; activityId?: unknown } | undefined;
    if (!detail || typeof detail.type !== 'string') return;
    if (!ALLOWED_EVENT_TYPES.has(detail.type)) return;
    if (typeof detail.activityId !== 'string' || detail.activityId.length === 0) return; // 정상적으로는 항상 존재함 — 방어적 확인
    enqueue({ eventType: detail.type, activityId: detail.activityId, payload: detail.data ?? {} });
  });
}
