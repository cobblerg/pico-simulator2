// Vercel Node.js Serverless Function: GET /api/teacher/classes (Stage 0-D10-B)
//
// 얇은 HTTP 어댑터일 뿐이다 — 실제 요청 처리 로직(메서드/Authorization
// 헤더/토큰 검증/teacher 조회/학급 목록 조회/public response 매핑)은
// Vercel 전용 타입에 의존하지 않는 순수 함수
// src/server/teacher-classes-handler.ts의 handleTeacherClassesRequest()에
// 있다. 이 파일은 그 함수를 부르고 HTTP status/JSON body를 써주기만 한다.
//
// api/teacher/me.ts와 동일한 패턴 — SUPABASE_URL/SUPABASE_SECRET_KEY는
// createServerSupabaseClient()가 process.env에서만 읽는다. 학생
// student_session 쿠키는 이 endpoint와 전혀 무관하다.
import type { IncomingMessage, ServerResponse } from 'http';
import { createServerSupabaseClient } from '../../src/server/supabase';
import { handleTeacherClassesRequest } from '../../src/server/teacher-classes-handler';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const client = createServerSupabaseClient();
    const { httpStatus, body } = await handleTeacherClassesRequest(req.method, req.headers.authorization, client);

    res.statusCode = httpStatus;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  } catch {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'internal error' }));
  }
}
