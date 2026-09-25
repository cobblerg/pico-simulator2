// Public GET /api/teacher/me 요청 처리 로직 (Stage 0-D10-A)
//
// 이 파일은 순수 함수다 — Vercel/Node HTTP 타입에 의존하지 않는다.
// api/teacher/me.ts(얇은 HTTP 어댑터)가 이 함수를 감싼다.
//
// 이 endpoint의 목적은 "현재 Google 로그인 사용자가 승인된 PicoSim
// 교사인가"만 답하는 것이다 — 학급/학생/timeline/feedback 등 어떤 데이터도
// 다루지 않는다(0-D10-A 범위 밖).
//
// public response 설계: 세 가지 내부 상태(토큰 없음/무효, 유효하지만 미승인,
// 승인)를 브라우저가 구분해야 한다(teacher-app.ts가 로그인/미승인/승인 세
// 화면을 각각 보여줘야 하므로) — 단 이 구분은 enumeration 위험이 없다.
// 모든 경우가 "요청자 자기 자신의 access token"이라는 이미 알려진 정보를
// 근거로 한 자기 자신에 대한 판정이라, 다른 사용자/다른 teacher의 존재
// 여부를 알아낼 수 있는 통로가 아니다(0-D7-B의 "실패 사유를 하나로 접는다"
// 원칙은 "제3자 정보를 추측 가능하게 하는 경우"에 적용되는 것이지, 이
// 경우와는 성격이 다르다). 그래서 여기서는:
//   - Authorization 헤더 없음/형식 오류/토큰 무효 → 401 unauthorized
//     (교사 자신이 로그인하지 않았거나 세션이 죽었다는 뜻 — teacher-app.ts는
//     이 경우 "로그아웃" 화면으로 되돌아간다)
//   - 유효한 토큰이지만 teacher 미등록 → 200 {status:'not_approved'}
//     (인증 자체는 성공했으므로 401이 아니다 — "등록되지 않은 교사
//     계정입니다" 화면을 보여줘야 하는 명확히 다른 상태)
//   - 승인된 teacher → 200 {status:'ok', teacher:{teacherId, displayName}}
// teacher.authUserId는 이 응답 어디에도 넣지 않는다(0-D10-A 5번 요구사항) —
// TeacherIdentity 타입 자체가 authUserId 필드를 갖지 않으므로 구조적으로
// 넣을 수도 없다.
import { SupabaseClient } from '@supabase/supabase-js';
import { extractBearerToken, resolveTeacherFromAccessToken } from './teacher-session';

export type TeacherMeHandlerResult = { httpStatus: number; body: unknown };

export async function handleTeacherMeRequest(
  method: string | undefined,
  authorizationHeader: string | undefined | null,
  client: SupabaseClient
): Promise<TeacherMeHandlerResult> {
  if (method !== 'GET') {
    return { httpStatus: 405, body: { error: 'method not allowed' } };
  }

  const token = extractBearerToken(authorizationHeader);
  if (!token) {
    return { httpStatus: 401, body: { error: 'unauthorized' } };
  }

  let result;
  try {
    result = await resolveTeacherFromAccessToken(client, token);
  } catch {
    // infrastructure failure(Supabase 호출 실패 등) — 세부 정보를 클라이언트에
    // 노출하지 않는다. student-entry-handler.ts/learning-event-handler.ts와
    // 동일한 방침.
    return { httpStatus: 500, body: { error: 'internal error' } };
  }

  if (result.status === 'invalid-token') {
    return { httpStatus: 401, body: { error: 'unauthorized' } };
  }
  if (result.status === 'not-approved') {
    return { httpStatus: 200, body: { status: 'not_approved' } };
  }
  return {
    httpStatus: 200,
    body: { status: 'ok', teacher: { teacherId: result.teacher.teacherId, displayName: result.teacher.displayName } },
  };
}
