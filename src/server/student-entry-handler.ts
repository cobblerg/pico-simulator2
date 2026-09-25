// Public /api/student-entry 요청 처리 로직 (Stage 0-D7-B)
//
// 이 파일은 순수 함수다 — Vercel/Node HTTP 타입(IncomingMessage 등)에
// 의존하지 않는다. api/student-entry.ts(얇은 HTTP 어댑터)가 이 함수를
// 감싼다. Student/Class/Enrollment 조회 로직은 여기서 다시 구현하지 않는다
// — 항상 주입받은 StudentDataSource로 enterStudent()를 그대로 호출한다.
//
// public response 설계(보안 검토 결과): 이 endpoint는 인증 없는 public
// endpoint이므로, 내부 StudentEntryResult(class-not-found/
// enrollment-not-found/name-mismatch/data-integrity-error를 구분하고 일부
// 실패 케이스에 classId/enrollmentId를 담는 discriminated union)를 그대로
// 노출하면, 어떤 실패 status가 왔는지 자체가 "이 classCode가 존재하는지",
// "이 studentNo가 그 반에 등록되어 있는지"를 외부에서 알아낼 수 있는
// enumeration oracle이 된다(0-D7 architecture review에서 이미 지적한 위험의
// 구체적 사례). 따라서 이 API 경계에서만 accepted가 아닌 모든 실패 status를
// 구분 없는 단일 'rejected'로 접고, classId/enrollmentId도 응답에서 완전히
// 제거한다. student-domain.ts의 StudentEntryResult 타입과 validateStudentEntry
// 판정 로직 자체는 전혀 바꾸지 않는다 — 매핑은 이 파일에서만 일어난다.
import { StudentEntryInput, StudentEntryResult } from '../ui/student-domain';
import { StudentDataSource } from '../ui/student-data';
import { enterStudent } from '../ui/student-entry';
import { createStudentSession, serializeStudentSessionCookie } from './student-session';

export type PublicStudentEntryResponse =
  | { status: 'accepted'; studentId: string; enrollmentId: string; classId: string }
  | { status: 'rejected' };

function toPublicResponse(result: StudentEntryResult): PublicStudentEntryResponse {
  if (result.status === 'accepted') {
    return {
      status: 'accepted',
      studentId: result.studentId,
      enrollmentId: result.enrollmentId,
      classId: result.classId,
    };
  }
  return { status: 'rejected' };
}

export type HandlerResult = { httpStatus: number; body: unknown; headers?: Record<string, string> };

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

// method가 undefined일 수 있는 것은 Node http.IncomingMessage.method 자체가
// (문서상) string | undefined이기 때문 — 어댑터 쪽 타입을 그대로 반영한다.
export async function handleStudentEntryRequest(
  method: string | undefined,
  rawBody: string,
  dataSource: StudentDataSource
): Promise<HandlerResult> {
  if (method !== 'POST') {
    return { httpStatus: 405, body: { error: 'method not allowed' } };
  }

  let parsed: unknown;
  try {
    parsed = rawBody.length > 0 ? JSON.parse(rawBody) : undefined;
  } catch {
    return { httpStatus: 400, body: { error: 'invalid json' } };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { httpStatus: 400, body: { error: 'classCode/studentNo/name must be strings' } };
  }
  const candidate = parsed as { classCode?: unknown; studentNo?: unknown; name?: unknown };
  if (!isString(candidate.classCode) || !isString(candidate.studentNo) || !isString(candidate.name)) {
    return { httpStatus: 400, body: { error: 'classCode/studentNo/name must be strings' } };
  }

  const input: StudentEntryInput = {
    classCode: candidate.classCode,
    studentNo: candidate.studentNo,
    name: candidate.name,
  };

  try {
    // trim/NFC 정규화는 enterStudent() 내부(normalizeStudentEntryInput)가
    // 그대로 수행한다 — 여기서 다시 하지 않는다.
    const result = await enterStudent(input, dataSource);

    if (result.status === 'accepted') {
      // 서버 authorization 근거인 student_session은 오직 이 accepted
      // 분기에서만 발급한다. createStudentSession()이 던지는 예외(예:
      // STUDENT_SESSION_SECRET 미설정)는 아래 catch로 흘러가 500이 되며,
      // 이 경우 "accepted인데 쿠키가 없는" 상태로 응답하지 않는다 — 즉
      // 설정 오류는 절대 조용히 생략되지 않는다.
      const cookie = serializeStudentSessionCookie(
        createStudentSession({
          studentId: result.studentId,
          enrollmentId: result.enrollmentId,
          classId: result.classId,
        })
      );
      return { httpStatus: 200, body: toPublicResponse(result), headers: { 'Set-Cookie': cookie } };
    }

    return { httpStatus: 200, body: toPublicResponse(result) };
  } catch {
    // infrastructure failure(DB 오류/네트워크/세션 설정 오류 등) — 에러
    // 메시지, stack trace, Supabase/세션 세부정보를 클라이언트에 절대
    // 노출하지 않는다. 여기서도 console.error 등으로 로그를 남기지 않는다
    // — 일부 DB 에러 메시지에는 입력값(studentNo 등)이 그대로 포함될 수
    // 있기 때문이다.
    return { httpStatus: 500, body: { error: 'internal error' } };
  }
}
