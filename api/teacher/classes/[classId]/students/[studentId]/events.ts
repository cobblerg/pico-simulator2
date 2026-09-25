// Vercel Node.js Serverless Function:
// GET /api/teacher/classes/:classId/students/:studentId/events (Stage 0-D10-D)
//
// 얇은 HTTP 어댑터일 뿐이다 — 실제 요청 처리 로직(메서드/Authorization
// 헤더/토큰 검증/teacher 조회/학급 소유권 확인/학생 소속 확인/Timeline
// 조회/public response 매핑)은 Vercel 전용 타입에 의존하지 않는 순수 함수
// src/server/teacher-timeline-handler.ts의 handleTeacherTimelineRequest()에
// 있다. 이 파일은 그 함수를 부르고 HTTP status/JSON body를 써주기만 한다.
//
// Vercel은 파일 경로의 [classId]/[studentId] 동적 세그먼트를 각각
// req.query.classId/req.query.studentId로 채워준다(api/teacher/classes/
// [classId]/students.ts와 동일한 종류의 프레임워크 지원). 이 값들은
// "브라우저가 조회하고 싶다고 요청한 대상"일 뿐 권한의 근거가 아니다 —
// 실제 권한은 handleTeacherTimelineRequest() 안에서
// resolveTeacherFromAccessToken()으로 확보한 teacherId와
// assertTeacherOwnsClass()/assertStudentEnrolledInClass()로만 결정된다.
import type { IncomingMessage, ServerResponse } from 'http';
import { createServerSupabaseClient } from '../../../../../../src/server/supabase';
import { handleTeacherTimelineRequest } from '../../../../../../src/server/teacher-timeline-handler';

export default async function handler(
  req: IncomingMessage & { query?: Record<string, string | string[]> },
  res: ServerResponse
): Promise<void> {
  try {
    const client = createServerSupabaseClient();
    const classId = req.query?.classId;
    const studentId = req.query?.studentId;

    const { httpStatus, body } = await handleTeacherTimelineRequest(
      req.method,
      req.headers.authorization,
      classId,
      studentId,
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
