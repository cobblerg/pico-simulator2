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
import { parseRosterPasteText, rosterValidationReasonToMessage, type RosterValidationReason } from './teacher-roster-parser';

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

const classCreateForm = el<HTMLFormElement>('t-cc-form');
const ccSchoolYearInput = el<HTMLInputElement>('t-cc-schoolyear');
const ccGradeInput = el<HTMLInputElement>('t-cc-grade');
const ccClassNumberInput = el<HTMLInputElement>('t-cc-classnumber');
const ccSubmitBtn = el<HTMLButtonElement>('t-cc-submit');
const ccErrorEl = el<HTMLElement>('t-cc-error');
const ccSuccessEl = el<HTMLElement>('t-cc-success');

const classesLoadingEl = el<HTMLElement>('t-classes-loading');
const classesEmptyEl = el<HTMLElement>('t-classes-empty');
const classesListEl = el<HTMLElement>('t-classes-list');
const classesUl = el<HTMLUListElement>('t-classes-ul');

const selectedClassInfoEl = el<HTMLElement>('t-selected-class-info');
const selectedClassCodeEl = el<HTMLElement>('t-selected-class-code');
const copyClassCodeBtn = el<HTMLButtonElement>('t-copy-class-code');

const rosterSectionEl = el<HTMLElement>('t-roster-section');
const saForm = el<HTMLFormElement>('t-sa-form');
const saStudentNoInput = el<HTMLInputElement>('t-sa-studentno');
const saNameInput = el<HTMLInputElement>('t-sa-name');
const saSubmitBtn = el<HTMLButtonElement>('t-sa-submit');
const saErrorEl = el<HTMLElement>('t-sa-error');
const bulkInput = el<HTMLTextAreaElement>('t-bulk-input');
const bulkPreviewEl = el<HTMLElement>('t-bulk-preview');
const bulkPreviewSummaryEl = el<HTMLElement>('t-bulk-preview-summary');
const bulkPreviewUl = el<HTMLUListElement>('t-bulk-preview-ul');
const bulkSubmitBtn = el<HTMLButtonElement>('t-bulk-submit');
const bulkErrorEl = el<HTMLElement>('t-bulk-error');
const bulkErrorMsgEl = el<HTMLElement>('t-bulk-error-msg');
const bulkErrorUl = el<HTMLUListElement>('t-bulk-error-ul');
const bulkSuccessEl = el<HTMLElement>('t-bulk-success');

const studentsLoadingEl = el<HTMLElement>('t-students-loading');
const studentsEmptyEl = el<HTMLElement>('t-students-empty');
const studentsListEl = el<HTMLElement>('t-students-list');
const studentsTbody = el<HTMLTableSectionElement>('t-students-tbody');
const timelineStudentEl = el<HTMLElement>('t-timeline-student');
const timelineLoadingEl = el<HTMLElement>('t-timeline-loading');
const timelineEmptyEl = el<HTMLElement>('t-timeline-empty');
const timelineListEl = el<HTMLElement>('t-timeline-list');
const timelineUl = el<HTMLUListElement>('t-timeline-ul');
const timelineExpandBtn = el<HTMLButtonElement>('t-timeline-expand');
const pfoSectionEl = el<HTMLElement>('t-pfo-section');
const pfoEmptyEl = el<HTMLElement>('t-pfo-empty');
const pfoResultEl = el<HTMLElement>('t-pfo-result');
const pfoRetryAtEl = el<HTMLElement>('t-pfo-retry-at');
const pfoTotalEl = el<HTMLElement>('t-pfo-total');
const pfoRunEl = el<HTMLElement>('t-pfo-run');
const pfoCheckpointEl = el<HTMLElement>('t-pfo-checkpoint');
const pfoCheckpointMsgEl = el<HTMLElement>('t-pfo-checkpoint-msg');
const pfoCoachEl = el<HTMLElement>('t-pfo-coach');
const pfoActivityEl = el<HTMLElement>('t-pfo-activity');
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

const aiSectionEl = el<HTMLElement>('t-ai-section');
const aiAnalyzeBtn = el<HTMLButtonElement>('t-ai-analyze');
const aiLoadingEl = el<HTMLElement>('t-ai-loading');
const aiEmptyEl = el<HTMLElement>('t-ai-empty');
const aiErrorEl = el<HTMLElement>('t-ai-error');
const aiErrorMsgEl = el<HTMLElement>('t-ai-error-msg');
const aiRetryBtn = el<HTMLButtonElement>('t-ai-retry');
const aiResultEl = el<HTMLElement>('t-ai-result');
const aiSummaryEl = el<HTMLElement>('t-ai-summary');
const aiObservationsUl = el<HTMLUListElement>('t-ai-observations');
const aiHelpUsageEl = el<HTMLElement>('t-ai-help-usage');
const aiRetryChangeEl = el<HTMLElement>('t-ai-retry-change');
const aiCheckPointsUl = el<HTMLUListElement>('t-ai-checkpoints');
const aiSuggestedEl = el<HTMLElement>('t-ai-suggested');
const aiCopyBtn = el<HTMLButtonElement>('t-ai-copy');

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

// D11-C4: 학생 등록 성공 뒤 "no-students → students"로만 안전하게 승격시키기
// 위해 현재 하위 상태를 기억한다(§3/§5/§6.E 요구사항 — 이미 timeline/error
// 등 더 깊은 상태에 있을 때 등록 성공으로 그 상태를 되돌리면 안 된다). 이
// 변수 하나 추가 외에 기존 상태기계 구조는 바꾸지 않는다.
let approvedSubState: ApprovedSubState = null;

function setApprovedSubState(state: ApprovedSubState): void {
  approvedSubState = state;
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

// AI 분석 영역 전용 하위 상태 — ApprovedSubState/FeedbackSubState와 완전히
// 독립적인 세 번째 축이다(0-D11-A). 'idle'은 학생을 선택했지만 아직
// [AI 학습과정 분석] 버튼을 누르지 않은 초기 상태이고, 'empty'는 서버가
// 학습 기록이 없어 OpenAI를 호출하지 않고 analysis:null을 돌려준 경우다
// (0-D11-A §8) — 이 둘을 구분해야 "아직 분석을 요청하지 않음"과 "분석할
// 기록이 없음"을 다르게 보여줄 수 있다. aiAnalyzeBtn 자체는 이 상태와
// 무관하게 항상 보이며(다시 분석 요청 가능), loading 중에만 disabled로
// 막는다(runAIAnalysis에서 처리).
type AISubState = null | 'idle' | 'loading' | 'empty' | 'result' | 'error';

function setAISubState(state: AISubState): void {
  aiLoadingEl.hidden = state !== 'loading';
  aiEmptyEl.hidden = state !== 'empty';
  aiErrorEl.hidden = state !== 'error';
  aiResultEl.hidden = state !== 'result';
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

// teacher-classes-handler.ts POST 성공 응답과 동일한 shape(D11-C2). classCode는
// 서버가 생성한 값을 그대로 받아 화면에 표시한다 — 이 파일이 classCode를
// 만들거나 요청 body에 넣지 않는다.
type TeacherClassCreateResponse = { status: 'ok'; schoolClass: TeacherClassSummary } | { status: 'not_approved' };

type StudentSummary = { enrollmentId: string; studentId: string; studentNo: string; name: string };

// teacher-roster-creation.ts(D11-C3)의 RegisterRosterCreatedEntry/
// RegisterRosterValidationError와 동일한 shape. 단건 등록도 bulk와 같은
// 경로(entries 배열 길이 1)로 보내므로(D11-C3 §14) 응답 타입도 하나만
// 정의한다 — 별도 single 응답 타입을 만들지 않는다.
type RegisterRosterCreatedEntry = { studentId: string; enrollmentId: string; studentNo: string; name: string };
type RosterValidationErrorItem = { index: number; studentNo: string; reason: RosterValidationReason };
type TeacherRosterRegisterResponse = { status: 'ok'; students: RegisterRosterCreatedEntry[] } | { status: 'not_approved' };
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

// teacher-timeline-data.ts의 PostFeedbackObservation과 동일한 shape(D11-B12).
// feedbackId/teacherId/enrollmentId/studentId/classId/eventId를 담지 않는다
// — 서버가 애초에 그 값들을 넣지 않으므로 이 타입에도 없다.
type PostFeedbackObservationUI =
  | { hasRetry: false }
  | {
      hasRetry: true;
      retryAt: string;
      totalEvents: number;
      runCount: number;
      checkpointCount: number;
      coachCount: number;
      latestActivityId: string | null;
      latestCheckpointMsg: string | null;
    };
type TeacherTimelineResponse =
  | { status: 'ok'; events: TimelineEvent[]; postFeedbackObservation: PostFeedbackObservationUI }
  | { status: 'not_approved' };

// teacher-feedback-data.ts의 TeacherFeedbackDTO와 동일한 shape. eventId는
// 이번 단계에 생성되는 모든 feedback에서 항상 null이지만(0-D10-E 확정
// 결정 1), 향후 호환성을 위해 타입/응답 모두에 포함돼 있다 — 이 파일은
// eventId를 읽거나 표시하지 않는다(특정 이벤트 feedback UI는 LATER).
type TeacherFeedbackItem = { feedbackId: string; content: string; eventId: string | null; createdAt: string; updatedAt: string };
type TeacherFeedbackListResponse = { status: 'ok'; feedback: TeacherFeedbackItem[] } | { status: 'not_approved' };
type TeacherFeedbackWriteResponse = { status: 'ok'; feedback: TeacherFeedbackItem } | { status: 'not_approved' };

// ai-learning-analysis.ts의 AIAnalysisResult와 동일한 shape. analysis는
// 검증된 enrollment에 학습 기록이 하나도 없을 때만 null이다(서버가
// OpenAI를 호출하지 않고 즉시 반환하는 정상적인 빈 상태, 0-D11-A §8) —
// 그 외의 모든 실패(인증/권한/provider 오류 등)는 non-200 응답으로 온다.
// D11-B9: helpUsage/retryChange/teacherCheckPoints 3개 필드 추가.
type AIObservation = { text: string; evidence: string[] };
type AITextWithEvidence = { text: string; evidence: string[] };
type AIAnalysisResultUI = {
  summary: string;
  observations: AIObservation[];
  helpUsage: AITextWithEvidence;
  retryChange: AITextWithEvidence;
  teacherCheckPoints: string[];
  suggestedFeedback: string;
};
type AIAnalysisResponse = { status: 'ok'; analysis: AIAnalysisResultUI | null } | { status: 'not_approved' };

// 실제로 존재하는 25개 event_type만 다룬다(learning-event-handler.ts의
// ALLOWED_EVENT_TYPES와 정확히 같은 집합) — 새 event type을 여기서 만들어
// 내지 않는다. 매핑에 없는 값이 방어적으로 와도 raw event_type을 그대로
// 보여준다(폴백일 뿐, 정상 경로에서는 발생하지 않는다).
// D11-B Regression Test Gate: export는 semantic unit test(tests/ui/*)를
// 위한 가시성 변경일 뿐이다 — 이 파일은 esbuild가 IIFE로 번들하는 entry
// point라 이 export가 실제 dist 산출물의 동작을 바꾸지 않는다(0개
// export이던 기존 상태와 번들 결과가 동일). teacher-app.ts 자체를
// import하면 모듈 최상단에서 즉시 document.getElementById를 호출해(el()
// 헬퍼) DOM이 없는 환경(Vitest 기본 node 환경)에서는 import 자체가
// 실패한다 — 그래서 실제 테스트는 이 export를 직접 쓰지 않고 source
// text 검사로 대체했다(tests/ui/teacher-regression.test.ts 주석 참고).
// 이 export는 향후 DOM 환경이 도입될 때를 대비한 최소 준비일 뿐이다.
export const EVENT_LABELS: Record<string, string> = {
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
  'coach-open': 'AI 학습 코치 시작',
  'coach-hint': 'AI 코치 힌트 요청',
  'coach-retry': 'AI 코치 재시도',
  'coach-reflection': 'AI 코치 학습 성찰',
  'feedback-retry': '교사 피드백 후 다시 시도 선택',
};

// resolved는 학생이 "해결되었다"고 스스로 응답/선택했다는 사실만 증명한다
// — 실제 문제 해결/정답/이해/학습 성공을 검증하지 않는다(AI prompt의
// resolved 자기보고 원칙과 동일, D11-B Stabilization 1). 라벨에도 그
// 자기보고 성격이 드러나야 교사가 검증된 사실로 오인하지 않는다. re-observe는
// "다시 관찰하기로 선택했다"는 행동 사실만 나타내 이미 정확하므로 그대로
// 둔다.
export const COACH_REFLECTION_CHOICE_LABELS: Record<string, string> = {
  're-observe': '다시 관찰',
  resolved: '해결됐다고 응답',
};

// checkpoint는 ok에 따라 "통과"/"미통과"만 덧붙인다 — ok:true를 "활동
// 완료"라고 표현하지 않는다(0-D10-D design review §3에서 확인한 대로,
// 학생이 통과 이후에도 계속 시도할 수 있어 "완료"는 현재 데이터로 확정할
// 수 없는 의미이기 때문). error는 payload.type(예외 클래스명)이 있으면
// 덧붙여 어떤 오류였는지 바로 알 수 있게 한다. coach-hint/coach-reflection도
// 같은 패턴으로 payload의 level/choice를 라벨 뒤에 덧붙인다.
export function describeEvent(ev: TimelineEvent): string {
  const label = EVENT_LABELS[ev.eventType] ?? ev.eventType;
  const payload = (ev.payload && typeof ev.payload === 'object' ? ev.payload : {}) as Record<string, unknown>;
  if (ev.eventType === 'checkpoint') {
    return `${label} · ${payload.ok ? '통과' : '미통과'}`;
  }
  if (ev.eventType === 'error' && typeof payload.type === 'string' && payload.type.length > 0) {
    return `${label} · ${payload.type}`;
  }
  if (ev.eventType === 'coach-hint' && typeof payload.level === 'number') {
    return `${label} · ${payload.level}단계`;
  }
  if (ev.eventType === 'coach-reflection' && typeof payload.choice === 'string') {
    const choiceLabel = COACH_REFLECTION_CHOICE_LABELS[payload.choice];
    if (choiceLabel) return `${label} · ${choiceLabel}`;
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
// 붙여넣기 textarea를 파싱한 결과를 보관한다 — 이 값이 실제 POST body가
// 되므로, textarea 원문을 다시 읽어 파싱하지 않고 항상 이 배열을 그대로
// 전송한다(preview에 보인 것과 실제 전송되는 것이 항상 같음을 보장).
let currentBulkEntries: ReturnType<typeof parseRosterPasteText> = [];
let retryAction: (() => void) | null = null;

let currentFeedback: TeacherFeedbackItem[] = [];
let editingFeedbackId: string | null = null;
let feedbackRetryAction: (() => void) | null = null;

// AI 분석 결과는 어디에도 저장하지 않는다 — 이 모듈 상태가 유일한 보관
// 위치이며, 학생/학급 전환이나 로그아웃 시 resetDashboardState()/
// selectClass()/selectStudent()가 곧바로 비운다(0-D11-A 확정 결정:
// "ephemeral only — DB/localStorage/sessionStorage에 저장하지 않는다").
let currentAIAnalysis: AIAnalysisResultUI | null = null;
let aiRetryAction: (() => void) | null = null;

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
  // D11-C4: 학급 생성 폼(어떤 학급에도 종속되지 않음)과 학급별 로스터
  // 관리 UI(선택된 학급 코드, 단건/bulk 등록 폼)를 로그아웃/교사 전환 시
  // 완전히 초기화한다 — 이전 교사가 입력하던 값이 다음 교사 화면에
  // 남아있지 않게 한다.
  classCreateForm.reset();
  ccErrorEl.hidden = true;
  ccSuccessEl.hidden = true;
  selectedClassInfoEl.hidden = true;
  selectedClassCodeEl.textContent = '';
  rosterSectionEl.hidden = true;
  saForm.reset();
  saErrorEl.hidden = true;
  bulkInput.value = '';
  currentBulkEntries = [];
  renderBulkPreview();
  bulkErrorEl.hidden = true;
  bulkSuccessEl.hidden = true;
  timelineStudentEl.textContent = '';
  feedbackSectionEl.hidden = true;
  currentFeedback = [];
  feedbackRetryAction = null;
  resetFeedbackForm();
  setFeedbackSubState(null);
  pfoSectionEl.hidden = true;
  aiSectionEl.hidden = true;
  currentAIAnalysis = null;
  aiRetryAction = null;
  aiAnalyzeBtn.disabled = false;
  setAISubState(null);
  setApprovedSubState(null);
  // hidden 속성만으로는 "화면에서 사라졌다"일 뿐, 이전 교사의 실제 렌더링된
  // DOM 노드는 다음 성공적인 렌더링 전까지 그대로 남아있다 — 일반적인 학급/
  // 학생 전환에서는 hidden만으로 충분했지만(재렌더링 전에는 어차피 사용자가
  // 볼 수 없으므로), 로그아웃 없이 다른 승인 교사로 바뀌는 경우(0-D10-E
  // security fix가 다루는 시나리오)에는 애매함을 남기지 않기 위해 다섯
  // 목록/영역의 실제 DOM 내용을 여기서 완전히 비운다(AI 분석 결과도
  // 동일하게 취급 — 이전 학생의 AI 요약/관찰/피드백 초안 텍스트가 남아있게
  // 두지 않는다).
  classesUl.innerHTML = '';
  studentsTbody.innerHTML = '';
  timelineUl.innerHTML = '';
  collapseTimeline();
  feedbackUl.innerHTML = '';
  aiObservationsUl.innerHTML = '';
  aiCheckPointsUl.innerHTML = '';
  aiSummaryEl.textContent = '';
  aiHelpUsageEl.textContent = '';
  aiRetryChangeEl.textContent = '';
  aiSuggestedEl.textContent = '';
  pfoRetryAtEl.textContent = '';
  pfoTotalEl.textContent = '';
  pfoRunEl.textContent = '';
  pfoCheckpointEl.textContent = '';
  pfoCheckpointMsgEl.textContent = '';
  pfoCoachEl.textContent = '';
  pfoActivityEl.textContent = '';
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

// ---------- D11-C4: 학급 생성 + 로스터(단건/bulk) 등록 ----------
//
// 이 블록의 함수들은 기존 selectClass/selectStudent의 fetch/isStale 패턴을
// 그대로 따른다 — 요청 시작 시점의 accessToken/classId를 캡처해 응답
// 처리 직전 현재 선택과 비교하고, stale이면 UI 반영을 건너뛴다.

// currentBulkEntries(파싱 결과)만 그린다 — textarea 원문을 다시 파싱하지
// 않는다. 미리보기는 최대 20행만 렌더링하고 나머지는 "외 N명"으로 요약한다
// (§10 "UI 복잡도가 크게 증가하면 parsed count + 첫 몇 행 preview 정도로
// 단순화" — 붙여넣은 인원이 아주 많아도 DOM이 과도하게 커지지 않게 한다).
const BULK_PREVIEW_MAX_ROWS = 20;

function renderBulkPreview(): void {
  bulkPreviewUl.innerHTML = '';
  if (currentBulkEntries.length === 0) {
    bulkPreviewEl.hidden = true;
    bulkSubmitBtn.disabled = true;
    return;
  }
  bulkPreviewEl.hidden = false;
  bulkPreviewSummaryEl.textContent = `등록 예정 ${currentBulkEntries.length}명`;
  for (const entry of currentBulkEntries.slice(0, BULK_PREVIEW_MAX_ROWS)) {
    const li = document.createElement('li');
    li.textContent = `${entry.studentNo} | ${entry.name.length > 0 ? entry.name : '(이름 없음)'}`;
    bulkPreviewUl.appendChild(li);
  }
  if (currentBulkEntries.length > BULK_PREVIEW_MAX_ROWS) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = `외 ${currentBulkEntries.length - BULK_PREVIEW_MAX_ROWS}명`;
    bulkPreviewUl.appendChild(li);
  }
  bulkSubmitBtn.disabled = false;
}

// 서버(teacher-roster-creation.ts)가 구분하는 결과를 그대로 discriminated
// union으로 옮긴다 — reason 문자열 등은 여기서 해석하지 않고 호출부가
// rosterValidationReasonToMessage()로 변환한다.
type RegisterRosterOutcome =
  | { kind: 'ok'; created: RegisterRosterCreatedEntry[] }
  | { kind: 'validation-failed'; errors: RosterValidationErrorItem[] }
  | { kind: 'duplicate-conflict' }
  | { kind: 'unauthorized' }
  | { kind: 'not-approved' }
  | { kind: 'error' };

// accessToken/classId를 전역 상태(currentAccessToken/selectedClassId)에서
// 읽지 않고 인자로만 받는다 — 호출부(addSingleStudent/submitBulkRoster)가
// 각자 요청 시작 시점의 값을 캡처해 넘기고, 응답을 받은 뒤 stale 여부를
// 직접 판단한다(selectClass/selectStudent와 동일한 책임 분리).
async function postRosterEntries(
  accessToken: string,
  classId: string,
  entries: { studentNo: string; name: string }[]
): Promise<RegisterRosterOutcome> {
  let res: Response;
  try {
    res = await fetch(`/api/teacher/classes/${encodeURIComponent(classId)}/students`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries }),
    });
  } catch {
    return { kind: 'error' };
  }

  if (res.status === 401) return { kind: 'unauthorized' };
  if (res.status === 409) return { kind: 'duplicate-conflict' };
  if (res.status === 400) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { kind: 'error' };
    }
    const details = (body as { details?: unknown }).details;
    if (Array.isArray(details)) {
      return { kind: 'validation-failed', errors: details as RosterValidationErrorItem[] };
    }
    return { kind: 'error' };
  }
  if (!res.ok) return { kind: 'error' };

  let body: TeacherRosterRegisterResponse;
  try {
    body = (await res.json()) as TeacherRosterRegisterResponse;
  } catch {
    return { kind: 'error' };
  }
  if (body.status !== 'ok') return { kind: 'not-approved' };
  return { kind: 'ok', created: body.students };
}

// 생성된 학생을 currentStudents에 이어붙이고 다시 그린다 — GET을 다시
// 호출하지 않는다(서버 응답이 이미 필요한 identity 전부를 담고 있으므로
// "local state 안전 업데이트" 쪽을 선택했다, §8). 현재 하위 상태가
// 'no-students'일 때만 'students'로 승격한다 — 이미 Timeline/오류 등 더
// 깊은 상태에 있으면 그 화면을 그대로 유지한다(등록 성공 때문에 보고
// 있던 학생 Timeline이 사라지면 안 된다).
function appendCreatedStudents(created: RegisterRosterCreatedEntry[]): void {
  currentStudents = [...currentStudents, ...created.map((c) => ({ enrollmentId: c.enrollmentId, studentId: c.studentId, studentNo: c.studentNo, name: c.name }))];
  renderStudentList();
  if (approvedSubState === 'no-students') {
    setApprovedSubState('students');
  }
}

function renderBulkValidationErrors(errors: RosterValidationErrorItem[]): void {
  bulkErrorMsgEl.textContent = '등록되지 않았습니다. 표시된 항목을 수정한 뒤 다시 시도하세요.';
  bulkErrorUl.innerHTML = '';
  for (const e of errors) {
    const li = document.createElement('li');
    const noLabel = e.studentNo.length > 0 ? e.studentNo : '(없음)';
    li.textContent = `${e.index + 1}번째 줄(학번 ${noLabel}): ${rosterValidationReasonToMessage(e.reason)}`;
    bulkErrorUl.appendChild(li);
  }
  bulkSuccessEl.hidden = true;
  bulkErrorEl.hidden = false;
}

function showBulkGenericError(message: string): void {
  bulkErrorMsgEl.textContent = message;
  bulkErrorUl.innerHTML = '';
  bulkSuccessEl.hidden = true;
  bulkErrorEl.hidden = false;
}

async function createClass(): Promise<void> {
  if (!currentAccessToken) return;
  const schoolYear = ccSchoolYearInput.value.trim();
  const grade = Number(ccGradeInput.value);
  const classNumber = Number(ccClassNumberInput.value);

  ccErrorEl.hidden = true;
  ccSuccessEl.hidden = true;

  // UI validation만 추가한다(§4) — server contract(C2)는 그대로 둔다.
  // 임의의 상한(예: grade <= 6)은 만들지 않는다.
  if (schoolYear.length === 0) {
    ccErrorEl.textContent = '학년도를 입력하세요.';
    ccErrorEl.hidden = false;
    return;
  }
  if (!Number.isInteger(grade) || grade < 1) {
    ccErrorEl.textContent = '학년은 1 이상의 숫자여야 합니다.';
    ccErrorEl.hidden = false;
    return;
  }
  if (!Number.isInteger(classNumber) || classNumber < 1) {
    ccErrorEl.textContent = '반은 1 이상의 숫자여야 합니다.';
    ccErrorEl.hidden = false;
    return;
  }

  const requestToken = currentAccessToken;
  const isStale = () => requestToken !== currentAccessToken;

  ccSubmitBtn.disabled = true;
  try {
    const res = await fetch('/api/teacher/classes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${requestToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ schoolYear, grade, classNumber }),
    });
    if (isStale()) return;
    if (res.status === 401) {
      resetDashboardState();
      setUiState('logged-out');
      return;
    }
    if (!res.ok) {
      ccErrorEl.textContent = '학급을 만들지 못했습니다. 잠시 후 다시 시도해주세요.';
      ccErrorEl.hidden = false;
      return;
    }
    const body = (await res.json()) as TeacherClassCreateResponse;
    if (isStale()) return;
    if (body.status !== 'ok') {
      resetDashboardState();
      setUiState('not-approved');
      return;
    }
    currentClasses = [...currentClasses, body.schoolClass];
    classCreateForm.reset();
    ccSuccessEl.textContent = `학급이 생성되었습니다. 학급 코드: ${body.schoolClass.classCode}`;
    ccSuccessEl.hidden = false;
    // 새 학급을 곧바로 선택 학급으로 설정한다(§6 "가능하면 새 학급을 현재
    // 선택 학급으로 설정") — selectClass() 자신이 renderClassList()와
    // ApprovedSubState 전환(loading-students → students/no-students)을
    // 전부 처리하므로 여기서 별도로 상태를 바꾸지 않는다.
    void selectClass(body.schoolClass.classId);
  } catch {
    if (isStale()) return;
    ccErrorEl.textContent = '학급을 만들지 못했습니다. 잠시 후 다시 시도해주세요.';
    ccErrorEl.hidden = false;
  } finally {
    if (!isStale()) ccSubmitBtn.disabled = false;
  }
}

async function addSingleStudent(): Promise<void> {
  if (!currentAccessToken || !selectedClassId) return;
  const studentNo = saStudentNoInput.value.trim();
  const name = saNameInput.value.trim();

  saErrorEl.hidden = true;
  if (studentNo.length === 0) {
    saErrorEl.textContent = '학번을 입력하세요.';
    saErrorEl.hidden = false;
    return;
  }
  if (name.length === 0) {
    saErrorEl.textContent = '이름을 입력하세요.';
    saErrorEl.hidden = false;
    return;
  }

  const requestToken = currentAccessToken;
  const requestClassId = selectedClassId;
  const isStale = () => requestClassId !== selectedClassId || requestToken !== currentAccessToken;

  saSubmitBtn.disabled = true;
  const outcome = await postRosterEntries(requestToken, requestClassId, [{ studentNo, name }]);
  if (isStale()) return;
  saSubmitBtn.disabled = false;

  if (outcome.kind === 'unauthorized') {
    resetDashboardState();
    setUiState('logged-out');
    return;
  }
  if (outcome.kind === 'not-approved') {
    resetDashboardState();
    setUiState('not-approved');
    return;
  }
  if (outcome.kind === 'validation-failed') {
    saErrorEl.textContent = outcome.errors.map((e) => rosterValidationReasonToMessage(e.reason)).join(' ');
    saErrorEl.hidden = false;
    return;
  }
  if (outcome.kind === 'duplicate-conflict') {
    saErrorEl.textContent = '같은 학번이 이미 존재합니다.';
    saErrorEl.hidden = false;
    return;
  }
  if (outcome.kind === 'error') {
    saErrorEl.textContent = '학생을 등록하지 못했습니다. 잠시 후 다시 시도해주세요.';
    saErrorEl.hidden = false;
    return;
  }

  saForm.reset();
  appendCreatedStudents(outcome.created);
}

async function submitBulkRoster(): Promise<void> {
  if (!currentAccessToken || !selectedClassId) return;
  if (currentBulkEntries.length === 0) return;

  const requestToken = currentAccessToken;
  const requestClassId = selectedClassId;
  const isStale = () => requestClassId !== selectedClassId || requestToken !== currentAccessToken;
  const entriesToSubmit = currentBulkEntries; // 응답을 기다리는 동안 textarea가 다시 편집될 수 있으므로 스냅샷을 고정한다.

  bulkErrorEl.hidden = true;
  bulkSuccessEl.hidden = true;
  bulkSubmitBtn.disabled = true;

  const outcome = await postRosterEntries(requestToken, requestClassId, entriesToSubmit);
  if (isStale()) return;

  if (outcome.kind === 'unauthorized') {
    resetDashboardState();
    setUiState('logged-out');
    return;
  }
  if (outcome.kind === 'not-approved') {
    resetDashboardState();
    setUiState('not-approved');
    return;
  }
  if (outcome.kind === 'validation-failed') {
    // D11-C3 all-or-nothing 계약 — 하나라도 invalid면 아무도 등록되지
    // 않는다. bulkInput/currentBulkEntries는 그대로 남겨 교사가 표시된
    // 항목만 고쳐 다시 시도할 수 있게 한다(§13).
    renderBulkValidationErrors(outcome.errors);
    bulkSubmitBtn.disabled = false;
    return;
  }
  if (outcome.kind === 'duplicate-conflict') {
    showBulkGenericError('같은 학번이 이미 존재합니다. 등록되지 않았습니다.');
    bulkSubmitBtn.disabled = false;
    return;
  }
  if (outcome.kind === 'error') {
    showBulkGenericError('등록하지 못했습니다. 잠시 후 다시 시도해주세요.');
    bulkSubmitBtn.disabled = false;
    return;
  }

  const count = outcome.created.length;
  bulkInput.value = '';
  currentBulkEntries = [];
  renderBulkPreview();
  bulkSuccessEl.textContent = `${count}명이 등록되었습니다.`;
  bulkSuccessEl.hidden = false;
  appendCreatedStudents(outcome.created);
}

// Timeline 이벤트를 시간순(오래된 것 → 최신, 서버가 이미 이 순서로 정렬해
// 응답함)으로 나열한다. 이벤트 항목 자체에는 클릭 동작을 두지 않는다(코드
// 상세 보기는 0-D10-D 범위 밖).
// D11-B12: "피드백 이후 관찰" card. 가장 최근 feedback-retry 이후 시간순으로
// 관찰된 사실(개수/최근값)만 표시한다 — 특정 feedback과의 인과관계나 학습
// 향상/이해 여부를 판정하는 문구는 절대 넣지 않는다(고정 안내 문구로
// 그 해석 경계를 매번 명시한다).
function renderPostFeedbackObservation(obs: PostFeedbackObservationUI): void {
  pfoEmptyEl.hidden = obs.hasRetry;
  pfoResultEl.hidden = !obs.hasRetry;
  if (!obs.hasRetry) return;

  pfoRetryAtEl.textContent = new Date(obs.retryAt).toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  pfoTotalEl.textContent = `${obs.totalEvents}회`;
  pfoRunEl.textContent = `${obs.runCount}회`;
  pfoCheckpointEl.textContent = `${obs.checkpointCount}회`;
  pfoCheckpointMsgEl.textContent = obs.latestCheckpointMsg ?? '';
  pfoCoachEl.textContent = `${obs.coachCount}회`;
  pfoActivityEl.textContent = obs.latestActivityId ?? '';
}

function renderTimeline(events: TimelineEvent[]): void {
  timelineUl.innerHTML = '';
  for (const ev of events) {
    const li = document.createElement('li');
    const time = new Date(ev.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    li.textContent = `${time} · [${ev.activityId}] ${describeEvent(ev)}`;
    timelineUl.appendChild(li);
  }
}

// D11-B Stabilization 2: 학생 전환 시 항상 compact(축소) 상태로 되돌린다 —
// 이전 학생에서 [확대]해 둔 상태가 새 학생 화면에 남으면 안 된다(요구사항
// §10). 순수 CSS class/button text/aria 토글일 뿐이라 Timeline 데이터나
// scroll 위치 자체를 건드리지 않는다.
function collapseTimeline(): void {
  timelineListEl.classList.remove('t-timeline-list-expanded');
  timelineExpandBtn.textContent = '확대';
  timelineExpandBtn.setAttribute('aria-expanded', 'false');
}

// Timeline fetch가 성공해 render가 끝나고 setApprovedSubState()로 실제
// 화면에 보이게 된 뒤에만 호출해야 한다 — hidden 상태에서는 scrollHeight가
// 0으로 계산되어 아무 효과가 없다(요구사항 §8/§9: render 완료 전 실행 금지,
// 확대/축소 토글 때는 호출하지 않음 — 그때는 이 함수를 다시 부르지 않는다).
function scrollTimelineToLatest(): void {
  timelineListEl.scrollTop = timelineListEl.scrollHeight;
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
  // D11-C4: 선택된 학급 코드는 학생 목록 fetch 성공 여부와 무관하게 즉시
  // 보여준다 — currentClasses에 이미 있는 값이므로 별도 조회가 필요 없다.
  // 학생 목록 fetch가 실패해도(네트워크 오류 등) 교사가 계속 로스터를
  // 관리할 수 있어야 하므로, 이 두 섹션의 표시 여부는 ApprovedSubState가
  // 아니라 "학급이 선택되어 있는가"로만 관리한다(feedbackSectionEl/
  // aiSectionEl과 동일한 독립 축 패턴).
  const cls = currentClasses.find((c) => c.classId === classId);
  selectedClassInfoEl.hidden = false;
  selectedClassCodeEl.textContent = cls ? cls.classCode : '';
  rosterSectionEl.hidden = false;
  saForm.reset();
  saErrorEl.hidden = true;
  bulkInput.value = '';
  currentBulkEntries = [];
  renderBulkPreview();
  bulkErrorEl.hidden = true;
  bulkSuccessEl.hidden = true;
  // 학급이 바뀌면 이전에 선택했던 학생/Timeline은 더 이상 유효하지 않다 —
  // 0-D10-D 확정 UI 요구사항("학급 변경 시 selectedStudentId와 Timeline
  // state를 초기화한다").
  selectedStudentId = null;
  currentStudents = [];
  timelineStudentEl.textContent = '';
  collapseTimeline();
  feedbackSectionEl.hidden = true;
  currentFeedback = [];
  resetFeedbackForm();
  setFeedbackSubState(null);
  pfoSectionEl.hidden = true;
  aiSectionEl.hidden = true;
  currentAIAnalysis = null;
  aiRetryAction = null;
  setAISubState(null);
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
  collapseTimeline();
  feedbackSectionEl.hidden = false;
  currentFeedback = [];
  resetFeedbackForm();
  // D11-B12: pfoSectionEl은 Timeline과 같은 응답(postFeedbackObservation)에서
  // 채워지므로 별도 fetch 없이 Timeline 로드가 끝나면 renderPostFeedbackObservation()이
  // 값을 채운다 — 여기서는 섹션을 보이게만 하고 내용은 비워 이전 학생의
  // 관찰 결과가 잠깐이라도 남지 않게 한다.
  pfoSectionEl.hidden = false;
  pfoRetryAtEl.textContent = '';
  pfoTotalEl.textContent = '';
  pfoRunEl.textContent = '';
  pfoCheckpointEl.textContent = '';
  pfoCheckpointMsgEl.textContent = '';
  pfoCoachEl.textContent = '';
  pfoActivityEl.textContent = '';
  // AI 분석 영역을 보여주되, 이전 학생의 분석 결과는 즉시 비운다 — 단,
  // 자동으로 분석을 다시 요청하지는 않는다(0-D11-A 확정 요구사항: "AI는
  // 명시적 버튼 클릭으로만 호출", 학생 선택만으로 비용이 발생하면 안 됨).
  aiSectionEl.hidden = false;
  currentAIAnalysis = null;
  aiRetryAction = null;
  setAISubState('idle');
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
    renderPostFeedbackObservation(body.postFeedbackObservation);
    setApprovedSubState(body.events.length === 0 ? 'empty-timeline' : 'timeline');
    // setApprovedSubState()가 timelineListEl.hidden을 false로 바꾼 뒤에만
    // 호출한다 — hidden 상태에서는 scrollHeight가 0이라 스크롤이 무의미하다.
    if (body.events.length > 0) scrollTimelineToLatest();
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

function showAIError(message: string, retry: () => void): void {
  aiErrorMsgEl.textContent = message;
  aiRetryAction = retry;
  setAISubState('error');
}

// summary/observation text/helpUsage/retryChange/teacherCheckPoints/
// suggestedFeedback 모두 textContent로만 쓴다 — AI가 생성한 텍스트라도
// 예외 없이 XSS 방지 원칙(0-D10-E 확정 요구사항 15, renderFeedbackList()와
// 동일)을 적용한다. innerHTML은 목록을 비울 때(='')만 쓰고 AI 텍스트를
// 넣는 데는 쓰지 않는다. evidence는 서버가 이미 입력에 실제로 존재했던
// E1/E2/... 순번만 남기도록 검증했으므로(0-D11-A/D11-B9
// sanitizeAnalysisResult), 여기서는 그대로 괄호 안에 붙여 보여주기만 한다.
function textWithEvidence(t: AITextWithEvidence): string {
  return t.evidence.length > 0 ? `${t.text} (근거: ${t.evidence.join(', ')})` : t.text;
}

// D11-B9: helpUsage/retryChange/teacherCheckPoints 중 무엇이 비어 있어도
// (예: 도움 요청 기록이 없어 서버가 text만 채우고 evidence는 빈 배열로
// 준 경우, 혹은 teacherCheckPoints가 빈 배열인 경우) 화면이 깨지지 않아야
// 한다(요구사항 §10) — 문단은 그대로 비워 두고("" textContent), 목록은
// 항목 없이 빈 <ul>로 둔다.
function renderAIAnalysis(analysis: AIAnalysisResultUI): void {
  aiSummaryEl.textContent = analysis.summary;
  aiObservationsUl.innerHTML = '';
  for (const o of analysis.observations) {
    const li = document.createElement('li');
    li.textContent = textWithEvidence(o);
    aiObservationsUl.appendChild(li);
  }
  aiHelpUsageEl.textContent = textWithEvidence(analysis.helpUsage);
  aiRetryChangeEl.textContent = textWithEvidence(analysis.retryChange);
  aiCheckPointsUl.innerHTML = '';
  for (const cp of analysis.teacherCheckPoints) {
    const li = document.createElement('li');
    li.textContent = cp;
    aiCheckPointsUl.appendChild(li);
  }
  aiSuggestedEl.textContent = analysis.suggestedFeedback;
}

// [AI 학습과정 분석] 버튼 클릭으로만 호출된다 — selectStudent()는 이 함수를
// 부르지 않는다(0-D11-A 확정 비용 통제 요구사항 §12: 자동/백그라운드 호출
// 금지). 진행 중에는 버튼을 disabled로 막아 같은 학생에 대한 중복 요청을
// 막는다(0-D11-A 확정 요구사항: "같은 UI 동작에서 병렬 중복 요청 금지").
async function runAIAnalysis(): Promise<void> {
  if (!currentAccessToken || !selectedClassId || !selectedStudentId) return;
  const requestToken = currentAccessToken;
  const requestClassId = selectedClassId;
  const requestStudentId = selectedStudentId;
  // stale-response guard: 요청이 나가 있는 동안 다른 학생/학급으로
  // 전환되거나 로그아웃/재로그인이 일어나면, 이 응답은 더 이상 화면과
  // 무관하다 — Timeline/Feedback과 동일한 패턴(0-D10-D/0-D10-E)을 AI
  // 분석에도 그대로 적용한다. classId A/studentId A/token A로 시작한
  // 요청은 classId A/studentId B로 전환된 뒤에도, 다른 학급으로 전환된
  // 뒤에도, 다른 교사 세션으로 바뀐 뒤에도 절대 렌더링되지 않는다.
  const isStale = () =>
    requestClassId !== selectedClassId || requestStudentId !== selectedStudentId || requestToken !== currentAccessToken;

  setAISubState('loading');
  aiAnalyzeBtn.disabled = true;
  try {
    const res = await fetch(
      `/api/teacher/classes/${encodeURIComponent(requestClassId)}/students/${encodeURIComponent(requestStudentId)}/ai-analysis`,
      { method: 'POST', headers: { Authorization: `Bearer ${requestToken}` } }
    );
    if (isStale()) return;
    if (res.status === 401) {
      resetDashboardState();
      setUiState('logged-out');
      return;
    }
    if (!res.ok) {
      // provider/config/network/malformed 등 모든 실패를 하나의 일반
      // 메시지로 합친다 — API key/provider 세부 정보는 서버가 애초에
      // 브라우저로 보내지 않는다(0-D11-A 확정 UX 요구사항).
      showAIError('AI 분석을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.', () => void runAIAnalysis());
      return;
    }
    const body = (await res.json()) as AIAnalysisResponse;
    if (isStale()) return;
    if (body.status !== 'ok') {
      resetDashboardState();
      setUiState('not-approved');
      return;
    }
    if (body.analysis === null) {
      // 정상적인 빈 상태 — 학습 기록이 없어 서버가 OpenAI를 호출하지 않고
      // 즉시 돌려준 경우다(0-D11-A §8). 오류가 아니다.
      currentAIAnalysis = null;
      setAISubState('empty');
      return;
    }
    currentAIAnalysis = body.analysis;
    renderAIAnalysis(currentAIAnalysis);
    setAISubState('result');
  } catch {
    if (isStale()) return;
    showAIError('AI 분석을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.', () => void runAIAnalysis());
  } finally {
    if (!isStale()) aiAnalyzeBtn.disabled = false;
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

// D11-C4: 학급 생성 + 로스터(단건/bulk) 등록 이벤트 바인딩. 폼 submit은
// 기본 페이지 이동을 막아야 하므로 preventDefault()를 먼저 호출한다
// (다른 곳의 button[type=button] 클릭 핸들러와 달리 이 두 개만 <form>
// submit 이벤트를 쓴다 — Enter 키로도 제출 가능하게 하기 위함).
classCreateForm.addEventListener('submit', (e) => {
  e.preventDefault();
  void createClass();
});

saForm.addEventListener('submit', (e) => {
  e.preventDefault();
  void addSingleStudent();
});

// 입력 즉시 미리보기를 갱신한다(§10) — 서버로는 아직 아무것도 보내지
// 않는다. 이전 오류/성공 메시지는 입력이 바뀌는 순간 지운다.
bulkInput.addEventListener('input', () => {
  currentBulkEntries = parseRosterPasteText(bulkInput.value);
  bulkErrorEl.hidden = true;
  bulkSuccessEl.hidden = true;
  renderBulkPreview();
});

bulkSubmitBtn.addEventListener('click', () => {
  void submitBulkRoster();
});

// 실패해도 조용히 무시한다 — 학급 코드 자체가 이미 화면에 명확한 텍스트로
// 표시되어 있으므로 교사가 직접 선택해 복사할 수 있다(§7: QR/공유링크 등
// 새 기능을 추가하지 않고, 이미 프로젝트가 쓰는 Clipboard API만 재사용).
copyClassCodeBtn.addEventListener('click', () => {
  const code = selectedClassCodeEl.textContent ?? '';
  if (code.length === 0) return;
  const original = copyClassCodeBtn.textContent;
  navigator.clipboard.writeText(code).then(
    () => {
      copyClassCodeBtn.textContent = '복사됨';
      setTimeout(() => {
        copyClassCodeBtn.textContent = original;
      }, 1500);
    },
    () => {}
  );
});

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

// D11-B Stabilization 2: [확대]/[축소] 토글. 같은 #t-timeline-list/#t-timeline-ul을
// 그대로 두고 CSS class만 바꾼다 — 새 fetch/재렌더/scrollTop 강제 이동
// 없음(요구사항 §6/§7). 같은 DOM 요소이므로 브라우저가 scroll 위치를
// 그대로 유지한다.
timelineExpandBtn.addEventListener('click', () => {
  const expanded = timelineListEl.classList.toggle('t-timeline-list-expanded');
  timelineExpandBtn.textContent = expanded ? '축소' : '확대';
  timelineExpandBtn.setAttribute('aria-expanded', String(expanded));
});

aiAnalyzeBtn.addEventListener('click', () => {
  void runAIAnalysis();
});

aiRetryBtn.addEventListener('click', () => {
  if (aiRetryAction) aiRetryAction();
});

// [피드백 입력란에 가져오기]: suggestedFeedback을 textarea 값으로만 채운다
// — 저장 API를 호출하지 않고, Supabase/DB를 전혀 건드리지 않는다(0-D11-A
// 확정 요구사항: "DB 쓰기 없음, 교사가 반드시 기존 저장 버튼을 직접
// 눌러야 한다"). 클릭 시점에 이미 다른 피드백을 수정 중이었다면(
// editingFeedbackId가 설정된 상태) resetFeedbackForm()으로 편집 모드를
// 먼저 해제한다 — 그렇지 않으면 editingFeedbackId가 남은 채로 저장을
// 누르는 순간 AI 초안이 PATCH로 기존에 저장된 다른 피드백을 조용히
// 덮어써버릴 위험이 있다(0-D11-A §20 결정: 항상 새 피드백(POST)으로
// 저장되도록 편집 모드를 먼저 해제한 뒤 채운다 — 기존 미저장 초안을
// 덮어쓰는 것은 어차피 textarea 값 교체이므로 별도 확인 없이 진행한다).
aiCopyBtn.addEventListener('click', () => {
  if (!currentAIAnalysis) return;
  resetFeedbackForm();
  feedbackInput.value = currentAIAnalysis.suggestedFeedback;
  feedbackInput.focus();
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
