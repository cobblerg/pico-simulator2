// Vercel Node.js Serverless Function: GET /api/student-feedback (Stage D11-B10)
//
// 얇은 HTTP 어댑터일 뿐이다 — 실제 요청 처리 로직(메서드/쿠키/session
// 검증/조회/응답 축소)은 Vercel 전용 타입에 의존하지 않는 순수 함수
// src/server/student-feedback-handler.ts의 handleStudentFeedbackRequest()에
// 있다. 이 파일은 그 함수를 부르고 HTTP status/JSON body를 써주기만 한다.
//
// studentId/enrollmentId/classId를 이 파일이나 handler가 request에서 읽어
// 신뢰하는 일은 없다 — 오직 req.headers.cookie의 student_session만 identity
// 근거로 쓴다(api/events.ts와 동일한 원칙).
import type { IncomingMessage, ServerResponse } from 'http';
import { createServerSupabaseClient } from '../src/server/supabase';
import { handleStudentFeedbackRequest } from '../src/server/student-feedback-handler';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const client = createServerSupabaseClient();
    const { httpStatus, body } = await handleStudentFeedbackRequest(req.method, req.headers.cookie, client);

    res.statusCode = httpStatus;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  } catch {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'internal error' }));
  }
}
