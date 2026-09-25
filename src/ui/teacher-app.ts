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
// 전송할 필요가 구조적으로 없다.
//
// Stage 0-D10-D에서 학생 행에 클릭 동작(선택→Timeline 조회)이 추가됐다 —
// 단, 클릭했을 때 하는 일은 오직 "이 학생의 learning_event 목록을 시간순
// 문구로 보여준다"뿐이다. 코드 상세 보기/AI 분석/점수화는 이 파일에 없다.
// eventType→한국어 라벨 매핑은 실제로 존재하는 20종만 다루며, "체크포인트
// 통과"를 "활동 완료"로 해석하는 등 현재 데이터에 없는 의미를 추론하지
// 않는다(0-D10-D design review §3/§10).
//
// Stage 0-D10-E에서 학생 전체에 대한 교사 피드백 작성/조회/수정이
// 추가됐다 — 학생 선택 시 Timeline과 Feedback을 각각 독립된 함수
// (selectStudent 안의 Timeline fetch, loadFeedback())가 서로의 성공/실패에
// 관계없이 병행 요청한다(0-D10-E 확정 요구사항 13 — 강결합 금지). Feedback
// 영역의 표시/숨김(feedbackSectionEl.hidden)은 Timeline의 ApprovedSubState와
// 완전히 분리된 별도 상태(FeedbackSubState)로 관리한다 — Timeline이
// error여도 Feedback 영역은 계속 보여야 하기 때문이다. eventId를 이용한
// 특정 이벤트 피드백, 삭제, 학생 화면 표시는 이번 단계에 없다(0-D10-E 확정
// 범위 — PRD가 그리는 코드 줄 코멘트/루브릭/템플릿/읽음 여부/알림/AI
// 초안까지는 LATER).
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
const timelineStudentEl = el<HTMLElement>('t-timeline-student');
const timelineLoadingEl = el<HTMLElement>('t-timeline-loading');
const timelineEmptyEl = el<HTMLElement>('t-timeline-empty');
const timelineListEl = el<HTMLElement>('t-timeline-list');
const timelineUl = el<HTMLUListElement>('t-timeline-ul');
const errorEl = el<HTMLElement>('t-error');
const errorMsgEl = el<HTMLElement>('t-error-msg');
const retryBtn = el<HTMLButtonElement>('t-retry');

const feedbackSectionEl = el<HTMLElement>('t-feedback-section');
const feedbackInput = el<HTMLTextAreaElement>('t-feedback-input');
const feedbackSaveBtn = el<HTMLButtonElement>('t-feedback-save');
const feedbackCancelBtn = el<HTMLButtonElement>('t-feedback-cancel');
const feedbackLoadingEl = el<HTMLElement>('t-feedback-loading');
const feedbackEmptyEl = el<HTMLElement>('t-feedback-empty');
const feedbackErrorEl = el<HTMLElement>('t-feedback-error');
const feedbackErrorMsgEl = el<HTMLElement>('t-feedback-error-msg');
const feedbackRetryBtn = el<HTMLButtonElement>('t-feedback-retry');
const feedbackUl = el<HTMLUListElement>('t-feedback-ul');

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
// #t-approved 카드 안에서 학급 목록 → 학생 목록 → Timeline을 갱신한다).
// classesListEl은 'classes' 이후 모든 하위 상태(학생/Timeline 관련 전부)
// 에서도 계속 보여야 한다 — 교사가 다른 학급을 다시 클릭할 수 있어야
// 하기 때문이다. studentsListEl도 마찬가지로 Timeline 관련 상태에서 계속
// 보여야 한다 — "학생 목록은 계속 화면에 남겨두어 다른 학생을 바로 선택할
// 수 있게 한다"(0-D10-D 확정 UI 요구사항). 'error'도 두 목록이 이미 로드돼
// 있었다면 계속 보이게 포함한다 — Timeline/학생 목록 조회 실패가 이미 불러온
// 상위 목록까지 숨겨버리면 교사가 다시 학급을 클릭해야 하는 불필요한 왕복이
// 생기기 때문이다.
type ApprovedSubState =
  | null
  | 'loading-classes'
  | 'no-classes'
  | 'classes'
  | 'loading-students'
  | 'students'
  | 'no-students'
  | 'loading-timeline'
  | 'timeline'
  | 'empty-timeline'
  | 'error';

const CLASSES_VISIBLE_STATES = new Set<ApprovedSubState>([
  'classes',
  'loading-students',
  'students',
  'no-students',
  'loading-timeline',
  'timeline',
  'empty-timeline',
  'error',
]);
const STUDENTS_VISIBLE_STATES = new Set<ApprovedSubState>([
  'students',
  'loading-timeline',
  'timeline',
  'empty-timeline',
  'error',
]);

function setApprovedSubState(state: ApprovedSubState): void {
  classesLoadingEl.hidden = state !== 'loading-classes';
  classesEmptyEl.hidden = state !== 'no-classes';
  classesListEl.hidden = !CLASSES_VISIBLE_STATES.has(state);

  studentsLoadingEl.hidden = state !== 'loading-students';
  studentsEmptyEl.hidden = state !== 'no-students';
  studentsListEl.hidden = !STUDENTS_VISIBLE_STATES.has(state);

  timelineLoadingEl.hidden = state !== 'loading-timeline';
  timelineEmptyEl.hidden = state !== 'empty-timeline';
  timelineListEl.hidden = state !== 'timeline';

  errorEl.hidden = state !== 'error';
}

// Feedback 영역 전용 하위 상태 — 위 ApprovedSubState와 완전히 독립적인
// 별도 축이다(0-D10-E 확정 요구사항 "Timeline 오류 때문에 Feedback까지
// 사라지거나, Feedback 오류 때문에 Timeline까지 사라지는 강결합 상태는
// 피한다"). feedbackSectionEl 자체의 표시/숨김은 이 상태와 무관하게
// "학생이 선택됐는가"만으로 별도 관리한다(selectStudent/selectClass/
// resetDashboardState에서 직접 처리) — 여기서는 그 안의 목록 부분(로딩/
// 빈 상태/목록/오류)만 다룬다.
type FeedbackSubState = null | 'loading' | 'empty' | 'list' | 'error';

function setFeedbackSubState(state: FeedbackSubState): void {
  feedbackLoadingEl.hidden = state !== 'loading';
  feedbackEmptyEl.hidden = state !== 'empty';
  feedbackUl.hidden = state !== 'list';
  feedbackErrorEl.hidden = state !== 'error';
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

// teacher-timeline-data.ts의 TeacherTimelineEvent와 동일한 shape — 서버가
// 이미 최소화한 payload를 그대로 받는다(이 파일에서 추가로 payload를
// 가공하지 않는다, 0-D10-D 확정 결정 6은 서버 책임).
type TimelineEvent = { eventId: string; eventType: string; activityId: string; createdAt: string; payload: unknown };
type TeacherTimelineResponse = { status: 'ok'; events: TimelineEvent[] } | { status: 'not_approved' };

// teacher-feedback-data.ts의 TeacherFeedbackDTO와 동일한 shape. eventId는
// 이번 단계에 생성되는 모든 feedback에서 항상 null이지만(0-D10-E 확정
// 결정 1), 향후 호환성을 위해 타입/응답 모두에 포함돼 있다 — 이 파일은
// eventId를 읽거나 표시하지 않는다(특정 이벤트 feedback UI는 LATER).
type TeacherFeedbackItem = { feedbackId: string; content: string; eventId: string | null; createdAt: string; updatedAt: string };
type TeacherFeedbackListResponse = { status: 'ok'; feedback: TeacherFeedbackItem[] } | { status: 'not_approved' };
type TeacherFeedbackWriteResponse = { status: 'ok'; feedback: TeacherFeedbackItem } | { status: 'not_approved' };

// 실제로 존재하는 20개 event_type만 다룬다(learning-event-handler.ts의
// ALLOWED_EVENT_TYPES와 정확히 같은 집합) — 새 event type을 여기서 만들어
// 내지 않는다. 매핑에 없는 값이 방어적으로 와도 raw event_type을 그대로
// 보여준다(폴백일 뿐, 정상 경로에서는 발생하지 않는다).
const EVENT_LABELS: Record<string, string> = {
  'mission-open': '미션 열기',
  'activity-open': '활동 열기',
  paste: '코드 붙여넣기',
  'part-add': '부품 추가',
  'part-move': '부품 이동',
  'part-remove': '부품 제거',
  run: '코드 실행',
  'run-end': '실행 완료',
  error: '오류 발생',
  stop: '실행 정지',
  checkpoint: '체크포인트',
  reset: '리셋',
  'project-save': '프로젝트 저장',
  'project-open': '프로젝트 불러오기',
  'project-share': '공유 링크 복사',
  'project-restart': '처음 상태로 되돌리기',
  'real-connect': '실물 연결',
  'real-run': '실물에서 실행',
  'real-run-end': '실물 실행 종료',
  'real-save': '실물에 저장',
};

// checkpoint는 ok에 따라 "통과"/"미통과"만 덧붙인다 — ok:true를 "활동
// 완료"라고 표현하지 않는다(0-D10-D design review §3에서 확인한 대로,
// 학생이 통과 이후에도 계속 시도할 수 있어 "완료"는 현재 데이터로 확정할
// 수 없는 의미이기 때문). error는 payload.type(예외 클래스명)이 있으면
// 덧붙여 어떤 오류였는지 바로 알 수 있게 한다.
function describeEvent(ev: TimelineEvent): string {
  const label = EVENT_LABELS[ev.eventType] ?? ev.eventType;
  const payload = (ev.payload && typeof ev.payload === 'object' ? ev.payload : {}) as Record<string, unknown>;
  if (ev.eventType === 'checkpoint') {
    return `${label} · ${payload.ok ? '통과' : '미통과'}`;
  }
  if (ev.eventType === 'error' && typeof payload.type === 'string' && payload.type.length > 0) {
    return `${label} · ${payload.type}`;
  }
  return label;
}

// 현재 로그인한 교사의 access token — /api/teacher/classes 응답을 받은
// 직후부터 학급 클릭(selectClass) 시점까지 재사용한다. teacherId는 여기
// 어디에도 저장하지 않는다 — classId를 고르는 것도, 학생을 조회하는 것도
// 전부 access token만으로 서버가 처리한다.
let currentAccessToken: string | null = null;
// access token이 아니라 "실제로 승인된 교사가 누구였는가"를 추적한다 —
// 같은 교사도 TOKEN_REFRESHED로 access token이 바뀔 수 있으므로, token을
// identity로 쓰면 정상적인 세션 갱신마다 대시보드가 불필요하게 초기화된다
// (0-D10-E security fix). checkTeacherStatus()가 /api/teacher/me 성공
// 응답의 teacher.teacherId와 이 값을 비교해, 실제로 다른 교사로 바뀐
// 경우에만 resetDashboardState()를 호출한다. resetDashboardState() 자신이
// 이 값을 null로 되돌린다 — "대시보드를 벗어난 상태"에는 "승인된 교사가
// 없다"도 함께 포함되기 때문이다.
let lastApprovedTeacherId: string | null = null;
let currentClasses: TeacherClassSummary[] = [];
let selectedClassId: string | null = null;
let currentStudents: StudentSummary[] = [];
let selectedStudentId: string | null = null;
let retryAction: (() => void) | null = null;

let currentFeedback: TeacherFeedbackItem[] = [];
let editingFeedbackId: string | null = null;
let feedbackRetryAction: (() => void) | null = null;

function resetFeedbackForm(): void {
  editingFeedbackId = null;
  feedbackInput.value = '';
  feedbackSaveBtn.textContent = '피드백 저장';
  feedbackSaveBtn.disabled = false;
  feedbackCancelBtn.hidden = true;
}

function resetDashboardState(): void {
  currentAccessToken = null;
  lastApprovedTeacherId = null;
  currentClasses = [];
  selectedClassId = null;
  currentStudents = [];
  selectedStudentId = null;
  retryAction = null;
  timelineStudentEl.textContent = '';
  feedbackSectionEl.hidden = true;
  currentFeedback = [];
  feedbackRetryAction = null;
  resetFeedbackForm();
  setFeedbackSubState(null);
  setApprovedSubState(null);
  // hidden 속성만으로는 "화면에서 사라졌다"일 뿐, 이전 교사의 실제 렌더링된
  // DOM 노드는 다음 성공적인 렌더링 전까지 그대로 남아있다 — 일반적인 학급/
  // 학생 전환에서는 hidden만으로 충분했지만(재렌더링 전에는 어차피 사용자가
  // 볼 수 없으므로), 로그아웃 없이 다른 승인 교사로 바뀌는 경우(0-D10-E
  // security fix가 다루는 시나리오)에는 애매함을 남기지 않기 위해 네 목록의
  // 실제 DOM 내용을 여기서 완전히 비운다.
  classesUl.innerHTML = '';
  studentsTbody.innerHTML = '';
  timelineUl.innerHTML = '';
  feedbackUl.innerHTML = '';
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

// currentStudents(모듈 상태)를 그린다 — 학생을 선택해도 목록 자체는 다시
// fetch하지 않고 이 함수로 강조(.sel)만 갱신한다(renderClassList()가 학급
// 선택 강조를 갱신하는 것과 동일한 패턴). 행에는 클릭 동작이 있다 — 클릭하면
// selectStudent()를 호출해 Timeline을 불러온다(0-D10-D). 학생 상세/코드
// 열람 등 다른 동작은 여기 없다.
function renderStudentList(): void {
  studentsTbody.innerHTML = '';
  for (const s of currentStudents) {
    const tr = document.createElement('tr');
    if (s.studentId === selectedStudentId) tr.classList.add('sel');
    const tdNo = document.createElement('td');
    tdNo.textContent = s.studentNo;
    const tdName = document.createElement('td');
    tdName.textContent = s.name;
    tr.appendChild(tdNo);
    tr.appendChild(tdName);
    tr.addEventListener('click', () => {
      if (!selectedClassId) return;
      void selectStudent(selectedClassId, s.studentId);
    });
    studentsTbody.appendChild(tr);
  }
}

// Timeline 이벤트를 시간순(오래된 것 → 최신, 서버가 이미 이 순서로 정렬해
// 응답함)으로 나열한다. 이벤트 항목 자체에는 클릭 동작을 두지 않는다(코드
// 상세 보기는 0-D10-D 범위 밖).
function renderTimeline(events: TimelineEvent[]): void {
  timelineUl.innerHTML = '';
  for (const ev of events) {
    const li = document.createElement('li');
    const time = new Date(ev.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    li.textContent = `${time} · [${ev.activityId}] ${describeEvent(ev)}`;
    timelineUl.appendChild(li);
  }
}

function showFeedbackError(message: string, retry: () => void): void {
  feedbackErrorMsgEl.textContent = message;
  feedbackRetryAction = retry;
  setFeedbackSubState('error');
}

// content/작성 시각/수정 시각(수정됐을 때만)/[수정] 버튼을 textContent·
// createElement로만 구성한다 — content는 교사가 직접 입력한 텍스트라
// innerHTML에 넣지 않는다(XSS 방지, 0-D10-E 확정 요구사항 15).
function renderFeedbackList(): void {
  feedbackUl.innerHTML = '';
  for (const f of currentFeedback) {
    const li = document.createElement('li');

    const contentP = document.createElement('p');
    contentP.textContent = f.content;

    const metaP = document.createElement('p');
    metaP.className = 'muted';
    const created = new Date(f.createdAt).toLocaleString('ko-KR', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    metaP.textContent = f.updatedAt !== f.createdAt ? `${created} · 수정됨` : created;

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn ghost small';
    editBtn.textContent = '수정';
    editBtn.addEventListener('click', () => startEditingFeedback(f));

    li.appendChild(contentP);
    li.appendChild(metaP);
    li.appendChild(editBtn);
    feedbackUl.appendChild(li);
  }
}

function startEditingFeedback(f: TeacherFeedbackItem): void {
  editingFeedbackId = f.feedbackId;
  feedbackInput.value = f.content;
  feedbackSaveBtn.textContent = '수정 저장';
  feedbackCancelBtn.hidden = false;
  feedbackInput.focus();
}

async function selectClass(classId: string): Promise<void> {
  if (!currentAccessToken) return;
  const requestToken = currentAccessToken; // 이 요청이 시작된 시점의 세션 — 이후 로그아웃/재로그인과 구분하는 데 쓴다.
  selectedClassId = classId;
  // 학급이 바뀌면 이전에 선택했던 학생/Timeline은 더 이상 유효하지 않다 —
  // 0-D10-D 확정 UI 요구사항("학급 변경 시 selectedStudentId와 Timeline
  // state를 초기화한다").
  selectedStudentId = null;
  currentStudents = [];
  timelineStudentEl.textContent = '';
  feedbackSectionEl.hidden = true;
  currentFeedback = [];
  resetFeedbackForm();
  setFeedbackSubState(null);
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
    currentStudents = body.students;
    renderStudentList();
    setApprovedSubState(currentStudents.length === 0 ? 'no-students' : 'students');
  } catch {
    if (isStale()) return;
    showApprovedError('학생 목록을 불러오지 못했습니다.', () => void selectClass(classId));
  }
}

async function selectStudent(classId: string, studentId: string): Promise<void> {
  if (!currentAccessToken) return;
  const requestToken = currentAccessToken;
  selectedStudentId = studentId;
  renderStudentList(); // 선택 강조 갱신 — 목록 자체는 그대로 유지된다.
  const student = currentStudents.find((s) => s.studentId === studentId);
  timelineStudentEl.textContent = student ? `${student.studentNo}번 ${student.name}` : '';
  feedbackSectionEl.hidden = false;
  currentFeedback = [];
  resetFeedbackForm();
  setApprovedSubState('loading-timeline');
  // Timeline과 완전히 독립적으로 병행 실행한다 — 서로 await하지 않는다
  // (0-D10-E 확정 요구사항 13).
  void loadFeedback(classId, studentId);
  // stale-response guard: 학급 전환(selectedClassId)뿐 아니라 같은 학급
  // 안에서의 다른 학생 전환(selectedStudentId)도 stale 판정에 포함한다 —
  // 학생 A 요청 중 학생 B를 선택했는데 A 응답이 나중에 와도 화면은 B
  // Timeline을 유지해야 한다(0-D10-D 확정 요구사항, 0-D10-C fix의
  // isStale() 패턴을 그대로 확장).
  const isStale = () => classId !== selectedClassId || studentId !== selectedStudentId || requestToken !== currentAccessToken;
  try {
    const res = await fetch(`/api/teacher/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentId)}/events`, {
      headers: { Authorization: `Bearer ${requestToken}` },
    });
    if (isStale()) return;
    if (res.status === 401) {
      resetDashboardState();
      setUiState('logged-out');
      return;
    }
    if (!res.ok) {
      showApprovedError('학습 기록을 불러오지 못했습니다.', () => void selectStudent(classId, studentId));
      return;
    }
    const body = (await res.json()) as TeacherTimelineResponse;
    if (isStale()) return;
    if (body.status !== 'ok') {
      resetDashboardState();
      setUiState('not-approved');
      return;
    }
    renderTimeline(body.events);
    setApprovedSubState(body.events.length === 0 ? 'empty-timeline' : 'timeline');
  } catch {
    if (isStale()) return;
    showApprovedError('학습 기록을 불러오지 못했습니다.', () => void selectStudent(classId, studentId));
  }
}

// Timeline과 완전히 독립적으로 동작한다 — selectStudent()가 이 함수와
// Timeline fetch를 각자 별도의 try/catch·isStale()로 병행 호출할 뿐, 서로
// await하거나 서로의 성공/실패를 참조하지 않는다(0-D10-E 확정 요구사항
// 13). Timeline이 실패해도 이 함수의 결과는 그대로 반영되고, 이 함수가
// 실패해도 Timeline은 그대로 반영된다.
async function loadFeedback(classId: string, studentId: string): Promise<void> {
  if (!currentAccessToken) return;
  const requestToken = currentAccessToken;
  setFeedbackSubState('loading');
  const isStale = () => classId !== selectedClassId || studentId !== selectedStudentId || requestToken !== currentAccessToken;
  try {
    const res = await fetch(`/api/teacher/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentId)}/feedback`, {
      headers: { Authorization: `Bearer ${requestToken}` },
    });
    if (isStale()) return;
    if (res.status === 401) {
      resetDashboardState();
      setUiState('logged-out');
      return;
    }
    if (!res.ok) {
      showFeedbackError('피드백을 불러오지 못했습니다.', () => void loadFeedback(classId, studentId));
      return;
    }
    const body = (await res.json()) as TeacherFeedbackListResponse;
    if (isStale()) return;
    if (body.status !== 'ok') {
      resetDashboardState();
      setUiState('not-approved');
      return;
    }
    currentFeedback = body.feedback;
    renderFeedbackList();
    setFeedbackSubState(currentFeedback.length === 0 ? 'empty' : 'list');
  } catch {
    if (isStale()) return;
    showFeedbackError('피드백을 불러오지 못했습니다.', () => void loadFeedback(classId, studentId));
  }
}

// 작성(editingFeedbackId===null)과 수정(editingFeedbackId 있음)을 같은
// textarea/버튼으로 처리한다(0-D10-E 확정 UX — 별도 modal/page 없음).
// classId/studentId/accessToken/editingFeedbackId를 요청 시작 시점에
// 캡처해, 응답 처리 직전 현재 선택과 비교한다 — 학생 A에서 저장을
// 시작했는데 B로 전환한 뒤 A의 응답이 와도 B 화면을 덮지 않는다(0-D10-E
// 확정 요구사항 14). 서버 저장 자체는 stale 여부와 무관하게 이미
// 완료되므로, stale이면 UI 반영만 건너뛴다 — 나중에 그 학생을 다시
// 선택하면 loadFeedback()이 다시 불러와 정상적으로 보인다.
async function saveFeedback(): Promise<void> {
  if (!currentAccessToken || !selectedClassId || !selectedStudentId) return;
  const content = feedbackInput.value.trim();
  if (content.length === 0) return; // 최종 검증은 서버가 한다 — 여기는 빈 요청을 보내지 않기 위한 최소 확인
  const requestToken = currentAccessToken;
  const requestClassId = selectedClassId;
  const requestStudentId = selectedStudentId;
  const requestFeedbackId = editingFeedbackId;
  const isStale = () =>
    requestClassId !== selectedClassId || requestStudentId !== selectedStudentId || requestToken !== currentAccessToken;

  feedbackSaveBtn.disabled = true;
  try {
    const url = requestFeedbackId
      ? `/api/teacher/classes/${encodeURIComponent(requestClassId)}/students/${encodeURIComponent(requestStudentId)}/feedback/${encodeURIComponent(requestFeedbackId)}`
      : `/api/teacher/classes/${encodeURIComponent(requestClassId)}/students/${encodeURIComponent(requestStudentId)}/feedback`;
    const res = await fetch(url, {
      method: requestFeedbackId ? 'PATCH' : 'POST',
      headers: { Authorization: `Bearer ${requestToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (isStale()) return;
    if (res.status === 401) {
      resetDashboardState();
      setUiState('logged-out');
      return;
    }
    if (!res.ok) {
      // 403(다른 교사/다른 enrollment의 feedbackId)도 여기로 온다 — 사유를
      // 구분해서 보여주지 않는다(서버가 이미 구분 없는 403으로 응답함).
      showFeedbackError('피드백을 저장하지 못했습니다.', () => void saveFeedback());
      return;
    }
    const body = (await res.json()) as TeacherFeedbackWriteResponse;
    if (isStale()) return;
    if (body.status !== 'ok') {
      resetDashboardState();
      setUiState('not-approved');
      return;
    }
    if (requestFeedbackId) {
      currentFeedback = currentFeedback.map((f) => (f.feedbackId === body.feedback.feedbackId ? body.feedback : f));
    } else {
      currentFeedback = [...currentFeedback, body.feedback];
    }
    renderFeedbackList();
    setFeedbackSubState(currentFeedback.length === 0 ? 'empty' : 'list');
    resetFeedbackForm();
  } catch {
    if (isStale()) return;
    showFeedbackError('피드백을 저장하지 못했습니다.', () => void saveFeedback());
  } finally {
    if (!isStale()) feedbackSaveBtn.disabled = false;
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

feedbackRetryBtn.addEventListener('click', () => {
  if (feedbackRetryAction) feedbackRetryAction();
});

feedbackCancelBtn.addEventListener('click', () => {
  resetFeedbackForm();
});

feedbackSaveBtn.addEventListener('click', () => {
  void saveFeedback();
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
      // 실제로 다른 승인 교사로 바뀐 경우에만 이전 대시보드를 초기화한다 —
      // lastApprovedTeacherId===null(최초 로그인)이면 초기화할 이전 상태가
      // 없으므로 건너뛴다. 같은 교사의 teacherId가 그대로면(TOKEN_REFRESHED
      // 등 정상적인 세션 갱신) 선택된 학급/학생/Timeline/Feedback/작성 중인
      // 텍스트를 전혀 건드리지 않는다(0-D10-E security fix 요구사항 3/5).
      const newTeacherId = body.teacher.teacherId;
      const isFirstApproval = lastApprovedTeacherId === null;
      const isDifferentTeacher = !isFirstApproval && lastApprovedTeacherId !== newTeacherId;
      if (isDifferentTeacher) {
        resetDashboardState();
      }
      lastApprovedTeacherId = newTeacherId;
      setUiState('approved', body.teacher.displayName);
      currentAccessToken = session.access_token;
      // 같은 교사의 재검증(TOKEN_REFRESHED 등)이라면 학급 목록을 다시
      // 불러오지 않는다 — 이미 불러온 학급/학생/Timeline/Feedback 화면을
      // 그대로 유지하기 위함이다(요구사항 5). 최초 로그인이거나 실제로
      // 다른 교사로 바뀐 경우에만 새로 불러온다.
      if (isFirstApproval || isDifferentTeacher) {
        void loadTeacherClasses(currentAccessToken);
      }
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
