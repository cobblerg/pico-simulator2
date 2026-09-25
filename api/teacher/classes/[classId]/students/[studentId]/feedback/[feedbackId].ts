// Vercel Node.js Serverless Function:
// PATCH /api/teacher/classes/:classId/students/:studentId/feedback/:feedbackId
// (Stage 0-D10-E)
//
// 얇은 HTTP 어댑터일 뿐이다 — 실제 요청 처리 로직(메서드/Authorization
// 헤더/토큰 검증/teacher 조회/학급 소유권 확인/학생 소속 확인/자신이 쓴
// feedback인지 확인/수정/public response 매핑)은 Vercel 전용 타입에
// 의존하지 않는 순수 함수
// src/server/teacher-feedback-update-handler.ts의
// handleTeacherFeedbackUpdateRequest()에 있다. 이 파일은 그 함수를 부르고
// HTTP status/JSON body를 써주기만 한다.
import type { IncomingMessage, ServerResponse } from 'http';
import { createServerSupabaseClient } from '../../../../../../../src/server/supabase';
import { handleTeacherFeedbackUpdateRequest } from '../../../../../../../src/server/teacher-feedback-update-handler';

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
    const feedbackId = req.query?.feedbackId;
    const rawBody = extractRawBody(req);

    const { httpStatus, body } = await handleTeacherFeedbackUpdateRequest(
      req.method,
      req.headers.authorization,
      classId,
      studentId,
      feedbackId,
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
