// D11-C2 — Class Creation Server Boundary: POST /api/teacher/classes
//
// handleTeacherClassesRequest()는 SupabaseClient를 직접 받는 순수 함수다.
// resolveTeacherFromAccessToken()이 필요로 하는 auth.getUser()/teacher 테이블
// 조회까지 포함한 fake SupabaseClient를 구성한다 — 이 프로젝트에 이미
// 존재하는 ad-hoc fake-client 스타일(ai-learning-analysis.test.ts 등)을
// 그대로 따른다. 기존 GET 회귀(0-D10-B)는 이 파일에서 다시 다루지 않는다 —
// 이번 단계는 새로 추가된 POST 경계만 보호한다.
import { describe, test, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { handleTeacherClassesRequest } from '../../src/server/teacher-classes-handler';

type SchoolClassRow = { class_id: string; school_year: string; grade: number; class_number: number; class_code: string };
type InsertOutcome = { kind: 'ok'; row: SchoolClassRow } | { kind: 'collision' } | { kind: 'error'; error: unknown };

const VALID_TOKEN = 'valid-access-token';
const AUTH_USER_ID = 'auth-user-1';
const TEACHER_ROW = { teacher_id: 'teacher-1', display_name: '김선생' };

function makeFakeClient(config: {
  approved: boolean;
  insertOutcomes?: InsertOutcome[];
  linkOutcome?: { kind: 'ok' } | { kind: 'error'; error: unknown };
}) {
  const insertCalls: Record<string, unknown>[] = [];
  const linkCalls: Record<string, unknown>[] = [];
  let insertIndex = 0;

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
                return {
                  limit: async () => ({ data: config.approved ? [TEACHER_ROW] : [], error: null }),
                };
              },
            };
          },
        };
      }
      if (table === 'school_class') {
        return {
          insert(row: Record<string, unknown>) {
            insertCalls.push(row);
            const outcome = (config.insertOutcomes ?? [])[insertIndex++];
            return {
              select() {
                return {
                  async single() {
                    if (!outcome) throw new Error('test setup error: not enough insertOutcomes');
                    if (outcome.kind === 'ok') return { data: outcome.row, error: null };
                    if (outcome.kind === 'collision') return { data: null, error: { code: '23505', message: 'duplicate key' } };
                    return { data: null, error: outcome.error };
                  },
                };
              },
            };
          },
          delete() {
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      if (table === 'teacher_class') {
        return {
          async insert(row: Record<string, unknown>) {
            linkCalls.push(row);
            const outcome = config.linkOutcome ?? { kind: 'ok' as const };
            if (outcome.kind === 'ok') return { error: null };
            return { error: outcome.error };
          },
        };
      }
      throw new Error(`unexpected table in fake client: ${table}`);
    },
  } as unknown as SupabaseClient;

  return { client, insertCalls, linkCalls };
}

function body(fields: Record<string, unknown>): string {
  return JSON.stringify(fields);
}

const VALID_BODY = { schoolYear: '2026', grade: 1, classNumber: 3 };

describe('POST /api/teacher/classes — Case A (successful creation, handler wiring)', () => {
  test('approved teacher + valid body -> 200, ok schoolClass with generated classCode, DB writes happened in order', async () => {
    const { client, insertCalls, linkCalls } = makeFakeClient({
      approved: true,
      insertOutcomes: [{ kind: 'ok', row: { class_id: 'class-new', school_year: '2026', grade: 1, class_number: 3, class_code: 'ABCDEF' } }],
    });

    const res = await handleTeacherClassesRequest('POST', `Bearer ${VALID_TOKEN}`, body(VALID_BODY), client);

    expect(res.httpStatus).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      schoolClass: { classId: 'class-new', schoolYear: '2026', grade: 1, classNumber: 3, classCode: 'ABCDEF' },
    });
    expect(insertCalls).toHaveLength(1);
    // classCode는 요청 body에서 온 것이 아니라 서버가 생성한 값이어야 한다.
    expect(insertCalls[0].class_code).not.toBe(VALID_BODY);
    expect(linkCalls).toEqual([{ teacher_id: 'teacher-1', class_id: 'class-new' }]);
  });
});

describe('POST /api/teacher/classes — Case B (missing/invalid name-equivalent fields)', () => {
  test.each([
    ['missing schoolYear', { grade: 1, classNumber: 3 }],
    ['empty schoolYear after trim', { schoolYear: '   ', grade: 1, classNumber: 3 }],
    ['non-string schoolYear', { schoolYear: 2026, grade: 1, classNumber: 3 }],
    ['non-integer grade', { schoolYear: '2026', grade: 1.5, classNumber: 3 }],
    ['non-number classNumber', { schoolYear: '2026', grade: 1, classNumber: '3' }],
  ])('%s -> 400, no DB write attempted', async (_label, fields) => {
    const { client, insertCalls, linkCalls } = makeFakeClient({ approved: true });

    const res = await handleTeacherClassesRequest('POST', `Bearer ${VALID_TOKEN}`, body(fields), client);

    expect(res.httpStatus).toBe(400);
    expect(res.body).toEqual({ error: 'invalid request' });
    expect(insertCalls).toHaveLength(0);
    expect(linkCalls).toHaveLength(0);
  });

  test('classCode supplied by the client in the body is ignored, not trusted', async () => {
    const { client, insertCalls } = makeFakeClient({
      approved: true,
      insertOutcomes: [{ kind: 'ok', row: { class_id: 'class-new', school_year: '2026', grade: 1, class_number: 3, class_code: 'SERVERGEN' } }],
    });

    const res = await handleTeacherClassesRequest(
      'POST',
      `Bearer ${VALID_TOKEN}`,
      body({ ...VALID_BODY, classCode: 'CLIENT-SUPPLIED' }),
      client
    );

    expect(res.httpStatus).toBe(200);
    expect(insertCalls[0].class_code).not.toBe('CLIENT-SUPPLIED');
  });
});

describe('POST /api/teacher/classes — Case C (missing/invalid token)', () => {
  test('missing Authorization header -> 401, no DB write attempted', async () => {
    const { client, insertCalls } = makeFakeClient({ approved: true });

    const res = await handleTeacherClassesRequest('POST', undefined, body(VALID_BODY), client);

    expect(res.httpStatus).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
    expect(insertCalls).toHaveLength(0);
  });

  test('invalid/expired token -> 401, no DB write attempted', async () => {
    const { client, insertCalls } = makeFakeClient({ approved: true });

    const res = await handleTeacherClassesRequest('POST', 'Bearer not-a-real-token', body(VALID_BODY), client);

    expect(res.httpStatus).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
    expect(insertCalls).toHaveLength(0);
  });
});

describe('POST /api/teacher/classes — Case D (not-approved teacher)', () => {
  test('valid token but no approved teacher row -> 200 not_approved, no DB write attempted', async () => {
    const { client, insertCalls } = makeFakeClient({ approved: false });

    const res = await handleTeacherClassesRequest('POST', `Bearer ${VALID_TOKEN}`, body(VALID_BODY), client);

    expect(res.httpStatus).toBe(200);
    expect(res.body).toEqual({ status: 'not_approved' });
    expect(insertCalls).toHaveLength(0);
  });
});
