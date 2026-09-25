// Vercel Node.js Serverless Function: POST /api/student-entry (Stage 0-D7-B)
//
// 얇은 HTTP 어댑터일 뿐이다 — 실제 요청 처리 로직(메서드/JSON 검증,
// enterStudent 호출, public response 매핑)은 Vercel 전용 타입에 의존하지
// 않는 순수 함수 src/server/student-entry-handler.ts의
// handleStudentEntryRequest()에 있다. 이 파일은 그 함수를 부르고 HTTP
// status/JSON body를 써주기만 한다.
//
// Vercel의 Node.js Function은 Content-Type: application/json 요청 body를
// req.body로 자동 파싱해 준다(문서화된 동작). req.body가 이미 파싱된
// 객체면 다시 JSON 문자열로 되돌리고, 문자열로 온 경우는 그대로 쓴다 —
// 어느 쪽이든 handleStudentEntryRequest()는 항상 순수 문자열을 받는 계약을
// 유지하므로 이 파일에 파싱 분기 로직을 추가하지 않아도 된다.
//
// SUPABASE_URL/SUPABASE_SECRET_KEY는 createServerSupabaseClient()(서버 전용
// 모듈)가 process.env에서만 읽는다 — 이 파일도, 그 어떤 값도 여기 직접
// 작성하지 않는다.
import type { IncomingMessage, ServerResponse } from 'http';
import { createServerSupabaseClient } from '../src/server/supabase';
import { createSupabaseStudentDataSource } from '../src/server/supabase-student-data';
import { handleStudentEntryRequest } from '../src/server/student-entry-handler';

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
    const dataSource = createSupabaseStudentDataSource(client);

    const { httpStatus, body } = await handleStudentEntryRequest(req.method, rawBody, dataSource);

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
