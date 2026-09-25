// Vercel Node.js Serverless Function: GET /api/teacher/me (Stage 0-D10-A)
//
// 얇은 HTTP 어댑터일 뿐이다 — 실제 요청 처리 로직(메서드/Authorization
// 헤더/토큰 검증/teacher 조회/public response 매핑)은 Vercel 전용 타입에
// 의존하지 않는 순수 함수 src/server/teacher-me-handler.ts의
// handleTeacherMeRequest()에 있다. 이 파일은 그 함수를 부르고 HTTP
// status/JSON body를 써주기만 한다.
//
// SUPABASE_URL/SUPABASE_SECRET_KEY는 createServerSupabaseClient()(서버 전용
// 모듈)가 process.env에서만 읽는다 — 이 파일에는 어떤 secret도 직접
// 작성하지 않는다. 학생 student_session 쿠키는 이 endpoint와 전혀 무관하다
// — 오직 req.headers.authorization(Supabase Auth access token)만 읽는다.
import type { IncomingMessage, ServerResponse } from 'http';
import { createServerSupabaseClient } from '../../src/server/supabase';
import { handleTeacherMeRequest } from '../../src/server/teacher-me-handler';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const client = createServerSupabaseClient();
    const { httpStatus, body } = await handleTeacherMeRequest(req.method, req.headers.authorization, client);

    res.statusCode = httpStatus;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  } catch {
    // 여기까지 온 예외(예: 환경변수 누락, 클라이언트 생성 실패)도 클라이언트에
    // 세부 정보를 노출하지 않는다.
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'internal error' }));
  }
}
