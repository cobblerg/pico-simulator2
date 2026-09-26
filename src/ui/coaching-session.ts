// AI 코칭 세션 — 최소 상태 모델 (Stage D11-B1-A)
//
// 목적: 향후 AI 학습 코치 UI(D11-B2 이후)가 쓸 mission 단위 coaching state를
// 담을 자리만 먼저 만든다. attempt 판정/readiness 판정/hint level/hint
// ladder/observation/hypothesis/retry gate/physical verification/reflection
// 등 교육 로직은 이 단계에서 전혀 포함하지 않는다 — 이후 단계(D11-B2~)의 책임이다.
//
// 이 파일은 아직 어디에서도 import되지 않는다(content.ts/student-domain.ts가
// 처음 도입됐을 때와 동일한 "연결 안 된" leaf 모듈) — app.ts의 실제 학생
// 화면 mission 상태와 이번 단계에서 연결하지 않는다. AI Coach UI(버튼/패널/
// drawer)도 이 단계에서 만들지 않는다.
//
// 저장 범위: in-memory(모듈 스코프 Map)뿐이다. localStorage/sessionStorage/
// IndexedDB/Supabase/cookie/서버 API를 전혀 쓰지 않는다 — 페이지가
// reload되면 이 상태는 그냥 사라진다(의도된 동작).
//
// Identity 경계: studentId/enrollmentId/classId/teacherId, 어떤 토큰이나
// 개인정보도 이 상태에 담지 않는다. 학생 identity는 이미 서버 쪽
// student_session 경계(src/server/student-session.ts)에서만 다루므로,
// 클라이언트 coaching state에 복제하지 않는다. missionId는 기존
// mission.id(src/ui/data.ts의 Mission.id)를 그대로 재사용한다 — 새 activity
// identifier를 만들지 않는다.
//
// naming: 프로젝트 전역 convention(student-domain.ts/checkpoint.ts 등)이
// `interface`가 아니라 `export type X = {...}`이므로 이를 그대로 따른다.
export type CoachingSession = {
  missionId: string;
  startedAt: string;
  updatedAt: string;
};

const sessions = new Map<string, CoachingSession>();

// missionId로 기존 세션을 찾아 반환하거나, 없으면 새로 만든다. 접근할 때마다
// updatedAt을 현재 시각으로 갱신한다 — 이번 단계에서 세션 상태를 바꾸는
// 다른 동작이 아직 없으므로, "이 세션에 마지막으로 접근한 시각"이 지금
// 시점에 의미를 줄 수 있는 최소한의 updatedAt 처리다.
export function getOrCreateCoachingSession(missionId: string): CoachingSession {
  const now = new Date().toISOString();
  const existing = sessions.get(missionId);
  if (existing) {
    existing.updatedAt = now;
    return existing;
  }
  const session: CoachingSession = { missionId, startedAt: now, updatedAt: now };
  sessions.set(missionId, session);
  return session;
}
