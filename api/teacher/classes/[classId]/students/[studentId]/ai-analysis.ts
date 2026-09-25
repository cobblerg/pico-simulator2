// Vercel Node.js Serverless Function:
// POST /api/teacher/classes/:classId/students/:studentId/ai-analysis
// (Stage 0-D11-A)
//
// 얇은 HTTP 어댑터일 뿐이다 — 실제 요청 처리 로직(메서드/Authorization
// 헤더/토큰 검증/teacher 조회/학급 소유권 확인/학생 소속 확인/이벤트
// 조회/AI 입력 구성/OpenAI 호출/public response 매핑)은 Vercel 전용
// 타입에 의존하지 않는 순수 함수
// src/server/ai-analysis-handler.ts의 handleAIAnalysisRequest()에 있다.
// 이 파일은 그 함수를 부르고 HTTP status/JSON body를 써주기만 한다.
//
// OPENAI_API_KEY는 createDefaultAIProvider()(server-only 모듈)가
// process.env에서만 읽는다 — 이 파일에는 어떤 secret도 직접 작성하지
// 않는다. 학생 student_session 쿠키는 이 endpoint와 전혀 무관하다.
import type { IncomingMessage, ServerResponse } from 'http';
import { createServerSupabaseClient } from '../../../../../../src/server/supabase';
import { createDefaultAIProvider } from '../../../../../../src/server/ai-learning-analysis';
import { handleAIAnalysisRequest } from '../../../../../../src/server/ai-analysis-handler';

export default async function handler(
  req: IncomingMessage & { query?: Record<string, string | string[]> },
  res: ServerResponse
): Promise<void> {
  try {
    const client = createServerSupabaseClient();
    const aiProvider = createDefaultAIProvider();
    const classId = req.query?.classId;
    const studentId = req.query?.studentId;

    const { httpStatus, body } = await handleAIAnalysisRequest(
      req.method,
      req.headers.authorization,
      classId,
      studentId,
      client,
      aiProvider
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
