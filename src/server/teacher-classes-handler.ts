// Public GET /api/teacher/classes 요청 처리 로직 (Stage 0-D10-B)
//
// 이 파일은 순수 함수다 — Vercel/Node HTTP 타입에 의존하지 않는다.
// api/teacher/classes.ts(얇은 HTTP 어댑터)가 이 함수를 감싼다.
//
// 이 endpoint의 목적은 "이 교사가 담당하는 학급 목록"만 반환하는 것이다 —
// 학생 목록/timeline/feedback은 이번 단계 범위 밖이다(0-D10-B design
// review §범위).
//
// 흐름: Authorization 헤더 → extractBearerToken() → 토큰 무효면 즉시 401.
// 유효하면 resolveTeacherFromAccessToken()으로 teacherId를 서버가 직접
// 확보한다(teacher-me-handler.ts와 동일한 재사용) — 이 시점부터 이 handler
// 안 어디에도 브라우저가 보낸 teacherId를 받는 코드 경로가 없다(구조적으로
// 요청 body/query 자체를 읽지 않는다, GET이므로). 승인된 teacherId를
// 확보한 뒤에만 listTeacherClasses()를 호출한다.
//
// 응답 설계: "인증 실패(401)"와 "인증은 성공했지만 미승인(200
// not_approved)"을 /api/teacher/me와 동일한 규약으로 구분한다 — 이 endpoint
// 만 다른 규약을 쓰면 브라우저(teacher-app.ts 이후 확장분)가 두 가지
// 다른 판단 로직을 가져야 하므로 일관성을 깬다. auth_user_id나 다른 내부
// DB 상태는 어떤 분기에서도 응답에 넣지 않는다.
import { SupabaseClient } from '@supabase/supabase-js';
import { extractBearerToken, resolveTeacherFromAccessToken } from './teacher-session';
import { listTeacherClasses, TeacherClassSummary } from './teacher-authorization';

export type TeacherClassesHandlerResult = { httpStatus: number; body: unknown };

export async function handleTeacherClassesRequest(
  method: string | undefined,
  authorizationHeader: string | undefined | null,
  client: SupabaseClient
): Promise<TeacherClassesHandlerResult> {
  if (method !== 'GET') {
    return { httpStatus: 405, body: { error: 'method not allowed' } };
  }

  const token = extractBearerToken(authorizationHeader);
  if (!token) {
    return { httpStatus: 401, body: { error: 'unauthorized' } };
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

  // 이 시점의 resolved.teacher.teacherId만이 신뢰할 수 있는 teacherId다 —
  // listTeacherClasses()에 이 값 외에는 어떤 것도 넘기지 않는다.
  let classes: TeacherClassSummary[];
  try {
    classes = await listTeacherClasses(client, resolved.teacher.teacherId);
  } catch {
    return { httpStatus: 500, body: { error: 'internal error' } };
  }

  return { httpStatus: 200, body: { status: 'ok', classes } };
}
