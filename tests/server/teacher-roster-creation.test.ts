// D11-C3 — Roster Management Server Boundary: registerRosterEntries()
//
// registerRosterEntries()는 SupabaseClient를 직접 받는 순수 오케스트레이션
// 함수다(teacher-class-creation.ts와 동일한 스타일). ad-hoc fake
// SupabaseClient로 student/enrollment 두 테이블의 insert/select/delete
// 체인을 구성한다(ai-learning-analysis.test.ts/teacher-class-creation.test.ts와
// 동일한 스타일 — 새 mock 아키텍처를 도입하지 않는다).
import { describe, test, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { registerRosterEntries, type RegisterRosterEntry } from '../../src/server/teacher-roster-creation';

type StudentRow = { student_id: string; name: string };
type EnrollmentRow = { enrollment_id: string; student_id: string; student_no: string };

type StudentInsertOutcome = { kind: 'ok'; rows: StudentRow[] } | { kind: 'error'; error: unknown };
type EnrollmentInsertOutcome = { kind: 'ok'; rows: EnrollmentRow[] } | { kind: 'collision' } | { kind: 'error'; error: unknown };

function makeFakeClient(config: {
  existingStudentNos?: string[];
  studentInsertOutcome?: StudentInsertOutcome;
  enrollmentInsertOutcome?: EnrollmentInsertOutcome;
  deleteOutcome?: { kind: 'ok' } | { kind: 'error'; error: unknown };
}) {
  const calls = {
    precheck: [] as { classId: string; studentNos: string[] }[],
    studentInsert: [] as Record<string, unknown>[][],
    enrollmentInsert: [] as Record<string, unknown>[][],
    studentDelete: [] as string[][],
  };

  const client = {
    from(table: string) {
      if (table === 'enrollment') {
        return {
          select() {
            return {
              eq(_col: string, classId: string) {
                return {
                  async in(_col2: string, studentNos: string[]) {
                    calls.precheck.push({ classId, studentNos });
                    const existing = config.existingStudentNos ?? [];
                    return { data: existing.filter((n) => studentNos.includes(n)).map((n) => ({ student_no: n })), error: null };
                  },
                };
              },
            };
          },
          insert(rows: Record<string, unknown>[]) {
            calls.enrollmentInsert.push(rows);
            return {
              select() {
                const outcome = config.enrollmentInsertOutcome ?? { kind: 'ok' as const, rows: [] };
                if (outcome.kind === 'ok') return Promise.resolve({ data: outcome.rows, error: null });
                if (outcome.kind === 'collision') {
                  return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "enrollment_class_id_student_no_key"' } });
                }
                return Promise.resolve({ data: null, error: outcome.error });
              },
            };
          },
        };
      }
      if (table === 'student') {
        return {
          insert(rows: Record<string, unknown>[]) {
            calls.studentInsert.push(rows);
            return {
              select() {
                const outcome =
                  config.studentInsertOutcome ??
                  ({ kind: 'ok', rows: rows.map((r, i) => ({ student_id: `gen-stu-${i}`, name: r.name as string })) } satisfies StudentInsertOutcome);
                if (outcome.kind === 'ok') return Promise.resolve({ data: outcome.rows, error: null });
                return Promise.resolve({ data: null, error: outcome.error });
              },
            };
          },
          delete() {
            return {
              async in(_col: string, studentIds: string[]) {
                calls.studentDelete.push(studentIds);
                const outcome = config.deleteOutcome ?? { kind: 'ok' as const };
                if (outcome.kind === 'ok') return { error: null };
                return { error: outcome.error };
              },
            };
          },
        };
      }
      throw new Error(`unexpected table in fake client: ${table}`);
    },
  } as unknown as SupabaseClient;

  return { client, calls };
}

const CLASS_ID = 'class-1';

describe('registerRosterEntries — Case A/B (successful registration)', () => {
  test('A: single valid entry -> student + enrollment created, identity returned', async () => {
    const { client, calls } = makeFakeClient({
      studentInsertOutcome: { kind: 'ok', rows: [{ student_id: 'stu-1', name: '김민준' }] },
      enrollmentInsertOutcome: { kind: 'ok', rows: [{ enrollment_id: 'enroll-1', student_id: 'stu-1', student_no: '1' }] },
    });

    const result = await registerRosterEntries(client, CLASS_ID, [{ studentNo: '1', name: '김민준' }]);

    expect(result).toEqual({
      status: 'ok',
      entries: [{ studentId: 'stu-1', enrollmentId: 'enroll-1', studentNo: '1', name: '김민준' }],
    });
    expect(calls.studentInsert).toHaveLength(1);
    expect(calls.enrollmentInsert).toHaveLength(1);
  });

  test('B: bulk valid entries -> all created in one batch each', async () => {
    const studentRows: StudentRow[] = [
      { student_id: 'stu-1', name: '김민준' },
      { student_id: 'stu-2', name: '이서연' },
      { student_id: 'stu-3', name: '박지호' },
    ];
    const enrollmentRows: EnrollmentRow[] = [
      { enrollment_id: 'enroll-1', student_id: 'stu-1', student_no: '1' },
      { enrollment_id: 'enroll-2', student_id: 'stu-2', student_no: '2' },
      { enrollment_id: 'enroll-3', student_id: 'stu-3', student_no: '3' },
    ];
    const { client, calls } = makeFakeClient({
      studentInsertOutcome: { kind: 'ok', rows: studentRows },
      enrollmentInsertOutcome: { kind: 'ok', rows: enrollmentRows },
    });
    const entries: RegisterRosterEntry[] = [
      { studentNo: '1', name: '김민준' },
      { studentNo: '2', name: '이서연' },
      { studentNo: '3', name: '박지호' },
    ];

    const result = await registerRosterEntries(client, CLASS_ID, entries);

    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.entries).toHaveLength(3);
    expect(calls.studentInsert[0]).toHaveLength(3); // 하나의 multi-row insert
    expect(calls.enrollmentInsert[0]).toHaveLength(3);
  });
});

describe('registerRosterEntries — Case C/D/E (all-or-nothing validation)', () => {
  test('C: one entry missing name -> validation-failed, zero DB writes', async () => {
    const { client, calls } = makeFakeClient({});
    const entries: RegisterRosterEntry[] = [
      { studentNo: '1', name: '김민준' },
      { studentNo: '2', name: '' },
    ];

    const result = await registerRosterEntries(client, CLASS_ID, entries);

    expect(result.status).toBe('validation-failed');
    if (result.status === 'validation-failed') {
      expect(result.errors).toEqual([{ index: 1, studentNo: '2', reason: 'missing-name' }]);
    }
    expect(calls.studentInsert).toHaveLength(0);
    expect(calls.enrollmentInsert).toHaveLength(0);
  });

  test('D: duplicate studentNo within the same batch -> validation-failed on the second occurrence, zero DB writes', async () => {
    const { client, calls } = makeFakeClient({});
    const entries: RegisterRosterEntry[] = [
      { studentNo: '5', name: '김민준' },
      { studentNo: '5', name: '이서연' },
    ];

    const result = await registerRosterEntries(client, CLASS_ID, entries);

    expect(result.status).toBe('validation-failed');
    if (result.status === 'validation-failed') {
      expect(result.errors).toEqual([{ index: 1, studentNo: '5', reason: 'duplicate-student-no' }]);
    }
    expect(calls.studentInsert).toHaveLength(0);
  });

  test('E: studentNo already registered in this class (DB pre-check) -> validation-failed, zero DB writes', async () => {
    const { client, calls } = makeFakeClient({ existingStudentNos: ['7'] });

    const result = await registerRosterEntries(client, CLASS_ID, [{ studentNo: '7', name: '최유진' }]);

    expect(result.status).toBe('validation-failed');
    if (result.status === 'validation-failed') {
      expect(result.errors).toEqual([{ index: 0, studentNo: '7', reason: 'duplicate-student-no' }]);
    }
    expect(calls.studentInsert).toHaveLength(0);
  });

  test('empty entries array -> empty-entries, zero DB calls attempted (no precheck either)', async () => {
    const { client, calls } = makeFakeClient({});

    const result = await registerRosterEntries(client, CLASS_ID, []);

    expect(result).toEqual({ status: 'empty-entries' });
    expect(calls.precheck).toHaveLength(0);
    expect(calls.studentInsert).toHaveLength(0);
  });
});

describe('registerRosterEntries — Case F/G (scoping and allowed duplicates)', () => {
  test('F: pre-check is scoped to the given classId (other classes\' studentNo usage is irrelevant)', async () => {
    // existingStudentNos는 findExistingStudentNos()가 실제로는
    // .eq('class_id', classId)로 스코프된 쿼리 결과라는 계약을 나타낸다 —
    // 여기서는 "이 classId에서는 비어있음"을 표현해 성공해야 함을 보인다.
    const { client, calls } = makeFakeClient({
      existingStudentNos: [],
      studentInsertOutcome: { kind: 'ok', rows: [{ student_id: 'stu-1', name: '김민준' }] },
      enrollmentInsertOutcome: { kind: 'ok', rows: [{ enrollment_id: 'enroll-1', student_id: 'stu-1', student_no: '1' }] },
    });

    const result = await registerRosterEntries(client, CLASS_ID, [{ studentNo: '1', name: '김민준' }]);

    expect(result.status).toBe('ok');
    expect(calls.precheck[0].classId).toBe(CLASS_ID);
  });

  test('G: identical name across two entries is not an error (동명이인 허용)', async () => {
    const { client } = makeFakeClient({
      studentInsertOutcome: {
        kind: 'ok',
        rows: [
          { student_id: 'stu-1', name: '김민준' },
          { student_id: 'stu-2', name: '김민준' },
        ],
      },
      enrollmentInsertOutcome: {
        kind: 'ok',
        rows: [
          { enrollment_id: 'enroll-1', student_id: 'stu-1', student_no: '1' },
          { enrollment_id: 'enroll-2', student_id: 'stu-2', student_no: '2' },
        ],
      },
    });

    const result = await registerRosterEntries(client, CLASS_ID, [
      { studentNo: '1', name: '김민준' },
      { studentNo: '2', name: '김민준' },
    ]);

    expect(result.status).toBe('ok');
  });
});

describe('registerRosterEntries — Case K/L/M/N (insert failure and compensation)', () => {
  test('K: student insert fails -> insert-failed, enrollment insert never attempted', async () => {
    const { client, calls } = makeFakeClient({
      studentInsertOutcome: { kind: 'error', error: { message: 'connection reset' } },
    });

    const result = await registerRosterEntries(client, CLASS_ID, [{ studentNo: '1', name: '김민준' }]);

    expect(result).toEqual({ status: 'insert-failed' });
    expect(calls.enrollmentInsert).toHaveLength(0);
  });

  test('L: enrollment insert fails (non-collision) -> enrollment-failed, created students compensated', async () => {
    const { client, calls } = makeFakeClient({
      studentInsertOutcome: { kind: 'ok', rows: [{ student_id: 'stu-1', name: '김민준' }] },
      enrollmentInsertOutcome: { kind: 'error', error: { code: '42501', message: 'permission denied' } },
    });

    const result = await registerRosterEntries(client, CLASS_ID, [{ studentNo: '1', name: '김민준' }]);

    expect(result).toEqual({ status: 'enrollment-failed' });
    expect(calls.studentDelete).toEqual([['stu-1']]);
  });

  test('M: enrollment UNIQUE race (23505 after passing pre-check) -> duplicate-conflict, created students compensated', async () => {
    const { client, calls } = makeFakeClient({
      studentInsertOutcome: { kind: 'ok', rows: [{ student_id: 'stu-1', name: '김민준' }] },
      enrollmentInsertOutcome: { kind: 'collision' },
    });

    const result = await registerRosterEntries(client, CLASS_ID, [{ studentNo: '1', name: '김민준' }]);

    expect(result).toEqual({ status: 'duplicate-conflict' });
    expect(calls.studentDelete).toEqual([['stu-1']]);
  });

  test('N: compensating delete also fails -> still a controlled result (no DB detail leaked), failure is logged', async () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { client } = makeFakeClient({
        studentInsertOutcome: { kind: 'ok', rows: [{ student_id: 'stu-1', name: '김민준' }] },
        enrollmentInsertOutcome: { kind: 'error', error: { message: 'insert failed' } },
        deleteOutcome: { kind: 'error', error: { message: 'delete failed too' } },
      });

      const result = await registerRosterEntries(client, CLASS_ID, [{ studentNo: '1', name: '김민준' }]);

      expect(result).toEqual({ status: 'enrollment-failed' });
      expect(logSpy).toHaveBeenCalledTimes(1);
      const [tag, context] = logSpy.mock.calls[0];
      expect(tag).toContain('[teacher-roster-creation]');
      expect(context).toEqual({ studentIds: ['stu-1'] });
    } finally {
      logSpy.mockRestore();
    }
  });
});
