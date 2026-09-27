// D11-C3 — Roster Management Server Boundary: POST /api/teacher/classes/:classId/students
//
// handleTeacherStudentsRequest()는 SupabaseClient를 직접 받는 순수 함수다.
// resolveTeacherFromAccessToken()(auth.getUser + teacher 테이블)과
// assertTeacherOwnsClass()(teacher_class 테이블)까지 포함한 fake
// SupabaseClient를 구성한다 — teacher-classes-handler.test.ts(D11-C2)와
// 동일한 스타일. 기존 GET 회귀(0-D10-C)는 이 파일에서 다시 다루지 않는다 —
// 이번 단계는 새로 추가된 POST 경계만 보호한다.
import { describe, test, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { handleTeacherStudentsRequest } from '../../src/server/teacher-students-handler';

const VALID_TOKEN = 'valid-access-token';
const AUTH_USER_ID = 'auth-user-1';
const TEACHER_ROW = { teacher_id: 'teacher-1', display_name: '김선생' };
const OWNED_CLASS_ID = 'class-owned';
const OTHER_CLASS_ID = 'class-not-owned';

function makeFakeClient(config: {
  approved: boolean;
  ownsClass: boolean;
  studentInsertRows?: { student_id: string; name: string }[];
  enrollmentInsertRows?: { enrollment_id: string; student_id: string; student_no: string }[];
}) {
  const insertCalls = { student: 0, enrollment: 0 };

  const client = {
    auth: {
      async getUser(token: string) {
        if (token === VALID_TOKEN) return { data: { user: { id: AUTH_USER_ID } }, error: null };
        return { data: { user: null }, error: { message: 'invalid token' } };
      },
    },
    from(table: string) {
      if (table === 'teacher') {
        return {
          select() {
            return {
              eq() {
                return { limit: async () => ({ data: config.approved ? [TEACHER_ROW] : [], error: null }) };
              },
            };
          },
        };
      }
      if (table === 'teacher_class') {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return { limit: async () => ({ data: config.ownsClass ? [{ teacher_id: 'teacher-1', class_id: OWNED_CLASS_ID }] : [], error: null }) };
                  },
                };
              },
            };
          },
        };
      }
      if (table === 'enrollment') {
        return {
          select() {
            return {
              eq() {
                return { in: async () => ({ data: [], error: null }) }; // 이 학급엔 기존 등록 학생 없음
              },
            };
          },
          insert(rows: Record<string, unknown>[]) {
            insertCalls.enrollment++;
            return {
              select: () => Promise.resolve({ data: config.enrollmentInsertRows ?? rows.map((_r, i) => ({ enrollment_id: `enroll-${i}`, student_id: `stu-${i}`, student_no: rows[i].student_no })), error: null }),
            };
          },
        };
      }
      if (table === 'student') {
        return {
          insert(rows: Record<string, unknown>[]) {
            insertCalls.student++;
            return {
              select: () => Promise.resolve({ data: config.studentInsertRows ?? rows.map((r, i) => ({ student_id: `stu-${i}`, name: r.name })), error: null }),
            };
          },
          delete() {
            return { in: async () => ({ error: null }) };
          },
        };
      }
      throw new Error(`unexpected table in fake client: ${table}`);
    },
  } as unknown as SupabaseClient;

  return { client, insertCalls };
}

function body(fields: Record<string, unknown>): string {
  return JSON.stringify(fields);
}

const VALID_ENTRIES_BODY = { entries: [{ studentNo: '1', name: '김민준' }] };

describe('POST /api/teacher/classes/:classId/students — successful wiring', () => {
  test('approved teacher owning the class + valid entries -> 200 ok, student/enrollment written', async () => {
    const { client, insertCalls } = makeFakeClient({ approved: true, ownsClass: true });

    const res = await handleTeacherStudentsRequest('POST', `Bearer ${VALID_TOKEN}`, OWNED_CLASS_ID, body(VALID_ENTRIES_BODY), client);

    expect(res.httpStatus).toBe(200);
    expect(res.body).toEqual({ status: 'ok', students: [{ studentId: 'stu-0', enrollmentId: 'enroll-0', studentNo: '1', name: '김민준' }] });
    expect(insertCalls.student).toBe(1);
    expect(insertCalls.enrollment).toBe(1);
  });
});

describe('POST /api/teacher/classes/:classId/students — Case H (unauthorized class)', () => {
  test('class not owned by this teacher -> 403 forbidden, zero DB writes', async () => {
    const { client, insertCalls } = makeFakeClient({ approved: true, ownsClass: false });

    const res = await handleTeacherStudentsRequest('POST', `Bearer ${VALID_TOKEN}`, OTHER_CLASS_ID, body(VALID_ENTRIES_BODY), client);

    expect(res.httpStatus).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
    expect(insertCalls.student).toBe(0);
    expect(insertCalls.enrollment).toBe(0);
  });
});

describe('POST /api/teacher/classes/:classId/students — Case I (missing/invalid token)', () => {
  test('missing Authorization header -> 401, zero DB writes', async () => {
    const { client, insertCalls } = makeFakeClient({ approved: true, ownsClass: true });

    const res = await handleTeacherStudentsRequest('POST', undefined, OWNED_CLASS_ID, body(VALID_ENTRIES_BODY), client);

    expect(res.httpStatus).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
    expect(insertCalls.student).toBe(0);
  });

  test('invalid token -> 401, zero DB writes', async () => {
    const { client, insertCalls } = makeFakeClient({ approved: true, ownsClass: true });

    const res = await handleTeacherStudentsRequest('POST', 'Bearer not-a-real-token', OWNED_CLASS_ID, body(VALID_ENTRIES_BODY), client);

    expect(res.httpStatus).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
    expect(insertCalls.student).toBe(0);
  });
});

describe('POST /api/teacher/classes/:classId/students — Case J (not-approved teacher)', () => {
  test('valid token but teacher not approved -> 200 not_approved, zero DB writes', async () => {
    const { client, insertCalls } = makeFakeClient({ approved: false, ownsClass: true });

    const res = await handleTeacherStudentsRequest('POST', `Bearer ${VALID_TOKEN}`, OWNED_CLASS_ID, body(VALID_ENTRIES_BODY), client);

    expect(res.httpStatus).toBe(200);
    expect(res.body).toEqual({ status: 'not_approved' });
    expect(insertCalls.student).toBe(0);
  });
});

describe('POST /api/teacher/classes/:classId/students — Case O (malformed request)', () => {
  test.each([
    ['missing entries field', {}],
    ['entries not an array', { entries: 'not-an-array' }],
    ['entry missing studentNo', { entries: [{ name: '김민준' }] }],
    ['entry missing name', { entries: [{ studentNo: '1' }] }],
    ['entry with non-string studentNo', { entries: [{ studentNo: 1, name: '김민준' }] }],
  ])('%s -> 400 invalid request, zero DB writes', async (_label, fields) => {
    const { client, insertCalls } = makeFakeClient({ approved: true, ownsClass: true });

    const res = await handleTeacherStudentsRequest('POST', `Bearer ${VALID_TOKEN}`, OWNED_CLASS_ID, body(fields), client);

    expect(res.httpStatus).toBe(400);
    expect(res.body).toEqual({ error: 'invalid request' });
    expect(insertCalls.student).toBe(0);
  });

  test('malformed JSON -> 400 invalid json, zero DB writes', async () => {
    const { client, insertCalls } = makeFakeClient({ approved: true, ownsClass: true });

    const res = await handleTeacherStudentsRequest('POST', `Bearer ${VALID_TOKEN}`, OWNED_CLASS_ID, '{not valid json', client);

    expect(res.httpStatus).toBe(400);
    expect(res.body).toEqual({ error: 'invalid json' });
    expect(insertCalls.student).toBe(0);
  });

  test('empty entries array -> 400 invalid request (empty-entries mapped), zero DB writes', async () => {
    const { client, insertCalls } = makeFakeClient({ approved: true, ownsClass: true });

    const res = await handleTeacherStudentsRequest('POST', `Bearer ${VALID_TOKEN}`, OWNED_CLASS_ID, body({ entries: [] }), client);

    expect(res.httpStatus).toBe(400);
    expect(res.body).toEqual({ error: 'invalid request' });
    expect(insertCalls.student).toBe(0);
  });
});
