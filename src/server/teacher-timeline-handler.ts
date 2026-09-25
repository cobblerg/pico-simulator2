// Public GET /api/teacher/classes/:classId/students/:studentId/events
// 요청 처리 로직 (Stage 0-D10-D)
//
// 이 파일은 순수 함수다 — Vercel/Node HTTP 타입(중첩 동적 라우트 파라미터
// 추출 포함)에 의존하지 않는다.
// api/teacher/classes/[classId]/students/[studentId]/events.ts(얇은 HTTP
// 어댑터)가 URL에서 classId/studentId를 뽑아 이 함수에 문자열로 넘긴다.
//
// 인가 순서(0-D10-D 확정 결정 2 그대로):
//   1. GET 확인
//   2. Authorization 헤더 → extractBearerToken() → 없으면 401
//   3. classId/studentId 구조 확인(빈 문자열 등이면 400)
//   4. resolveTeacherFromAccessToken()으로 서버가 teacherId를 직접 확보
//      (invalid-token → 401 / not-approved → 200 {status:'not_approved'})
//   5. assertTeacherOwnsClass(client, teacherId, classId) — false면 403
//   6. assertStudentEnrolledInClass(client, classId, studentId) — null이면
//      403(5번과 동일한 응답 — 존재하지 않는 classId/studentId, 다른
//      교사의 classId, 소속되지 않은 studentId를 전부 구분하지 않는다,
//      0-D10-D 확정 결정 3)
//   7. 5·6을 모두 통과했을 때만, 6번에서 얻은 검증된 enrollmentId로
//      listRecentLearningEventsForEnrollment()를 호출한다 — URL의
//      classId/studentId 자체를 이 시점 이후로 다시 쓰지 않는다.
import { SupabaseClient } from '@supabase/supabase-js';
import { extractBearerToken, resolveTeacherFromAccessToken } from './teacher-session';
import { assertTeacherOwnsClass, assertStudentEnrolledInClass } from './teacher-authorization';
import { listRecentLearningEventsForEnrollment, TeacherTimelineEvent } from './teacher-timeline-data';

export type TeacherTimelineHandlerResult = { httpStatus: number; body: unknown };

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

export async function handleTeacherTimelineRequest(
  method: string | undefined,
  authorizationHeader: string | undefined | null,
  classId: unknown,
  studentId: unknown,
  client: SupabaseClient
): Promise<TeacherTimelineHandlerResult> {
  if (method !== 'GET') {
    return { httpStatus: 405, body: { error: 'method not allowed' } };
  }

  const token = extractBearerToken(authorizationHeader);
  if (!token) {
    return { httpStatus: 401, body: { error: 'unauthorized' } };
  }

  if (!isNonEmptyString(classId) || !isNonEmptyString(studentId)) {
    return { httpStatus: 400, body: { error: 'invalid request' } };
  }

  let resolved;
  try {
    resolved = await resolveTeacherFromAccessToken(client, token);
  } catch {
    return { httpStatus: 500, body: { error: 'internal error' } };
  }

  if (resolved.status === 'invalid-token') {
    return { httpStatus: 401, body: { error: 'unauthorized' } };
  }
  if (resolved.status === 'not-approved') {
    return { httpStatus: 200, body: { status: 'not_approved' } };
  }

  let owns: boolean;
  try {
    owns = await assertTeacherOwnsClass(client, resolved.teacher.teacherId, classId);
  } catch {
    return { httpStatus: 500, body: { error: 'internal error' } };
  }
  if (!owns) {
    return { httpStatus: 403, body: { error: 'forbidden' } };
  }

  let enrollmentId: string | null;
  try {
    enrollmentId = await assertStudentEnrolledInClass(client, classId, studentId);
  } catch {
    return { httpStatus: 500, body: { error: 'internal error' } };
  }
  if (!enrollmentId) {
    // 존재하지 않는 studentId, 그 class 소속이 아닌 studentId, class A +
    // class B 학생 ID 조합 공격 전부 여기서 동일한 403으로 처리된다(0-D10-D
    // 확정 결정 3) — assertTeacherOwnsClass()의 403과 응답 형태가 완전히
    // 같아 두 실패 단계 중 어디서 막혔는지도 외부에서 구분할 수 없다.
    return { httpStatus: 403, body: { error: 'forbidden' } };
  }

  let events: TeacherTimelineEvent[];
  try {
    events = await listRecentLearningEventsForEnrollment(client, enrollmentId);
  } catch {
    return { httpStatus: 500, body: { error: 'internal error' } };
  }

  return { httpStatus: 200, body: { status: 'ok', events } };
}
