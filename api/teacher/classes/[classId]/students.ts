// Vercel Node.js Serverless Function: GET /api/teacher/classes/:classId/students
// (Stage 0-D10-C)
//
// 얇은 HTTP 어댑터일 뿐이다 — 실제 요청 처리 로직(메서드/Authorization
// 헤더/토큰 검증/teacher 조회/학급 소유권 확인/학생 목록 조회/public
// response 매핑)은 Vercel 전용 타입에 의존하지 않는 순수 함수
// src/server/teacher-students-handler.ts의 handleTeacherStudentsRequest()에
// 있다. 이 파일은 그 함수를 부르고 HTTP status/JSON body를 써주기만 한다.
//
// Vercel은 파일 경로의 [classId] 동적 세그먼트를 req.query.classId로
// 채워준다(Node.js Function 문서화된 동작, api/student-entry.ts가
// req.body를 자동 파싱받는 것과 동일한 종류의 프레임워크 지원). 이 값은
// "브라우저가 조회하고 싶다고 요청한 classId"일 뿐 권한의 근거가 아니다 —
// 실제 권한은 handleTeacherStudentsRequest() 안에서
// resolveTeacherFromAccessToken()으로 확보한 teacherId와
// assertTeacherOwnsClass()로만 결정된다.
import type { IncomingMessage, ServerResponse } from 'http';
import { createServerSupabaseClient } from '../../../../src/server/supabase';
import { handleTeacherStudentsRequest } from '../../../../src/server/teacher-students-handler';

export default async function handler(
  req: IncomingMessage & { query?: Record<string, string | string[]> },
  res: ServerResponse
): Promise<void> {
  try {
    const client = createServerSupabaseClient();
    const classId = req.query?.classId;

    const { httpStatus, body } = await handleTeacherStudentsRequest(req.method, req.headers.authorization, classId, client);

    res.statusCode = httpStatus;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  } catch {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'internal error' }));
  }
}
