// 학생용 "선생님 피드백" 조회 (Stage D11-B10)
//
// student_session(HttpOnly 쿠키)만을 identity 근거로 삼는다 — 이 모듈은
// studentId/enrollmentId/classId 같은 어떤 값도 request에 넣지 않는다
// (GET, body 없음, 쿠키는 same-origin fetch가 자동으로 포함).
//
// 이 모듈은 app.ts/student-entry-ui.ts를 전혀 import하지 않는 독립 leaf
// 모듈이다 — student-entry-ui.ts가 이미 app.ts에 의해 import되므로, 만약
// 이 모듈을 student-entry-ui.ts가 아니라 app.ts가 직접 호출하려 했다면
// 문제가 없었겠지만, "학생 세션이 확정된 시점"을 이미 알고 있는 쪽은
// student-entry-ui.ts(enableLearningEventSink()를 호출하는 바로 그
// 지점들)이므로 그쪽에서 이 모듈의 loadStudentFeedback()을 직접 호출한다
// (workspace-autosave.ts/learning-event-lifecycle.ts와 동일하게, 순환
// import를 피하기 위해 이 모듈이 student-entry-ui.ts를 참조하지 않는
// 방향으로만 의존한다).
//
// XSS 방지: 교사가 입력한 content는 항상 textContent로만 렌더한다 —
// innerHTML에 절대 넣지 않는다(teacher-app.ts의 renderFeedbackList()와
// 동일한 원칙).
//
// D11-B11: [확인하고 다시 해보기] 버튼은 POST /api/events(기존 learning
// event endpoint, 새 API route 아님)를 직접 호출한다 — learning-event-
// sink.ts의 큐(picosim:event → enqueue)를 거치지 않는다. 그 큐는 의도적으로
// "학생 화면에는 성공/실패를 절대 보여주지 않는다"는 설계(fire-and-forget,
// 실패해도 console.warn만)라, 이 버튼이 요구하는 "클릭 → 성공/실패 표시"
// UX 및 §7의 cross-student 보안 테스트(400을 학생이 실제로 관찰 가능해야
// 함)와 근본적으로 맞지 않는다. 대신 request shape(activityId/eventType/
// payload)은 sink와 완전히 동일하게 맞춰 서버 입장에서는 같은 경로다.
// learning-event-sink.ts의 ALLOWED_EVENT_TYPES에도 feedback-retry를 추가해
// 목록 일관성은 유지한다(향후 다른 경로가 picosim:event로 이 타입을 쏘더라도
// sink가 조용히 버리지 않도록).
//
// D12-1C4: 이 direct 경로에도 D12-1B의 clientEventId idempotency를
// 적용한다 — response가 유실돼도(서버는 저장에 성공했지만 학생 브라우저가
// 응답을 못 받은 경우) 같은 버튼을 다시 눌렀을 때 중복 learning_event가
// 생기지 않는다. learning-event-sink.ts의 durable queue로 이 경로를
// 옮기지는 않는다(§6 — 여전히 direct, synchronous UX를 유지한다).
type StudentFeedbackItem = { id: string; content: string; createdAt: string; updatedAt: string };
type StudentFeedbackResponse = { status: 'ok'; feedback: StudentFeedbackItem[] } | { status: string };

function el<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

type SFState = 'loading' | 'empty' | 'error' | 'result';

function setState(state: SFState): void {
  const loadingEl = el('sf-loading');
  const emptyEl = el('sf-empty');
  const errorEl = el('sf-error');
  const listEl = el('sf-list');
  if (loadingEl) loadingEl.hidden = state !== 'loading';
  if (emptyEl) emptyEl.hidden = state !== 'empty';
  if (errorEl) errorEl.hidden = state !== 'error';
  if (listEl) listEl.hidden = state !== 'result';
}

function showError(): void {
  // 서버 상세정보(401/500/network 등)를 구분해 보여주지 않는다 — 학생
  // 화면에는 항상 같은 일반 메시지만 노출한다(0-D11-A의 AI 분석 에러
  // 처리와 동일한 원칙: provider/서버 세부사항을 브라우저에 노출하지
  // 않는다).
  const errorMsgEl = el('sf-error-msg');
  if (errorMsgEl) errorMsgEl.textContent = '피드백을 불러오지 못했습니다.';
  setState('error');
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' });
}

// activityId는 다른 모든 이벤트(part-add/reset/coach-* 등)와 동일하게
// "학생이 클릭한 순간에 열려 있던 mission"을 그대로 쓴다 — feedback이
// 가리키는 mission을 추론하거나 그쪽으로 이동시키는 것이 아니다(D11-B11
// §11: mission 자동 연결/navigation 금지). app.ts를 import하지 않으므로
// 이미 렌더된 mission 목록 DOM(.m-item.cur, app.ts가 채우는 data-m 속성)에서
// 직접 읽는다 — app.ts의 내부 상태(mission 변수)에 결합되지 않는다는 점은
// learning-event-sink.ts가 activityId를 다루는 방식과 동일한 원칙이다.
function getCurrentActivityId(): string | null {
  const cur = document.querySelector<HTMLElement>('.m-item.cur');
  return cur?.dataset.m || null;
}

// D12-1C4: 이 버튼 인스턴스 하나("하나의 logical feedback-retry action")에
// 대응하는 clientEventId를 보관한다 — render()가 feedback item마다 하나씩
// 새로 만들어 handleRetryClick()과 공유한다. localStorage 등 durable
// storage는 쓰지 않는다(§10 범위 밖 — 페이지를 새로고침하면 이 상태는
// 사라지고, 다음 렌더의 새 버튼·새 state가 자연히 새로운 logical action이
// 된다). learning-event-sink.ts의 durable queue와도 통합하지 않는다(§6).
type RetryState = { clientEventId: string | null };

// [확인하고 다시 해보기] 클릭 처리. 성공/실패를 이 버튼 하나에만 반영한다
// — 카드 전체(loading/empty/error/result)나 다른 feedback 항목에는 영향을
// 주지 않는다. 이 상태는 세션(현재 페이지 렌더) 동안만 유지되는 순수 UI
// 상태다 — DB에 read/unread로 저장하지 않고, localStorage에도 저장하지
// 않는다(요구사항 §9/§10 그대로).
//
// D12-1C4: focused idempotency test(clientEventId 생성/재사용 경계)를 위해
// export한다 — render()를 거친 실제 DOM 렌더링 없이 이 함수 하나만 직접
// 호출해 검증할 수 있게 하기 위함이다(이 프로젝트의 "새 DOM test 환경을
// 추가하지 않는다" 원칙을 지키면서 — learning-event-sink.test.ts와 동일한
// 최소 fake-global 방식을 쓴다).
export async function handleRetryClick(feedbackId: string, btn: HTMLButtonElement, msgEl: HTMLElement, state: RetryState): Promise<void> {
  if (btn.disabled) return; // 중복 클릭 방지
  const activityId = getCurrentActivityId();
  if (!activityId) {
    msgEl.textContent = '지금은 다시 해볼 수 없어요. 잠시 후 다시 시도해 주세요.';
    return;
  }

  // D12-1C4 §4: "하나의 logical event"는 이 버튼에 대한 첫 클릭부터
  // 성공하거나(버튼이 영구히 disabled됨) 학생이 포기할 때까지다. 실패 후
  // 같은 버튼을 다시 클릭하는 것은 response/network 불확실성에 대한
  // retry이므로 같은 clientEventId를 재사용한다(§8 response-loss 시나리오)
  // — 여기서 매번 새 UUID를 만들지 않는다. 이 렌더가 통째로 다시
  // 그려지면(F5 등 §9) render()가 새 state 객체를 새로 만들어 주므로,
  // 그건 자연히 새로운 logical action이 되어 새 UUID를 받는다.
  if (!state.clientEventId) {
    state.clientEventId = crypto.randomUUID();
  }
  const clientEventId = state.clientEventId;

  const originalLabel = btn.textContent;
  btn.disabled = true;
  msgEl.textContent = '';

  try {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activityId, eventType: 'feedback-retry', payload: { feedbackId }, clientEventId }),
    });
    if (!res.ok) {
      // 401/400/500(409 conflict 포함) 등 서버 세부사항을 구분해 보여주지
      // 않는다 — 다른 학생/feedback 정보를 노출하지 않는 generic error
      // UX(요구사항 §6/§10). D12-1B 계약상 409는 같은 clientEventId가 다른
      // 내용과 충돌했다는 뜻(bug/unexpected state, §7)이지만, 자동으로 새
      // UUID를 만들어 재전송하지 않는다 — clientEventId는 그대로 두고,
      // 학생이 다시 누르면 여전히 같은 값으로 재시도한다(§7).
      btn.disabled = false;
      btn.textContent = originalLabel;
      msgEl.textContent = '지금은 다시 해볼 수 없어요. 잠시 후 다시 시도해 주세요.';
      return;
    }
    // D12-1B 계약: res.ok(200)는 created/duplicate 둘 다를 의미하고, 둘 다
    // 동일하게 성공으로 취급한다(§7 — duplicate는 사용자 오류가 아니다).
    btn.textContent = '확인함 · 다시 해보세요';
    // 성공 후에도 disabled 상태를 유지한다 — 이번 렌더 세션 동안의
    // 중복 제출만 막을 뿐, 페이지를 새로고침하면 이 상태는 사라진다
    // (영속적인 "읽음 상태"가 아니다, 요구사항 §9 그대로).
  } catch {
    btn.disabled = false;
    btn.textContent = originalLabel;
    msgEl.textContent = '지금은 다시 해볼 수 없어요. 잠시 후 다시 시도해 주세요.';
  }
}

function render(feedback: StudentFeedbackItem[]): void {
  const listEl = el<HTMLUListElement>('sf-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  // listFeedbackForEnrollment()는 오래된 → 최신 순으로 준다(교사 화면은
  // 그 순서 그대로 쌓아 보여주지만, 학생은 "가장 최근 피드백"을 바로
  // 확인하는 게 목적이므로 여기서만 뒤집어 최신 → 오래된 순으로 보여준다).
  for (const f of [...feedback].reverse()) {
    const li = document.createElement('li');

    const contentP = document.createElement('p');
    contentP.textContent = f.content; // XSS 방지: textContent만 사용, innerHTML 사용 안 함

    const metaP = document.createElement('p');
    metaP.className = 'muted';
    metaP.textContent = f.updatedAt !== f.createdAt ? `${formatDate(f.updatedAt)} · 수정됨` : formatDate(f.createdAt);

    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'btn ghost small';
    retryBtn.textContent = '확인하고 다시 해보기';

    const retryMsgP = document.createElement('p');
    retryMsgP.className = 'muted';

    // D12-1C4: 이 feedback item(이 버튼 인스턴스)에 대응하는 logical
    // action 하나의 clientEventId를 보관한다 — 클릭 핸들러 밖에서 만들어야
    // 실패 후 재클릭마다 재사용된다(핸들러 안에서 매번 새로 만들면 매
    // 클릭이 새 logical event가 되어버린다).
    const retryState: RetryState = { clientEventId: null };
    retryBtn.addEventListener('click', () => void handleRetryClick(f.id, retryBtn, retryMsgP, retryState));

    li.appendChild(contentP);
    li.appendChild(metaP);
    li.appendChild(retryBtn);
    li.appendChild(retryMsgP);
    listEl.appendChild(li);
  }
}

// 현재 학생의 student_session이 확정된 직후(입장 완료/새로고침으로 기존
// 세션 이어받기) 딱 한 번 호출된다 — 학생이 보는 동안 자동 갱신/폴링하지
// 않는다(0-D11-B10 범위: read-only 최소 기능).
export async function loadStudentFeedback(): Promise<void> {
  setState('loading');
  try {
    const res = await fetch('/api/student-feedback');
    if (!res.ok) {
      showError();
      return;
    }
    const body = (await res.json()) as StudentFeedbackResponse;
    if (body.status !== 'ok' || !('feedback' in body)) {
      showError();
      return;
    }
    if (body.feedback.length === 0) {
      setState('empty');
      return;
    }
    render(body.feedback);
    setState('result');
  } catch {
    showError();
  }
}
