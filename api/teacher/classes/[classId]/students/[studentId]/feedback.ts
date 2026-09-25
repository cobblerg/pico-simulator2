// Vercel Node.js Serverless Function:
// GET/POST /api/teacher/classes/:classId/students/:studentId/feedback
// (Stage 0-D10-E)
//
// 얇은 HTTP 어댑터일 뿐이다 — 실제 요청 처리 로직(메서드/Authorization
// 헤더/토큰 검증/teacher 조회/학급 소유권 확인/학생 소속 확인/조회 또는
// 작성/public response 매핑)은 Vercel 전용 타입에 의존하지 않는 순수 함수
// src/server/teacher-feedback-handler.ts의
// handleTeacherFeedbackRequest()에 있다. 이 파일은 그 함수를 부르고 HTTP
// status/JSON body를 써주기만 한다.
//
// api/events.ts와 동일한 패턴으로 req.body(이미 파싱된 객체일 수 있음)를
// 순수 문자열로 되돌린다 — handler는 항상 순수 문자열을 받는 계약을
// 유지한다.
import type { IncomingMessage, ServerResponse } from 'http';
import { createServerSupabaseClient } from '../../../../../../src/server/supabase';
import { handleTeacherFeedbackRequest } from '../../../../../../src/server/teacher-feedback-handler';

function extractRawBody(req: IncomingMessage & { body?: unknown }): string {
  const b = req.body;
  if (typeof b === 'string') return b;
  if (b !== undefined && b !== null) return JSON.stringify(b);
  return '';
}

export default async function handler(
  req: IncomingMessage & { body?: unknown; query?: Record<string, string | string[]> },
  res: ServerResponse
): Promise<void> {
  try {
    const client = createServerSupabaseClient();
    const classId = req.query?.classId;
    const studentId = req.query?.studentId;
    const rawBody = extractRawBody(req);

    const { httpStatus, body } = await handleTeacherFeedbackRequest(
      req.method,
      req.headers.authorization,
      classId,
      studentId,
      rawBody,
      client
    );

    res.statusCode = httpStatus;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  } catch {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'internal error' }));
  }
}
