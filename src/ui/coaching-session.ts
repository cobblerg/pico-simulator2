// AI 코칭 세션 — mission 단위 in-memory 상태
//
// mission별로 CoachingSession을 관리한다. attempt 판정/readiness 판정/
// hint level/hint ladder/observation/hypothesis/retry gate/physical
// verification/reflection 같은 교육 로직은 포함하지 않는다 — 이 파일은
// 상태 저장소일 뿐이다.
//
// 저장 범위: in-memory(모듈 스코프 Map)뿐이다. localStorage/sessionStorage/
// IndexedDB/Supabase/cookie/서버 API를 쓰지 않으므로, 페이지가 reload되면
// 이 상태는 사라진다(의도된 동작).
//
// Identity 경계: studentId/enrollmentId/classId/teacherId, 어떤 토큰이나
// 개인정보도 이 상태에 담지 않는다. 학생 identity는 서버 쪽 student_session
// 경계(src/server/student-session.ts)에서만 다룬다. missionId는 기존
// mission.id(src/ui/data.ts의 Mission.id)를 그대로 재사용한다.
//
// naming: 프로젝트 전역 convention(student-domain.ts/checkpoint.ts 등)이
// `interface`가 아니라 `export type X = {...}`이므로 이를 그대로 따른다.
//
// StuckReason: 학생이 AI Coach에서 자기보고하는 "지금 어디에서 막혔는지"의
// 4가지 상태. 학생 수준을 AI가 판정하는 값이 아니라 학생이 직접 고르는
// 값이다 — kebab-case 문자열 union은 student-domain.ts의
// StudentEntryResult(status: 'class-not-found' 등)와 동일한 convention을
// 따른다.
export type StuckReason = 'goal-unclear' | 'first-step-unclear' | 'tried-not-working' | 'result-unclear';

export type CoachingSession = {
  missionId: string;
  startedAt: string;
  updatedAt: string;
  stuckReason: StuckReason | null;
};

const sessions = new Map<string, CoachingSession>();

// missionId로 기존 세션을 찾아 반환하거나, 없으면 새로 만든다. 접근할 때마다
// updatedAt을 이 세션에 마지막으로 접근한 시각으로 갱신한다.
export function getOrCreateCoachingSession(missionId: string): CoachingSession {
  const now = new Date().toISOString();
  const existing = sessions.get(missionId);
  if (existing) {
    existing.updatedAt = now;
    return existing;
  }
  const session: CoachingSession = { missionId, startedAt: now, updatedAt: now, stuckReason: null };
  sessions.set(missionId, session);
  return session;
}

// missionId의 세션에 학생이 고른 StuckReason을 기록한다. 세션이 아직
// 없으면 getOrCreateCoachingSession()으로 먼저 만든다 — 별도 Map 조회/생성
// 로직을 여기서 다시 구현하지 않는다. student identity는 이 함수의
// 인자/반환값 어디에도 없다.
export function setStuckReason(missionId: string, reason: StuckReason): CoachingSession {
  const session = getOrCreateCoachingSession(missionId);
  session.stuckReason = reason;
  session.updatedAt = new Date().toISOString();
  return session;
}
