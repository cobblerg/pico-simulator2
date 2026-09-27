// Vercel Node.js Serverless Function: GET/POST /api/teacher/classes
// (GET: Stage 0-D10-B, POST: D11-C2 학급 생성)
//
// 얇은 HTTP 어댑터일 뿐이다 — 실제 요청 처리 로직(메서드/Authorization
// 헤더/토큰 검증/teacher 조회/학급 목록 조회·생성/public response 매핑)은
// Vercel 전용 타입에 의존하지 않는 순수 함수
// src/server/teacher-classes-handler.ts의 handleTeacherClassesRequest()에
// 있다. 이 파일은 그 함수를 부르고 HTTP status/JSON body를 써주기만 한다.
//
// api/teacher/me.ts와 동일한 패턴 — SUPABASE_URL/SUPABASE_SECRET_KEY는
// createServerSupabaseClient()가 process.env에서만 읽는다. 학생
// student_session 쿠키는 이 endpoint와 전혀 무관하다.
//
// extractRawBody()는 api/student-entry.ts와 동일한 helper다 — Vercel의
// Node.js Function이 Content-Type: application/json body를 자동 파싱해
// 주므로, 이미 파싱된 객체면 다시 문자열로 되돌려 handleTeacherClassesRequest가
// 항상 순수 문자열을 받는 계약을 유지한다. GET 요청은 보통 body가 없으므로
// 빈 문자열이 그대로 전달된다.
import type { IncomingMessage, ServerResponse } from 'http';
import { createServerSupabaseClient } from '../../src/server/supabase';
import { handleTeacherClassesRequest } from '../../src/server/teacher-classes-handler';

function extractRawBody(req: IncomingMessage & { body?: unknown }): string {
  const b = req.body;
  if (typeof b === 'string') return b;
  if (b !== undefined && b !== null) return JSON.stringify(b);
  return '';
}

export default async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse): Promise<void> {
  try {
    const client = createServerSupabaseClient();
    const rawBody = extractRawBody(req);
    const { httpStatus, body } = await handleTeacherClassesRequest(req.method, req.headers.authorization, rawBody, client);

    res.statusCode = httpStatus;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  } catch {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'internal error' }));
  }
}
