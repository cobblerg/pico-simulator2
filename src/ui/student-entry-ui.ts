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
// project.ts/content-access.ts의 기존 함수(startWorkspace/saveWorkspace/
// store, getSimulatorMissions)를 그대로 재사용한다 — app.ts는 여전히
// import하지 않는다(app.ts의 mission/parts/editor 같은 메모리 상태는
// 건드릴 필요가 없다 — 이 초기화 직후 location.reload()로 페이지 전체가
// 새로 시작되며 app.ts가 localStorage를 처음부터 다시 읽기 때문이다).
import { StudentContext } from './student-domain';
import { toStudentContext } from './student-entry';
import { store, startWorkspace, saveWorkspace } from './project';
import { getSimulatorMissions } from './content-access';

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
// 있으므로 getSimulatorMissions()로 전체 미션을 순회해 각 미션의 저장된
// 작업 공간(picosim:ws:<missionId>)을 시작 상태로 되돌린다. picosim:passed
// (미션 성공 표시)와 picosim:mission(마지막으로 선택된 미션)도 함께
// 지워 다음 학생이 깨끗한 초기 상태에서 시작하게 한다.
//
// project.ts의 store.set/store.del은 내부적으로 이미 try/catch로 감싸져
// 있어 개별 호출이 예외를 던지지 않는다 — 그래도 getSimulatorMissions()
// 자체가 실패하는 것까지 대비해, 호출부(exitBtn 핸들러)에서 이 함수 전체를
// 한 번 더 try/catch로 감싼다(아래 참고).
function resetWorkspaceForNextStudent(): void {
  for (const m of getSimulatorMissions()) {
    saveWorkspace(m, startWorkspace(m));
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
    exitBtn.addEventListener('click', () => {
      // 순서: 작업 상태 초기화 → StudentContext 삭제 → reload. 작업 상태
      // 초기화를 먼저 해서, 이후 어떤 단계가 실패하더라도 최소한 저장된
      // 작업 데이터는 이미 깨끗한 상태로 남게 한다.
      try {
        resetWorkspaceForNextStudent();
      } catch {
        // 작업 상태 초기화가 실패해도 세션 종료(StudentContext 삭제)는
        // 반드시 진행한다 — 최소한 다음 학생이 이전 학생의 로그인 상태를
        // 이어받는 것만은 막는다.
      }
      clearStudentContext(); // StudentContext만 제거 — 명시적으로 저장한 프로젝트/교사 설정은 그대로 둔다
      location.reload(); // 새로고침이 initStudentEntryGate()를 다시 실행해 입장 dialog를 보여준다
    });
  }
}
