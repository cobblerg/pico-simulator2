// 교사 인증 진입점 (Stage 0-D10-A)
//
// src/ui/app.ts(학생 시뮬레이터)와 완전히 분리된 별도 entry point다 —
// build.mjs가 이 파일만 별도로 esbuild 번들해 dist/teacher.html을 만든다.
// app.ts는 이 파일을 import하지 않고, 이 파일도 app.ts/student-entry-ui.ts/
// student-session.ts 등 학생 쪽 코드를 전혀 import하지 않는다 — 두 세션은
// 완전히 독립이다(0-D10-A 정책 9, §9 "교사 로그아웃과 학생 로그아웃은 완전히
// 독립이어야 한다").
//
// 이 파일이 절대 하지 않는 것(0-D10-A 정책):
//   - Supabase 학생/학급/learning_event 테이블을 직접 SELECT하지 않는다
//     (Supabase Auth API만 쓴다 — auth.signInWithOAuth/getSession/signOut/
//     onAuthStateChange).
//   - /api/student-session/logout을 호출하지 않는다.
//   - sessionStorage['picosim:student-context']를 지우거나 읽지 않는다.
//   - GET /api/teacher/me 응답을 받아 "승인 teacher"로 표시하는 것 외에
//     어떤 학급/학생 데이터도 요청하지 않는다(대시보드는 0-D10-A 범위 밖).
//
// Stage 0-D10-C에서 담당 학급 목록(/api/teacher/classes)과 학생 목록
// (/api/teacher/classes/:classId/students) 조회가 추가됐다 — 위 0-D10-A
// 상태 기계(logged-out/checking/approved/not-approved)는 그대로 두고,
// 'approved' 상태 "안에서"만 동작하는 별도의 하위 상태(ApprovedSubState)를
// 추가하는 방식으로 확장했다. teacherId는 이 파일 어디에도 없다 — 서버가
// access token으로부터 스스로 확인하므로 브라우저가 teacherId를 알거나
// 전송할 필요가 구조적으로 없다. 학생 행에는 클릭 동작을 만들지 않는다
// (학생 상세/timeline/feedback은 0-D10-D 이후 범위).
//
// __TEACHER_SUPABASE_URL__/__TEACHER_SUPABASE_ANON_KEY__는 build.mjs가 이
// 번들에만 esbuild define으로 주입하는 공개 가능한 값이다(anon key는 RLS로
// 보호되는 브라우저 공개 설정이며, service-role 성격의
// SUPABASE_SECRET_KEY/STUDENT_SESSION_SECRET와는 신뢰 등급이 완전히 다르다)
// — 이 두 전역은 이 파일이 정의하지 않는다, build.mjs가 정의해 준다.
import { createClient, Session } from '@supabase/supabase-js';

declare const __TEACHER_SUPABASE_URL__: string;
declare const __TEACHER_SUPABASE_ANON_KEY__: string;

const supabase = createClient(__TEACHER_SUPABASE_URL__, __TEACHER_SUPABASE_ANON_KEY__);

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing element #${id}`);
  return found as T;
}

const loggedOutEl = el<HTMLElement>('t-logged-out');
const checkingEl = el<HTMLElement>('t-checking');
const approvedEl = el<HTMLElement>('t-approved');
const notApprovedEl = el<HTMLElement>('t-not-approved');
const nameEl = el<HTMLElement>('t-name');
const loginBtn = el<HTMLButtonElement>('t-login');
const logoutBtn = el<HTMLButtonElement>('t-logout');

const classesLoadingEl = el<HTMLElement>('t-classes-loading');
const classesEmptyEl = el<HTMLElement>('t-classes-empty');
const classesListEl = el<HTMLElement>('t-classes-list');
const classesUl = el<HTMLUListElement>('t-classes-ul');
const studentsLoadingEl = el<HTMLElement>('t-students-loading');
const studentsEmptyEl = el<HTMLElement>('t-students-empty');
const studentsListEl = el<HTMLElement>('t-students-list');
const studentsTbody = el<HTMLTableSectionElement>('t-students-tbody');
const errorEl = el<HTMLElement>('t-error');
const errorMsgEl = el<HTMLElement>('t-error-msg');
const retryBtn = el<HTMLButtonElement>('t-retry');

type UiState = 'logged-out' | 'checking' | 'approved' | 'not-approved';

function setUiState(state: UiState, displayName?: string): void {
  loggedOutEl.hidden = state !== 'logged-out';
  checkingEl.hidden = state !== 'checking';
  approvedEl.hidden = state !== 'approved';
  notApprovedEl.hidden = state !== 'not-approved';
  logoutBtn.hidden = state !== 'approved' && state !== 'not-approved';
  if (state === 'approved' && displayName !== undefined) nameEl.textContent = displayName;
}

// 'approved' 상태 "안에서"만 의미가 있는 하위 상태 — 위 UiState와는 별개
// 축이다(0-D10-C design review §5 제안 그대로: 별도 화면 전환 없이 같은
// #t-approved 카드 안에서 학급 목록 → 학생 목록을 갱신한다).
// classesListEl은 'classes' 이후 모든 하위 상태(loading-students/students/
// no-students)에서도 계속 보여야 한다 — 교사가 다른 학급을 다시 클릭할 수
// 있어야 하기 때문이다(같은 화면 안에서의 학급 전환).
type ApprovedSubState =
  | null
  | 'loading-classes'
  | 'no-classes'
  | 'classes'
  | 'loading-students'
  | 'students'
  | 'no-students'
  | 'error';

function setApprovedSubState(state: ApprovedSubState): void {
  classesLoadingEl.hidden = state !== 'loading-classes';
  classesEmptyEl.hidden = state !== 'no-classes';
  classesListEl.hidden = !(
    state === 'classes' ||
    state === 'loading-students' ||
    state === 'students' ||
    state === 'no-students'
  );
  studentsLoadingEl.hidden = state !== 'loading-students';
  studentsEmptyEl.hidden = state !== 'no-students';
  studentsListEl.hidden = state !== 'students';
  errorEl.hidden = state !== 'error';
}

type TeacherMeResponse =
  | { status: 'ok'; teacher: { teacherId: string; displayName: string } }
  | { status: 'not_approved' };

type TeacherClassSummary = {
  classId: string;
  schoolYear: string;
  grade: number;
  classNumber: number;
  classCode: string;
};
type TeacherClassesResponse = { status: 'ok'; classes: TeacherClassSummary[] } | { status: 'not_approved' };

type StudentSummary = { enrollmentId: string; studentId: string; studentNo: string; name: string };
// 서버(teacher-students-handler.ts)는 실제로 두 status를 돌려줄 수 있다 —
// not_approved(세션 도중 승인이 취소된 드문 경우)를 빠뜨리면 body.students가
// undefined인 채로 renderStudentList()가 실행돼 TypeError가 나고, 그 예외가
// catch에 잡혀 "불러오지 못했습니다" 일반 오류로 잘못 가려진다(pre-commit
// review에서 발견됨, 0-D10-C fix).
type TeacherStudentsResponse = { status: 'ok'; students: StudentSummary[] } | { status: 'not_approved' };

// 현재 로그인한 교사의 access token — /api/teacher/classes 응답을 받은
// 직후부터 학급 클릭(selectClass) 시점까지 재사용한다. teacherId는 여기
// 어디에도 저장하지 않는다 — classId를 고르는 것도, 학생을 조회하는 것도
// 전부 access token만으로 서버가 처리한다.
let currentAccessToken: string | null = null;
let currentClasses: TeacherClassSummary[] = [];
let selectedClassId: string | null = null;
let retryAction: (() => void) | null = null;

function resetDashboardState(): void {
  currentAccessToken = null;
  currentClasses = [];
  selectedClassId = null;
  retryAction = null;
  setApprovedSubState(null);
}

function showApprovedError(message: string, retry: () => void): void {
  errorMsgEl.textContent = message;
  retryAction = retry;
  setApprovedSubState('error');
}

function renderClassList(): void {
  classesUl.innerHTML = '';
  for (const c of currentClasses) {
    const li = document.createElement('li');
    li.textContent = `${c.schoolYear} ${c.grade}학년 ${c.classNumber}반 (${c.classCode})`;
    if (c.classId === selectedClassId) li.classList.add('sel');
    li.addEventListener('click', () => {
      void selectClass(c.classId);
    });
    classesUl.appendChild(li);
  }
}

function renderStudentList(students: StudentSummary[]): void {
  studentsTbody.innerHTML = '';
  for (const s of students) {
    const tr = document.createElement('tr');
    const tdNo = document.createElement('td');
    tdNo.textContent = s.studentNo;
    const tdName = document.createElement('td');
    tdName.textContent = s.name;
    tr.appendChild(tdNo);
    tr.appendChild(tdName);
    studentsTbody.appendChild(tr);
  }
}

async function selectClass(classId: string): Promise<void> {
  if (!currentAccessToken) return;
  const requestToken = currentAccessToken; // 이 요청이 시작된 시점의 세션 — 이후 로그아웃/재로그인과 구분하는 데 쓴다.
  selectedClassId = classId;
  renderClassList(); // 선택 강조 갱신 — 목록 자체는 그대로 유지된다.
  setApprovedSubState('loading-students');
  // stale-response guard: 이 fetch가 나가 있는 동안 다른 학급이 클릭됐거나
  // (selectedClassId가 바뀜) 로그아웃/재로그인이 일어났으면(currentAccessToken이
  // 바뀜) 이 응답은 더 이상 화면과 관련이 없다 — 성공/오류 어느 쪽이든 UI를
  // 건드리지 않고 조용히 버린다(pre-commit review §5 RACE CONDITION FOUND 수정).
  const isStale = () => classId !== selectedClassId || requestToken !== currentAccessToken;
  try {
    const res = await fetch(`/api/teacher/classes/${encodeURIComponent(classId)}/students`, {
      headers: { Authorization: `Bearer ${requestToken}` },
    });
    if (isStale()) return;
    if (res.status === 401) {
      // /api/teacher/me의 401 처리와 동일하게 로그인 화면으로 되돌린다 —
      // 만료된 토큰으로 "다시 시도"만 반복하는 상태를 남기지 않는다.
      resetDashboardState();
      setUiState('logged-out');
      return;
    }
    if (!res.ok) {
      showApprovedError('학생 목록을 불러오지 못했습니다.', () => void selectClass(classId));
      return;
    }
    const body = (await res.json()) as TeacherStudentsResponse;
    if (isStale()) return;
    if (body.status !== 'ok') {
      // loadTeacherClasses()의 동일 분기와 같은 처리 — 세션 도중 승인이
      // 취소된 경우 not-approved 화면으로 되돌린다.
      resetDashboardState();
      setUiState('not-approved');
      return;
    }
    renderStudentList(body.students);
    setApprovedSubState(body.students.length === 0 ? 'no-students' : 'students');
  } catch {
    if (isStale()) return;
    showApprovedError('학생 목록을 불러오지 못했습니다.', () => void selectClass(classId));
  }
}

async function loadTeacherClasses(accessToken: string): Promise<void> {
  setApprovedSubState('loading-classes');
  // stale-response guard: 이 fetch가 나가 있는 동안 로그아웃하거나 다른
  // 계정으로 다시 로그인해 currentAccessToken이 바뀌었으면, 이 응답은 더
  // 이상 현재 세션과 관련이 없다 — UI를 건드리지 않는다.
  const isStale = () => accessToken !== currentAccessToken;
  try {
    const res = await fetch('/api/teacher/classes', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (isStale()) return;
    if (res.status === 401) {
      resetDashboardState();
      setUiState('logged-out');
      return;
    }
    if (!res.ok) {
      showApprovedError('담당 학급을 불러오지 못했습니다.', () => void loadTeacherClasses(accessToken));
      return;
    }
    const body = (await res.json()) as TeacherClassesResponse;
    if (isStale()) return;
    if (body.status !== 'ok') {
      // 세션 도중 승인이 취소된 것과 같은 드문 경우 — 상위 상태로 되돌린다.
      resetDashboardState();
      setUiState('not-approved');
      return;
    }
    currentClasses = body.classes;
    if (currentClasses.length === 0) {
      setApprovedSubState('no-classes');
      return;
    }
    renderClassList();
    setApprovedSubState('classes');
  } catch {
    if (isStale()) return;
    showApprovedError('담당 학급을 불러오지 못했습니다.', () => void loadTeacherClasses(accessToken));
  }
}

retryBtn.addEventListener('click', () => {
  if (retryAction) retryAction();
});

// 같은 access_token으로 중복 호출하지 않는다 — getSession()과
// onAuthStateChange(초기 구독 시 INITIAL_SESSION 이벤트 포함)가 페이지
// 로드 시점에 같은 session을 여러 번 넘겨줄 수 있기 때문이다(0-D10-A 정책
// 9의 "중복 호출이나 무한 루프가 생기지 않게" 요구사항).
let lastCheckedAccessToken: string | null = null;

async function checkTeacherStatus(session: Session): Promise<void> {
  if (session.access_token === lastCheckedAccessToken) return;
  lastCheckedAccessToken = session.access_token;

  setUiState('checking');
  // stale-response guard: onAuthStateChange가 토큰 갱신 등으로 짧은 간격을
  // 두고 두 번 발화하면 이전 토큰의 /api/teacher/me 호출이 아직 진행 중인
  // 채로 새 토큰의 호출이 시작될 수 있다 — 이전 호출의 응답이 나중에
  // 도착해도 그사이 lastCheckedAccessToken이 최신 토큰으로 바뀌어 있으면
  // 더 이상 이 응답을 적용하지 않는다(0-D10-C fix §4).
  const isStale = () => session.access_token !== lastCheckedAccessToken;
  try {
    const res = await fetch('/api/teacher/me', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (isStale()) return;
    if (!res.ok) {
      // 401(unauthorized) 포함 — access token이 서버 기준으로 이미
      // 무효라는 뜻이므로 로그인 화면으로 되돌아간다.
      resetDashboardState();
      setUiState('logged-out');
      return;
    }
    const body = (await res.json()) as TeacherMeResponse;
    if (isStale()) return;
    if (body.status === 'ok') {
      setUiState('approved', body.teacher.displayName);
      currentAccessToken = session.access_token;
      void loadTeacherClasses(currentAccessToken);
    } else {
      resetDashboardState();
      setUiState('not-approved');
    }
  } catch {
    if (isStale()) return;
    // 네트워크 오류 — 토큰/PII를 console에 남기지 않는다.
    resetDashboardState();
    setUiState('logged-out');
  }
}

function handleSession(session: Session | null): void {
  if (!session) {
    lastCheckedAccessToken = null;
    resetDashboardState();
    setUiState('logged-out');
    return;
  }
  void checkTeacherStatus(session);
}

loginBtn.addEventListener('click', () => {
  void supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/teacher.html` },
  });
});

logoutBtn.addEventListener('click', () => {
  void supabase.auth.signOut().then(() => {
    lastCheckedAccessToken = null;
    resetDashboardState();
    setUiState('logged-out');
  });
});

supabase.auth.onAuthStateChange((_event, session) => {
  handleSession(session);
});

void supabase.auth.getSession().then(({ data }) => {
  handleSession(data.session);
});
