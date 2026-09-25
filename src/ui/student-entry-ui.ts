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
import { StudentContext } from './student-domain';
import { toStudentContext } from './student-entry';

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
    classCodeInput.focus();
  }

  if (loadStudentContext()) {
    showExitButton(true);
  } else {
    openGate();
  }

  // Escape로 dialog를 닫아 게이트를 우회할 수 없게 막는다.
  dialog.addEventListener('cancel', (e) => e.preventDefault());

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
      clearStudentContext(); // StudentContext만 제거 — 기존 PicoSim localStorage는 그대로 둔다
      location.reload(); // 새로고침이 initStudentEntryGate()를 다시 실행해 입장 dialog를 보여준다
    });
  }
}
