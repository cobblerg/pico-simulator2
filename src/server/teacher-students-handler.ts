// Public GET /api/teacher/classes/:classId/students 요청 처리 로직
// (Stage 0-D10-C)
//
// 이 파일은 순수 함수다 — Vercel/Node HTTP 타입(동적 라우트 파라미터 추출
// 포함)에 의존하지 않는다. api/teacher/classes/[classId]/students.ts(얇은
// HTTP 어댑터)가 URL에서 classId를 뽑아 이 함수에 문자열로 넘긴다.
//
// 인가 순서(0-D10-C 확정 결정 그대로):
//   1. GET 확인
//   2. Authorization 헤더 → extractBearerToken() → 토큰 무효면 401
//   3. resolveTeacherFromAccessToken()으로 서버가 teacherId를 직접 확보
//      (invalid-token → 401 / not-approved → 200 {status:'not_approved'},
//      /api/teacher/me·/api/teacher/classes와 동일한 규약 유지)
//   4. classId 구조 확인(빈 문자열 등 명백히 잘못된 값이면 400)
//   5. assertTeacherOwnsClass(client, teacherId, classId) — false면 무조건
//      403 {error:'forbidden'}. 존재하지 않는 classId와 다른 교사의
//      classId를 구분하지 않는다(0-D10-C 확정 결정 2 — enumeration 방지).
//   6. 5번을 통과했을 때만 listStudentsForClass()를 호출한다 — 즉 인가에
//      실패하면 학생/enrollment 조회 자체가 실행되지 않는다(테스트로 별도
//      검증, teacher-student-data.ts는 이 handler가 호출하지 않는 한
//      스스로 실행될 방법이 없다).
import { SupabaseClient } from '@supabase/supabase-js';
import { extractBearerToken, resolveTeacherFromAccessToken } from './teacher-session';
import { assertTeacherOwnsClass } from './teacher-authorization';
import { listStudentsForClass, StudentSummary } from './teacher-student-data';

export type TeacherStudentsHandlerResult = { httpStatus: number; body: unknown };

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

export async function handleTeacherStudentsRequest(
  method: string | undefined,
  authorizationHeader: string | undefined | null,
  classId: unknown,
  client: SupabaseClient
): Promise<TeacherStudentsHandlerResult> {
  if (method !== 'GET') {
    return { httpStatus: 405, body: { error: 'method not allowed' } };
  }

  const token = extractBearerToken(authorizationHeader);
  if (!token) {
    return { httpStatus: 401, body: { error: 'unauthorized' } };
  }

  if (!isNonEmptyString(classId)) {
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
    // 존재하지 않는 classId와 다른 교사의 classId를 구분하지 않는다 —
    // 둘 다 동일한 403으로 응답한다(0-D10-C 확정 결정 2).
    return { httpStatus: 403, body: { error: 'forbidden' } };
  }

  let students: StudentSummary[];
  try {
    students = await listStudentsForClass(client, classId);
  } catch {
    return { httpStatus: 500, body: { error: 'internal error' } };
  }

  return { httpStatus: 200, body: { status: 'ok', students } };
}
