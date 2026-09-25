// 학생 입장 게이트 (Stage 0-D8)
//
// 학급코드+학번+이름으로 POST /api/student-entry를 호출하고, 성공하면 PII가
// 없는 StudentContext(studentId/enrollmentId/classId)만 sessionStorage에
// 남긴다. 이 파일은 /api/student-entry(same-origin POST)만 호출하며,
// Supabase SDK/secret이나 src/server/*를 전혀 참조하지 않는다 —
// student-domain.ts/student-entry.ts(둘 다 Supabase를 모르는 순수 모듈)만
// 재사용한다.
//
// console에 classCode/studentNo/name, API 응답 본문, StudentContext를 절대
// 출력하지 않는다.
//
// PicoSim 자체 초기화(app.ts의 기존 렌더링/이벤트 바인딩)는 이 파일이
// 전혀 건드리지 않는다 — dialog는 순수 오버레이이고, 기존 코드는 지금과
// 똑같이 즉시 실행된다. initStudentEntryGate()는 app.ts에서 단 한 번만
// 호출된다.
//
// "다시 입장"(학생 교체) 시 현재 학생의 임시 작업 상태를 초기화하기 위해
// project.ts의 기존 함수(startWorkspace/saveWorkspace/store)를 그대로
// 재사용한다 — app.ts는 여전히 import하지 않는다(app.ts의 mission/parts/
// editor 같은 메모리 상태는 건드릴 필요가 없다 — 이 초기화 직후
// location.reload()로 페이지 전체가 새로 시작되며 app.ts가 localStorage를
// 처음부터 다시 읽기 때문이다).
//
// 미션 목록은 content-access.ts의 getSimulatorMissions()가 아니라
// data.ts의 MISSIONS를 직접 쓴다 — 둘은 현재 내용이 같지만(모든 미션이
// simulator 타입), MISSIONS가 실제 "원본"(content.ts 자체 주석 참고)이고
// 중간에 거치는 파생 레이어(content.ts/content-access.ts)가 하나 줄어들수록
// 이 초기화가 그 레이어의 문제에 영향받을 가능성이 낮아진다.
//
// Production에서 확인된 실제 원인: "다시 입장" 클릭 직전에 학생이 마지막으로
// 편집하던 미션에 대해 예약된 자동저장 디바운스 타이머(app.ts의
// saveWsSoon/saveWsNow, 400ms)가 resetWorkspaceForNextStudent() 이후에도
// 취소되지 않고 남아 있다가, reload()가 실제로 페이지를 떠나기 전(아직 같은
// JS 컨텍스트가 살아있는 동안) 뒤늦게 발화해 메모리에 남아있던 이전 학생의
// 코드/회로를 방금 초기화한 localStorage 위에 다시 덮어썼다. 이를 막기
// 위해 workspace-autosave.ts의 플래그를 켜기 전에(disableWorkspaceAutosave)
// 먼저 꺼서, app.ts 쪽의 모든 자동저장 경로(디바운스 타이머든 pagehide든)가
// 이 시점 이후로는 아무것도 쓰지 못하게 만든다. app.ts를 직접 import하지
// 않는 이유는 app.ts가 이미 이 파일을 import하고 있어(초기화 훅) 순환
// 의존이 생기기 때문이다 — 대신 두 파일이 공통으로 참조하는 작은 중립
// 모듈(workspace-autosave.ts)을 통해서만 상태를 주고받는다.
// Stage 0-D9-A1: "다시 입장"은 이제 서버의 student_session(HttpOnly 쿠키)도
// 함께 끊어야 한다 — /api/student-session/logout 호출이 성공적으로
// 끝나기 전에는 StudentContext를 지우거나 reload하지 않는다. 그렇지
// 않으면 이전 학생의 HttpOnly 쿠키가 브라우저에 남은 채로 다음 학생이
// 시뮬레이터를 쓰게 되고, 그 쿠키가 향후 학습 Event API의 authorization
// 근거가 되므로 이는 실제 보안 문제로 이어진다. 로그아웃 요청이
// 실패하면(네트워크 오류/비정상 응답) 자동저장을 다시 켜고 재시도할 수
// 있게 둔다 — 조용히 무시(catch {})하지 않는다.
// Stage 0-D9-C: 학습 이벤트 sink(picosim:event → /api/events)도
// workspace-autosave와 같은 원칙으로 학생 세션에 맞춰 켜고 끈다 — 학생이
// 입장하기 전(기본값)과 "다시 입장" 시작 이후에는 아무 이벤트도 큐에
// 쌓이지 않아야 하므로, 이 파일이 그 경계를 결정한다. learning-event-
// sink.ts를 직접 import하지 않는다 — workspace-autosave.ts와 마찬가지로
// 작은 중립 모듈(learning-event-lifecycle.ts)을 통해서만 상태를
// 주고받는다(순환 의존 방지 및 책임 분리 — sink는 "언제 켜졌는지"만
// 알면 되고, 왜 켜고 끄는지의 정책은 이 파일이 갖는다).
import { StudentContext } from './student-domain';
import { toStudentContext } from './student-entry';
import { store, startWorkspace, saveWorkspace, Workspace } from './project';
import { MISSIONS } from './data';
import { disableWorkspaceAutosave, enableWorkspaceAutosave } from './workspace-autosave';
import { enableLearningEventSink, disableLearningEventSink } from './learning-event-lifecycle';

const SESSION_KEY = 'picosim:student-context';

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isStudentContextShape(v: unknown): v is StudentContext {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  return isNonEmptyString(c.studentId) && isNonEmptyString(c.enrollmentId) && isNonEmptyString(c.classId);
}

function clearStudentContext(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {}
}

function saveStudentContext(ctx: StudentContext): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(ctx));
  } catch {}
}

// 학생 교체("다시 입장") 시, "현재 학생의 임시 작업 상태"만 다음 학생에게
// 넘어가지 않도록 초기화한다. 건드리지 않는 것: picosim:projects(명시적으로
// 이름 붙여 저장한 프로젝트), picosim:act:*(교사가 설정한 활동 — 특정
// 학생이 아니라 이 브라우저/수업 전체에 적용되는 설정이라 학생이 바뀌어도
// 유지돼야 한다).
//
// 기존 "처음 상태로"(app.ts #proj-restart)의 초기화 함수(startWorkspace/
// saveWorkspace)는 그대로 재사용하되, 그 버튼의 "되돌리기 전에 지금 상태를
// picosim:projects에 자동 백업" 동작은 의도적으로 재사용하지 않는다 — 그
// 자동 백업이야말로 다음 학생이 "불러오기" 목록에서 이전 학생의 코드를 볼
// 수 있게 되는 새로운 유출 경로이기 때문이다.
//
// 미션은 하나만 초기화하지 않는다 — 학생이 여러 미션을 오가며 작업했을 수
// 있으므로 전체 미션(MISSIONS)을 순회해 각 미션의 저장된 작업 공간
// (picosim:ws:<missionId>)을 시작 상태로 되돌린다. picosim:passed(미션
// 성공 표시)와 picosim:mission(마지막으로 선택된 미션)도 함께 지워 다음
// 학생이 깨끗한 초기 상태에서 시작하게 한다.
//
// 견고성: Production에서 "현재 열려 있던 미션만 초기화되고 그 외 미션은
// 초기화되지 않는" 문제가 보고됐다 — 이 환경에서 정확한 브라우저 재현은
// 하지 못했지만(같은 시나리오를 실제 project.ts 코드로 재현한 결과, 단순
// 반복문 자체는 두 미션 모두 정상 초기화함을 확인함), 코드 리뷰로
// startWorkspace(m)이 project.ts의 store.set/store.del과 달리 try/catch로
// 감싸여 있지 않다는 것을 확인했다 — activityFor(m)이 반환한 활동 설정의
// preset이 배열이 아닌 등 손상된 값이면 a.preset.map(...)에서 예외가 나고,
// 그 순간 반복문 전체가 중단돼 그 미션 이후(iteration 순서상 뒤에 오는
// 미션들)는 초기화되지 않는다 — 관찰된 "처음 몇 개는 되고 나머지는 안 됨"
// 패턴과 부합한다. 정확한 원인이 이것이라고 100% 확정할 수는 없으므로,
// 어떤 이유로 실패하든 불변조건(모든 미션이 startWorkspace와 동일한 상태가
// 되어야 한다)이 깨지지 않도록 다음 3중 방어를 둔다:
//   1) 미션 하나의 실패가 나머지 미션 처리를 막지 못하게 미션별 try/catch로
//      격리한다.
//   2) 정상 초기화가 실패하면(catch), 최소한 이전 학생의 코드가 남지
//      않도록 빈 작업 공간({parts:[], code:''})으로라도 강제 초기화한다
//      (store.set류는 예외를 던지지 않으므로 이 강제 초기화는 항상 성공한다).
//   3) saveWorkspace 이후 실제로 반영됐는지 즉시 읽어 확인하고, 다르면
//      한 번 더 쓴다 — store.set이 내부에서 조용히 실패하는(예: quota)
//      경우까지 방어한다.
function resetWorkspaceForNextStudent(): void {
  for (const m of MISSIONS) {
    let fresh: Workspace;
    try {
      fresh = startWorkspace(m);
      saveWorkspace(m, fresh);
    } catch {
      // startWorkspace(m) 자체가 실패한 경우 — 정확한 시작 상태는 못
      // 만들어도, 최소한 이전 학생의 코드/회로가 남지 않게 빈 상태로
      // 강제 초기화한다.
      fresh = { parts: [], code: '' };
      saveWorkspace(m, fresh);
    }
    // 쓰기 반영 확인 — code 문자열만 비교한다(parts의 id는 startWorkspace가
    // 호출마다 새로 발급하므로 동일한 fresh 값을 그대로 재사용해 비교한다).
    const verify = store.get<Workspace>('ws:' + m.id);
    if (!verify || verify.code !== fresh.code) {
      saveWorkspace(m, fresh);
    }
    store.del('projectName:' + m.id);
  }
  store.del('passed');
  store.del('mission');
}

// 손상된 값(JSON 파싱 실패, 필드 누락, 빈 문자열, 잘못된 타입)은 조용히
// 지우고 미입장 상태로 취급한다 — 예외를 던지지 않는다.
function loadStudentContext(): StudentContext | null {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearStudentContext();
    return null;
  }

  if (isStudentContextShape(parsed)) {
    return { studentId: parsed.studentId, enrollmentId: parsed.enrollmentId, classId: parsed.classId };
  }
  clearStudentContext();
  return null;
}

export function initStudentEntryGate(): void {
  const dialog = document.getElementById('student-entry-dialog') as HTMLDialogElement | null;
  const form = document.getElementById('student-entry-form') as HTMLFormElement | null;
  const exitBtn = document.getElementById('student-exit') as HTMLButtonElement | null;
  if (!dialog || !form) return;

  // 게이트 불변조건: 유효한 StudentContext가 없는 동안 student-entry-dialog는
  // 어떤 사용자 취소 동작(Escape 등)으로도 "닫힌 상태"가 될 수 없다.
  //
  // 이를 특정 keydown/cancel 이벤트 하나를 막는 방식이 아니라, "dialog가
  // 열려 있어야 하는 상태 자체"를 지키는 방식으로 보장한다 — allowClose가
  // true일 때(= accepted 처리에서 우리가 직접 dialog.close()를 호출할
  // 때)만 닫힘을 허용하고, 그 외의 모든 close는(원인이 Escape든, 연속 Escape
  // 두 번째 입력이든, 그 밖의 알려지지 않은 브라우저 동작이든) close
  // 이벤트에서 즉시 감지해 openGate()로 되돌린다. cancel의 preventDefault만
  // 믿지 않는 이유: 실제 Chrome에서 첫 Escape는 막혔지만 두 번째 연속
  // Escape에서는 dialog가 실제로 닫히는 현상이 재현됐기 때문이다 — 정확한
  // 내부 메커니즘을 이 환경에서 재현할 수 없으므로, 원인이 무엇이든 결과
  // 상태(열려 있어야 함)를 스스로 복구하는 방어로 설계한다.
  let allowClose = false;

  dialog.addEventListener('cancel', (e) => e.preventDefault());
  dialog.addEventListener('close', () => {
    if (!allowClose) openGate(); // 승인되지 않은 close는 즉시 되돌린다
  });

  const classCodeInput = document.getElementById('se-classcode') as HTMLInputElement;
  const studentNoInput = document.getElementById('se-studentno') as HTMLInputElement;
  const nameInput = document.getElementById('se-name') as HTMLInputElement;
  const submitBtn = document.getElementById('se-submit') as HTMLButtonElement;
  const errorEl = document.getElementById('se-error') as HTMLElement;

  function showExitButton(show: boolean): void {
    if (exitBtn) exitBtn.hidden = !show;
  }

  function openGate(): void {
    errorEl.textContent = '';
    showExitButton(false);
    if (!dialog!.open) dialog!.showModal();
    try {
      classCodeInput.focus();
    } catch {
      // 포커스 이동은 부가 기능일 뿐이다 — 실패해도 게이트 자체(모달 표시,
      // Escape 차단)에는 영향을 주지 않아야 한다.
    }
  }

  if (loadStudentContext()) {
    showExitButton(true);
    enableLearningEventSink(); // F5 등으로 이미 유효한 세션을 이어받는 경우
  } else {
    openGate();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitBtn.disabled) return; // 중복 제출 방지

    submitBtn.disabled = true;
    errorEl.textContent = '';
    const originalLabel = submitBtn.textContent;
    submitBtn.textContent = '입장하는 중...';

    try {
      const res = await fetch('/api/student-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classCode: classCodeInput.value,
          studentNo: studentNoInput.value,
          name: nameInput.value,
        }),
      });

      if (!res.ok) {
        errorEl.textContent = '연결에 문제가 있어요. 잠시 후 다시 시도해 주세요.';
        return;
      }

      let data: unknown;
      try {
        data = await res.json();
      } catch {
        errorEl.textContent = '연결에 문제가 있어요. 잠시 후 다시 시도해 주세요.';
        return;
      }

      const body = (typeof data === 'object' && data !== null ? data : {}) as {
        status?: unknown;
        studentId?: unknown;
        enrollmentId?: unknown;
        classId?: unknown;
      };

      // API 응답을 그대로 신뢰하지 않는다 — status/필드 타입을 여기서 다시 확인한다.
      if (
        body.status === 'accepted' &&
        isNonEmptyString(body.studentId) &&
        isNonEmptyString(body.enrollmentId) &&
        isNonEmptyString(body.classId)
      ) {
        const ctx = toStudentContext({
          status: 'accepted',
          studentId: body.studentId,
          enrollmentId: body.enrollmentId,
          classId: body.classId,
        });
        saveStudentContext(ctx);
        form.reset(); // classCode/studentNo/name을 DOM에서 제거
        allowClose = true; // 유일하게 승인된 close 경로
        dialog!.close();
        showExitButton(true);
        enableLearningEventSink(); // 이제부터 이 학생의 picosim:event를 저장한다
        return;
      }

      errorEl.textContent = '입력 정보를 확인해 주세요.';
    } catch {
      errorEl.textContent = '연결에 문제가 있어요. 잠시 후 다시 시도해 주세요.';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  });

  if (exitBtn) {
    exitBtn.addEventListener('click', async () => {
      if (exitBtn.disabled) return; // 중복 클릭 방지
      exitBtn.disabled = true;
      exitBtn.textContent = '나가는 중...';

      // 0-D9-C: 학습 이벤트 sink 차단을 다른 어떤 정리 작업보다도 먼저
      // 한다 — "다시 입장 시작 이후 새 event enqueue 금지"를 가장 확실히
      // 보장하는 방법은 이 disable을 가장 먼저 실행하는 것뿐이다(그 뒤에
      // 이어지는 reset/logout이 비동기로 시간이 걸리는 동안에도 이
      // 순간부터는 어떤 picosim:event도 큐에 들어가지 않는다).
      disableLearningEventSink();

      // 순서: 자동저장 차단 → 작업 상태 초기화 → 서버 세션 로그아웃 →
      // StudentContext 삭제 → reload. 자동저장을 가장 먼저 끄는 이유: reset이
      // localStorage를 깨끗하게 만든 뒤에도, 이미 예약돼 있던 디바운스
      // 타이머나 pagehide가 reload가 실제로 페이지를 떠나기 전(같은 JS
      // 컨텍스트가 아직 살아있는 동안) 뒤늦게 발화해 메모리에 남은 이전
      // 학생의 코드/회로를 다시 localStorage에 덮어쓸 수 있기 때문이다
      // (Production에서 실제 확인된 원인).
      //
      // 서버 로그아웃을 StudentContext 삭제/reload보다 먼저 성공시켜야 하는
      // 이유: 로그아웃이 실패했는데 StudentContext만 지우고 다음 학생 입장
      // 화면을 보여주면, 이전 학생의 HttpOnly student_session 쿠키가
      // 브라우저에 그대로 남은 채로 다음 학생이 시뮬레이터를 쓰게 된다 —
      // 그 쿠키가 앞으로 학습 Event API의 authorization 근거가 되므로 이는
      // 실제 보안 문제다. 그래서 로그아웃 실패 시 조용히 넘어가지 않고,
      // 자동저장을 되돌려 현재 학생이 안전하게 계속 쓸 수 있게 하고 재시도를
      // 요구한다.
      disableWorkspaceAutosave();
      try {
        resetWorkspaceForNextStudent();
      } catch {
        // 작업 상태 초기화가 실패해도 로그아웃 시도는 계속 진행한다 —
        // 최소한 이전 학생의 서버 세션은 반드시 끊어야 한다.
      }

      let logoutOk = false;
      try {
        const res = await fetch('/api/student-session/logout', { method: 'POST' });
        logoutOk = res.ok;
      } catch {
        logoutOk = false;
      }

      if (!logoutOk) {
        enableWorkspaceAutosave(); // 이 페이지가 계속 쓰일 수 있으므로 자동저장을 되돌린다
        enableLearningEventSink(); // 같은 학생이 계속 쓰므로 이벤트 저장도 되돌린다
        exitBtn.disabled = false;
        exitBtn.textContent = '나가기 실패 · 다시 시도';
        return;
      }

      clearStudentContext(); // StudentContext만 제거 — 명시적으로 저장한 프로젝트/교사 설정은 그대로 둔다
      location.reload(); // 새로고침이 initStudentEntryGate()를 다시 실행해 입장 dialog를 보여준다
    });
  }
}
