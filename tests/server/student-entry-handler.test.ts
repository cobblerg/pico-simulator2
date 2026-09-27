// D11-C1 Identity Regression Baseline — public handler boundary
// (handleStudentEntryRequest)
//
// This is the enumeration-oracle defense described in
// src/server/student-entry-handler.ts's own header comment: every non-
// accepted domain status (name-mismatch/enrollment-not-found/class-not-found/
// data-integrity-error) must fold into the exact same public
// { status: 'rejected' } shape, with no Set-Cookie header. This file locks
// that folding at the HTTP boundary, reusing createInMemoryStudentDataSource
// (already the project's fake StudentDataSource) — no new fake/mock style
// introduced.
import { describe, test, expect, beforeAll } from 'vitest';
import { handleStudentEntryRequest } from '../../src/server/student-entry-handler';
import { createInMemoryStudentDataSource, type InMemoryStudentFixtures, type StudentDataSource } from '../../src/ui/student-data';

beforeAll(() => {
  // accepted 분기에서 createStudentSession()이 필요로 하는 값 — 실제 production
  // secret과 무관한 테스트 전용 값이다(기존 feedback-retry.test.ts/
  // student-feedback.test.ts와 동일한 패턴).
  process.env.STUDENT_SESSION_SECRET = 'test-secret-do-not-use-in-prod';
});

const CLASS_A = { classId: 'class-A', schoolYear: '2026', grade: 1, classNumber: 1, classCode: 'CODE-A' };
const STUDENT_1 = { studentId: 'stu-1', name: '김민준' };
const ENROLL_A1 = { enrollmentId: 'enroll-A1', studentId: STUDENT_1.studentId, classId: CLASS_A.classId, studentNo: '1', enrolledAt: '2026-01-01T00:00:00Z' };

// data-integrity-error를 공개 경계에서도 재현하기 위한 고의로 모순된 fixture:
// enrollment가 가리키는 studentId가 students 배열에 없다(findStudent가
// undefined를 반환하는 경로) — D11-C0 §C에서 확인한 5번째 내부 상태다.
const CLASS_C = { classId: 'class-C', schoolYear: '2026', grade: 1, classNumber: 3, classCode: 'CODE-C' };
const ENROLL_C1 = { enrollmentId: 'enroll-C1', studentId: 'stu-missing', classId: CLASS_C.classId, studentNo: '9', enrolledAt: '2026-01-01T00:00:00Z' };

function makeDataSource(): StudentDataSource {
  const fixtures: InMemoryStudentFixtures = {
    classes: [CLASS_A, CLASS_C],
    enrollments: [ENROLL_A1, ENROLL_C1],
    students: [STUDENT_1], // stu-missing은 의도적으로 여기 없다
  };
  return createInMemoryStudentDataSource(fixtures);
}

function postBody(fields: Record<string, unknown>): string {
  return JSON.stringify(fields);
}

describe('handleStudentEntryRequest — Case 1 (accepted)', () => {
  test('valid classCode+studentNo+name -> 200, public body exposes only accepted ids, Set-Cookie issued', async () => {
    const res = await handleStudentEntryRequest(
      'POST',
      postBody({ classCode: CLASS_A.classCode, studentNo: ENROLL_A1.studentNo, name: STUDENT_1.name }),
      makeDataSource()
    );

    expect(res.httpStatus).toBe(200);
    expect(res.body).toEqual({
      status: 'accepted',
      studentId: STUDENT_1.studentId,
      enrollmentId: ENROLL_A1.enrollmentId,
      classId: CLASS_A.classId,
    });
    expect(res.headers?.['Set-Cookie']).toContain('student_session=');
  });
});

describe('handleStudentEntryRequest — Case 7 (enumeration resistance)', () => {
  const scenarios: Array<[string, Record<string, unknown>]> = [
    ['Case 2: name-mismatch', { classCode: CLASS_A.classCode, studentNo: ENROLL_A1.studentNo, name: '다른이름' }],
    ['Case 3: unknown student number', { classCode: CLASS_A.classCode, studentNo: 'no-such-no', name: '아무개' }],
    ['Case 4: unknown class code', { classCode: 'NO-SUCH-CODE', studentNo: '1', name: '아무개' }],
    ['data-integrity-error (enrollment refers to a missing student)', { classCode: CLASS_C.classCode, studentNo: ENROLL_C1.studentNo, name: '아무개' }],
  ];

  test.each(scenarios)('%s -> identical { status: "rejected" } body, no Set-Cookie, 200', async (_label, fields) => {
    const res = await handleStudentEntryRequest('POST', postBody(fields), makeDataSource());

    expect(res.httpStatus).toBe(200);
    expect(res.body).toEqual({ status: 'rejected' });
    expect(res.headers?.['Set-Cookie']).toBeUndefined();
  });

  test('all four internal failure reasons produce byte-identical JSON bodies (no differentiating field leaks through)', async () => {
    const bodies = await Promise.all(
      scenarios.map(async ([, fields]) => {
        const res = await handleStudentEntryRequest('POST', postBody(fields), makeDataSource());
        return JSON.stringify(res.body);
      })
    );

    const distinct = new Set(bodies);
    expect(distinct.size).toBe(1);
    expect(distinct.has(JSON.stringify({ status: 'rejected' }))).toBe(true);
  });
});

describe('handleStudentEntryRequest — Case 8 (malformed request)', () => {
  test('missing name field -> 400', async () => {
    const res = await handleStudentEntryRequest('POST', postBody({ classCode: 'CODE-A', studentNo: '1' }), makeDataSource());

    expect(res.httpStatus).toBe(400);
    expect(res.body).toEqual({ error: 'classCode/studentNo/name must be strings' });
  });

  test('non-string studentNo (number instead of string) -> 400', async () => {
    const res = await handleStudentEntryRequest(
      'POST',
      postBody({ classCode: 'CODE-A', studentNo: 1, name: '아무개' }),
      makeDataSource()
    );

    expect(res.httpStatus).toBe(400);
    expect(res.body).toEqual({ error: 'classCode/studentNo/name must be strings' });
  });

  test('empty request body -> 400 (parses to undefined, fails the object check)', async () => {
    const res = await handleStudentEntryRequest('POST', '', makeDataSource());

    expect(res.httpStatus).toBe(400);
    expect(res.body).toEqual({ error: 'classCode/studentNo/name must be strings' });
  });

  test('malformed JSON -> 400', async () => {
    const res = await handleStudentEntryRequest('POST', '{not valid json', makeDataSource());

    expect(res.httpStatus).toBe(400);
    expect(res.body).toEqual({ error: 'invalid json' });
  });
});
