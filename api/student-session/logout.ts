// Vercel Node.js Serverless Function: POST /api/student-session/logout
// (Stage 0-D9-A1)
//
// student_session HttpOnly 쿠키를 만료시킨다. 이 작업은 멱등이다 — 쿠키가
// 있었든 없었든, 유효했든 만료됐든 항상 같은 방식으로 "지금부터는 없다"로
// 만들고 항상 같은 성공 응답을 돌려준다. 그 쿠키가 실제로 존재했는지,
// 유효했는지 같은 정보는 응답에서 구분하지 않는다 — 노출할 이유가 없는
// 내부 상태다.
//
// STUDENT_SESSION_SECRET을 읽거나 검증할 필요가 없다 — 쿠키를 만료시키는
// 데는 서명 검증이 필요 없다(Max-Age=0으로 덮어쓰기만 하면 된다).
//
// 얇은 HTTP 어댑터일 뿐이다 — 실제 로직은 src/server/student-session.ts의
// handleStudentSessionLogout()(Vercel 타입에 의존하지 않는 순수 함수)에
// 있다.
import type { IncomingMessage, ServerResponse } from 'http';
import { handleStudentSessionLogout } from '../../src/server/student-session';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const { httpStatus, body, headers } = handleStudentSessionLogout(req.method);
    res.statusCode = httpStatus;
    res.setHeader('Content-Type', 'application/json');
    if (headers) {
      for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
    }
    res.end(JSON.stringify(body));
  } catch {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'internal error' }));
  }
}
