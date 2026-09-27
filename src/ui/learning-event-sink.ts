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

// D12-1C2: 401을 받은 enrollment의 자동 재시도만 멈추는 최소 상태 —
// ACTIVE/SUSPENDED 2가지 의미를 별도 enum/object 없이 이 nullable 변수
// 하나로 표현한다(D12-1C0 §4 "최소 state model" 결정 그대로). 이 값이
// activeEnrollmentId와 같으면 "현재 partition은 자동 전송을 시도하지
// 않는다"는 뜻이고, 그 외에는 아무 의미가 없다 — 여러 enrollment의
// suspend 상태를 동시에 기억할 필요가 없다: activateLearningEventQueue()가
// 항상 "방금 서버가 새로 검증한 세션"에서만 호출되므로, 어떤 enrollment가
// 다시 활성화되는 순간은 그 자체로 "재시도해도 된다"는 뜻이기 때문이다
// (한 번에 하나의 partition만 active일 수 있는 이 파일의 구조상 다른
// enrollment의 과거 suspend 여부를 별도로 기억해 둘 필요가 구조적으로
// 없다 — 자세한 근거는 D12-1C2 최종 보고서 §E 참고).
let suspendedEnrollmentId: string | null = null;

// D12-1C2: enrollmentId별 "재활성화 세대" 카운터 — activateLearningEventQueue()가
// 호출될 때마다 해당 enrollmentId의 값을 1 증가시킨다. 401 처리 도중(그
// fetch가 아직 응답을 기다리는 동안) 같은 enrollmentId가 재활성화되면,
// 그 요청이 끝난 뒤 "시작 시점의 세대와 지금 세대가 다르다"는 것으로
// 이를 감지해 곧바로 재시도한다(활성화 시각과 401 응답 도착 시각의
// 순서를 신경 쓰지 않아도 되게 만드는 장치 — 아래 processQueue() 참고).
const resumeTokens = new Map<string, number>();

// D12-1C2: enrollmentId별로 진행 중인 처리를 추적한다(기존엔 전역
// 변수 하나였다) — 이유: session 전환(§F/G/H) 시 이전 enrollment(A)의
// 요청이 아직 응답을 기다리는 중(pending)이어도, 새로 활성화된
// enrollment(B)의 처리가 그 낡은 in-flight promise 때문에 막혀서는 안
// 된다. A의 처리와 B의 처리는 서로 다른 partition이므로 독립적으로
// 동시에 진행될 수 있어야 한다 — 같은 enrollment 안에서만 "한 번에
// fetch 하나"(순서 보존) 불변식을 유지한다.
const processingPromises = new Map<string, Promise<void>>();

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

// 같은 enrollment 안에서는 한 번에 fetch 하나만 진행한다(processingPromises
// 가드, enrollmentId별) — 순서를 보존하며 API를 동시에 여러 개 두드리지
// 않는다. 지수 백오프 같은 정교한 재시도 로직은 만들지 않는다(D12-1D
// LATER) — retryable이면 곧바로 다시 시도한다.
//
// D12-1C2: 이미 진행 중인 처리가 있으면(processingPromises.get(enrollmentId))
// 새로 시작하지 않고 그 진행 중인 promise를 그대로 반환한다 — 단순
// boolean 가드였던 C1과 달리, 호출부(flushLearningEventQueue)가 "지금
// 이미 진행 중인 처리까지 포함해 실제로 끝날 때까지" 기다릴 수 있어야
// 하기 때문이다(boolean 가드만으로는 이미 진행 중인 처리를 무시하고
// 즉시 반환해버려 bounded flush가 실제 완료를 기다리지 못하는 문제가
// 생긴다).
//
// D12-1C2(§F/G/H 수정): 이 가드는 activeEnrollmentId 하나가 아니라
// enrollmentId별로 따로 추적한다(processingPromises는 Map이다) — 세션
// 전환(학생 A -> B) 시 A의 요청이 아직 응답을 기다리는 중이어도, 새로
// 활성화된 B의 처리가 A의 낡은 in-flight promise 때문에 막히면 안 되기
// 때문이다. 전역 변수 하나였을 때는 A가 pending인 동안 B의 processQueue()
// 호출이 A의 promise를 그대로 반환해버려 B의 이벤트가 전혀 전송되지
// 않는 버그가 있었다(디버그 재현으로 확인).
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
// D12-1C2 401 정책(핵심 수정): 더 이상 큐를 비우지 않는다. 이 partition을
// suspendedEnrollmentId로 표시해 자동 재시도만 멈추고, durable queue는
// 그대로 둔다(NO SILENT LOSS) — 동시에 이 partition이 다시 active로
// 전송을 시도하는 경로 자체가 없으므로(§enqueue의 suspend 확인) 다른
// enrollment로 잘못 전송될 위험도 없다(NO MISATTRIBUTION). suspend는
// activateLearningEventQueue()가 같은 enrollment를 다시 활성화할 때만
// 해제된다.
function processQueue(): Promise<void> {
  if (!activeEnrollmentId) return Promise.resolve();
  const enrollmentId = activeEnrollmentId;

  const existing = processingPromises.get(enrollmentId);
  if (existing) return existing;

  // 재현된 버그와 그 근본 수정: 큐가 이미 비어 있으면 아래 promise 캐싱
  // 기계장치 자체를 전혀 건드리지 않고 즉시 반환한다. 이유 — 만약 여기서
  // 그냥 `run = (async () => {...})()`를 항상 만든다면, 큐가 비어 있어
  // while 루프가 await를 한 번도 거치지 않고 동기적으로 끝나는 경우
  // `run`은 이미 완전히 settle된 채로 반환된다. 그 뒤 `run.finally(cb)`의
  // cb는 스펙상 반드시 microtask로 미뤄져 실행되므로, "이 함수가 반환된
  // 직후, 같은 동기 tick 안에서" 또 다른 진짜 작업(예: 곧바로 이어지는
  // enqueue)이 processQueue()를 다시 부르면, 그 cb가 아직 실행되지 않아
  // processingPromises에 이 enrollmentId 항목이 여전히(방금 끝난) 남아있어
  // 새 작업이 막혀버린다. 반면 실제로 전송할 item이 있어
  // `await sendOne(...)`을 한 번이라도 거치면, run은 정의상 진짜
  // 비동기이므로 이 경합이 구조적으로 발생할 수 없다(완료 시점은 항상
  // 나중 tick) — 그래서 "비어 있는 큐"라는 이 한 가지 경우만 앞서
  // 걸러내는 것으로 충분하다.
  if (readQueue(enrollmentId).length === 0) return Promise.resolve();

  const run = (async () => {
    try {
      while (true) {
        const current = readQueue(enrollmentId);
        if (current.length === 0) break;
        const item = current[0];

        // 이 attempt를 시작하기 "직전"의 재활성화 세대를 기록해 둔다 — 401
        // 응답이 오는 사이에 activateLearningEventQueue()가 호출됐는지를
        // 아래에서 판단하기 위함이다(§resume token).
        const tokenBeforeSend = resumeTokens.get(enrollmentId) ?? 0;

        let outcome: SendOutcome = 'retryable';
        let attempt = 0;
        while (attempt <= MAX_RETRIES) {
          outcome = await sendOne(item);
          attempt++;
          if (outcome !== 'retryable') break;
        }

        if (outcome === 'unauthorized') {
          // D12-1C2 §E: 이 401 응답을 기다리는 동안 같은 enrollment가 이미
          // 재활성화됐다면(세대가 바뀌었다면), 그 세션은 지금 다시 유효한
          // 것으로 확인된 것이다 — suspend 처리하지 않고 곧바로(같은
          // item·같은 clientEventId로) 다시 시도한다. activateLearningEventQueue()
          // 쪽의 "suspendedEnrollmentId 해제"가 이 401 판정보다 먼저
          // 일어났는지 나중에 일어났는지 순서에 의존하지 않게 해준다.
          if ((resumeTokens.get(enrollmentId) ?? 0) !== tokenBeforeSend) {
            continue;
          }
          // durable queue를 비우지 않는다(D12-1C0/§3 핵심 수정) — 이
          // partition의 자동 재시도만 멈춘다.
          suspendedEnrollmentId = enrollmentId;
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
    } catch {
      // 이 루프 안 어디에서도 의도적으로 throw하지 않지만(readQueue/
      // writeQueue/sendOne 모두 자체적으로 실패를 값으로 반환), 방어적으로
      // 예외를 삼켜 processingPromise 정리가 항상 실행되게 한다.
    }
  })();

  const tracked = run.finally(() => {
    processingPromises.delete(enrollmentId);
  });
  processingPromises.set(enrollmentId, tracked);

  return tracked;
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

  // D12-1C2: 이 partition이 401로 suspend된 상태라면 새 이벤트도 durable
  // queue에는 그대로 쌓이지만(NO SILENT LOSS — 위 writeQueue는 이미
  // 끝났다) 자동 전송은 시도하지 않는다 — 죽은 세션에 계속 요청을
  // 보내지 않기 위함이다. 같은 enrollment가 다시 정상적으로 accepted되어
  // activateLearningEventQueue()가 suspend를 해제해야만 이 큐(신규 item
  // 포함)가 재개된다.
  if (enrollmentId === suspendedEnrollmentId) return;

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
//
// D12-1C2: 이 함수는 항상 "서버가 방금 새로 검증한 세션"에서만 호출된다
// (accepted 직후 / F5로 기존 세션을 이어받을 때 / 로그아웃 실패로 같은
// 학생이 계속 쓸 때) — 즉 이 함수가 호출된다는 사실 자체가 "이
// enrollment의 세션이 지금 유효하다"는 것을 뜻하므로, 이전에 401로
// suspend되어 있었더라도 여기서 해제하고 재개하는 것이 안전하다(§6
// same-enrollment recovery).
export function activateLearningEventQueue(enrollmentId: string): void {
  activeEnrollmentId = enrollmentId;
  if (suspendedEnrollmentId === enrollmentId) {
    suspendedEnrollmentId = null;
  }
  // D12-1C2 §E 재활성화 race 수정: 위 두 줄이 실행되는 시점에 "이
  // enrollmentId의 이전 401 처리"가 아직 끝나지 않았을 수 있다(그 요청이
  // 아직 in-flight면 suspendedEnrollmentId는 아직 null이라 위 조건이
  // 아무 효과가 없다). resumeTokens를 bump해 두면, 나중에 그 in-flight
  // 요청이 401로 끝나는 순간 "그사이 재활성화가 있었는지"를 검사해 바로
  // 재시도하도록 processQueue()가 처리한다(아래 §resume token 참고).
  resumeTokens.set(enrollmentId, (resumeTokens.get(enrollmentId) ?? 0) + 1);
  void processQueue(); // 복원된 durable queue가 있으면 즉시 재개(§6 recovery)
}

// D12-1C2: 로그아웃 직전, 아직 유효한 현재 세션으로 durable queue를 한 번
// bounded 시도로 flush한다(D12-1C0 §J 로그아웃 정책) — 로그아웃이 끝나면
// 이 세션으로는 더 이상 정당하게 보낼 방법이 없으므로 이 시점이 마지막
// 기회다. network delivery 때문에 로그아웃 자체가 무기한 지연되면 안
// 되므로 작은 고정 timeout으로 제한한다(지수 백오프 등 정교한 정책은
// D12-1D 범위 — 여기서는 만들지 않는다).
//
// enrollmentId가 현재 활성 partition과 다르면 아무것도 하지 않는다 —
// 이 함수도 activeEnrollmentId가 가리키는 partition만 다루며, 다른
// enrollment의 큐를 절대 건드리지 않는다(cross-enrollment isolation 유지).
//
// 실패/timeout 모두 durable queue를 그대로 남긴다(성공적으로 ACK된
// 항목만 processQueue 내부에서 제거된다) — flush 자체가 실패해도 이
// 함수는 예외를 던지지 않는다(호출부가 로그아웃 API 진행 여부를
// flush 성공 여부에 의존하지 않는다, §7).
const LOGOUT_FLUSH_TIMEOUT_MS = 2000;

export async function flushLearningEventQueue(enrollmentId: string): Promise<void> {
  if (activeEnrollmentId !== enrollmentId) return;
  await Promise.race([processQueue(), new Promise<void>((resolve) => setTimeout(resolve, LOGOUT_FLUSH_TIMEOUT_MS))]);
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
