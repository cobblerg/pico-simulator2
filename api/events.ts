// Vercel Node.js Serverless Function: POST /api/events (Stage 0-D9-B)
//
// 얇은 HTTP 어댑터일 뿐이다 — 실제 요청 처리 로직(메서드/JSON/쿠키/세션/
// Enrollment 재확인/eventType·payload 검증)은 Vercel 전용 타입에 의존하지
// 않는 순수 함수 src/server/learning-event-handler.ts의
// handleLearningEventRequest()에 있다. 이 파일은 그 함수를 부르고 HTTP
// status/JSON body를 써주기만 한다.
//
// studentId/enrollmentId/classId를 이 파일이나 handler가 request body에서
// 읽어 신뢰하는 일은 없다 — 오직 req.headers.cookie의 student_session
// (0-D9-A1에서 만든 HttpOnly 쿠키)만 identity 근거로 쓴다.
//
// SUPABASE_URL/SUPABASE_SECRET_KEY/STUDENT_SESSION_SECRET는 각각의 서버
// 전용 모듈이 process.env에서만 읽는다 — 이 파일에는 어떤 secret도
// 직접 작성하지 않는다.
import type { IncomingMessage, ServerResponse } from 'http';
import { createServerSupabaseClient } from '../src/server/supabase';
import { createSupabaseLearningEventDataSource } from '../src/server/learning-event-data';
import { handleLearningEventRequest } from '../src/server/learning-event-handler';

function extractRawBody(req: IncomingMessage & { body?: unknown }): string {
  const b = req.body;
  if (typeof b === 'string') return b;
  if (b !== undefined && b !== null) return JSON.stringify(b);
  return '';
}

export default async function handler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse
): Promise<void> {
  try {
    const rawBody = extractRawBody(req);
    const client = createServerSupabaseClient();
    const dataSource = createSupabaseLearningEventDataSource(client);

    const { httpStatus, body } = await handleLearningEventRequest(req.method, rawBody, req.headers.cookie, dataSource);

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
