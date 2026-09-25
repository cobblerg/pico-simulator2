// 학습 이벤트 영구 저장 브라우저 sink (Stage 0-D9-C)
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
// payload } POST만 보낸다 — 배열/batch를 보내지 않는다(0-D9-B가 아직
// batch를 지원하지 않으므로).
//
// PII/identity 경계: request body에는 studentId/enrollmentId/classId를
// 절대 넣지 않는다(서버가 student_session 쿠키에서 결정 — 0-D9-B와 동일
// 경계). payload는 로그된 data 객체를 그대로 전달할 뿐, 이 파일이 임의로
// 필드를 추가하지 않는다 — Student.name/studentNo/classCode/project 자유
// 입력 name을 여기서 추가하는 코드는 없다. 최종 PII 방어선은 서버
// sanitizer다(0-D9-B에서 이미 검증됨) — 이 파일은 "무엇을 보낼지"만
// 걸러내고, "무엇을 저장할지"는 서버가 결정한다.
import { isLearningEventSinkEnabled } from './learning-event-lifecycle';

// 0-D9-B src/server/learning-event-handler.ts의 ALLOWED_EVENT_TYPES와
// 정확히 같은 20종이어야 한다 — 서버가 어차피 이 목록 밖은 400으로
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
]);

// 큐가 가득 찼을 때 우선적으로 보존할 이벤트 — 학습 성과 판정(checkpoint)과
// 실행 결과(error/run-end)는 "저가치" 이벤트보다 먼저 버려지면 안 된다.
const HIGH_PRIORITY_EVENT_TYPES = new Set(['checkpoint', 'error', 'run-end']);

const MAX_QUEUE_LENGTH = 50;
const MAX_RETRIES = 2; // 최초 시도 포함 최대 3회

type QueueItem = { activityId: string; eventType: string; payload: unknown };

const queue: QueueItem[] = [];
let processing = false;

function enqueue(item: QueueItem): void {
  if (!isLearningEventSinkEnabled()) return; // 입장 전 / "다시 입장" 시작 이후에는 아무것도 넣지 않는다

  if (queue.length >= MAX_QUEUE_LENGTH) {
    // overflow 정책: 저가치 이벤트 중 가장 오래된 것부터 버린다. 전부
    // 고가치 이벤트라 버릴 게 없으면(사실상 일어나기 어려움) 그래도
    // 상한을 지키기 위해 가장 오래된 것을 버린다.
    //
    // 중요: index 0은 절대 건드리지 않는다 — processQueue()가 지금 막
    // fetch 중이거나 다음에 꺼낼 항목이 바로 그 자리이고, 완료 후
    // queue.shift()로 제거하는 것을 전제하기 때문이다. index 0을 여기서
    // splice로 먼저 빼버리면 나중에 shift()가 엉뚱한(다음) 항목을 대신
    // 지워버리는 어긋남이 생긴다. 그래서 탐색은 항상 index 1부터 한다.
    let idx = -1;
    for (let i = 1; i < queue.length; i++) {
      if (!HIGH_PRIORITY_EVENT_TYPES.has(queue[i].eventType)) {
        idx = i;
        break;
      }
    }
    queue.splice(idx === -1 ? 1 : idx, 1);
  }

  queue.push(item);
  void processQueue();
}

type SendOutcome = 'success' | 'reject' | 'retryable' | 'unauthorized';

async function sendOne(item: QueueItem): Promise<SendOutcome> {
  try {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activityId: item.activityId, eventType: item.eventType, payload: item.payload }),
    });
    if (res.ok) return 'success';
    if (res.status === 401) return 'unauthorized'; // 현재 세션이 더 이상 유효하지 않음 — retry 금지
    if (res.status >= 500) return 'retryable';
    return 'reject'; // 400 등 — retry 금지, 이 이벤트만 포기
  } catch {
    return 'retryable'; // network error
  }
}

// 한 번에 fetch 하나만 진행한다(processing 가드) — 순서를 보존하며 API를
// 동시에 여러 개 두드리지 않는다. 지수 백오프 같은 정교한 재시도 로직은
// 만들지 않는다(LATER) — retryable이면 곧바로 다시 시도하고, MAX_RETRIES를
// 넘기면 그 이벤트만 포기하고 다음으로 넘어간다.
async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    while (queue.length > 0) {
      const item = queue[0];
      let outcome: SendOutcome = 'retryable';
      let attempt = 0;
      while (attempt <= MAX_RETRIES) {
        outcome = await sendOne(item);
        attempt++;
        if (outcome !== 'retryable') break;
      }

      if (outcome === 'unauthorized') {
        // 세션이 죽었다는 뜻이므로 남은 큐 전체가 어차피 똑같이 실패한다
        // — 하나씩 낭비하지 않고 여기서 비우고 더 이상 넣지도 않는다.
        queue.length = 0;
        break;
      }

      queue.shift();
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
