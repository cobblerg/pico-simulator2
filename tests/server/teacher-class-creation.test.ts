// D11-C2 — Class Creation Server Boundary: classCode generation + orchestration
//
// createTeacherClassWithGeneratedCode()는 SupabaseClient를 직접 받는 순수
// 오케스트레이션 함수다(teacher-authorization.ts/teacher-student-data.ts와
// 동일한 스타일 — src/ui/student-data.ts류의 별도 DataSource interface를
// 새로 만들지 않았다). 여기서는 그 계약에 맞춰 ad-hoc fake SupabaseClient를
// 직접 구성한다(ai-learning-analysis.test.ts의 T9c와 동일한 스타일).
import { describe, test, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  generateClassCode,
  createTeacherClassWithGeneratedCode,
  MAX_CLASS_CODE_ATTEMPTS,
  CLASS_CODE_ALPHABET,
  CLASS_CODE_LENGTH,
} from '../../src/server/teacher-class-creation';

describe('generateClassCode', () => {
  test('produces CLASS_CODE_LENGTH characters, all drawn from CLASS_CODE_ALPHABET (injected deterministic source)', () => {
    const code = generateClassCode(() => 0);

    expect(code).toHaveLength(CLASS_CODE_LENGTH);
    expect(code).toBe(CLASS_CODE_ALPHABET[0].repeat(CLASS_CODE_LENGTH));
    for (const ch of code) {
      expect(CLASS_CODE_ALPHABET).toContain(ch);
    }
  });

  test('production default (no injected source) still yields a valid-shaped code using only the confusable-excluded alphabet', () => {
    const code = generateClassCode();

    expect(code).toHaveLength(CLASS_CODE_LENGTH);
    for (const ch of code) {
      expect(CLASS_CODE_ALPHABET).toContain(ch);
    }
    expect(code).not.toMatch(/[0O1I]/);
  });
});

type SchoolClassRow = { class_id: string; school_year: string; grade: number; class_number: number; class_code: string };

type InsertOutcome = { kind: 'ok'; row: SchoolClassRow } | { kind: 'collision' } | { kind: 'error'; error: unknown };

function makeFakeClient(config: {
  insertOutcomes: InsertOutcome[];
  linkOutcome?: { kind: 'ok' } | { kind: 'error'; error: unknown };
  deleteOutcome?: { kind: 'ok' } | { kind: 'error'; error: unknown };
}) {
  let insertIndex = 0;
  const insertCalls: Record<string, unknown>[] = [];
  const linkCalls: Record<string, unknown>[] = [];
  const deleteCalls: string[] = [];

  const client = {
    from(table: string) {
      if (table === 'school_class') {
        return {
          insert(row: Record<string, unknown>) {
            insertCalls.push(row);
            const outcome = config.insertOutcomes[insertIndex++];
            return {
              select() {
                return {
                  async single() {
                    if (!outcome) throw new Error('test setup error: not enough insertOutcomes');
                    if (outcome.kind === 'ok') return { data: outcome.row, error: null };
                    if (outcome.kind === 'collision') {
                      return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "school_class_class_code_key"' } };
                    }
                    return { data: null, error: outcome.error };
                  },
                };
              },
            };
          },
          delete() {
            return {
              async eq(_col: string, classId: string) {
                deleteCalls.push(classId);
                const outcome = config.deleteOutcome ?? { kind: 'ok' as const };
                if (outcome.kind === 'ok') return { error: null };
                return { error: outcome.error };
              },
            };
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

  return { client, insertCalls, linkCalls, deleteCalls };
}

const INPUT = { schoolYear: '2026', grade: 1, classNumber: 3 };
const TEACHER_ID = 'teacher-1';

function row(classCode: string): SchoolClassRow {
  return { class_id: 'class-new', school_year: INPUT.schoolYear, grade: INPUT.grade, class_number: INPUT.classNumber, class_code: classCode };
}

describe('createTeacherClassWithGeneratedCode — D11-C2 §12 A/E/F/G/H/I', () => {
  test('A: successful creation -> school_class + teacher_class both created, identity returned', async () => {
    const { client, insertCalls, linkCalls } = makeFakeClient({ insertOutcomes: [{ kind: 'ok', row: row('ABCDEF') }] });

    const result = await createTeacherClassWithGeneratedCode(client, TEACHER_ID, INPUT, { generateCode: () => 'ABCDEF' });

    expect(result).toEqual({
      status: 'ok',
      schoolClass: { classId: 'class-new', schoolYear: INPUT.schoolYear, grade: INPUT.grade, classNumber: INPUT.classNumber, classCode: 'ABCDEF' },
    });
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toMatchObject({ class_code: 'ABCDEF' });
    expect(linkCalls).toHaveLength(1);
    expect(linkCalls[0]).toEqual({ teacher_id: TEACHER_ID, class_id: 'class-new' });
  });

  test('E: first classCode collides, second succeeds -> retried once, final class uses the second code', async () => {
    const { client, insertCalls } = makeFakeClient({
      insertOutcomes: [{ kind: 'collision' }, { kind: 'ok', row: row('SECOND1') }],
    });
    const codes = ['FIRST01', 'SECOND1'];
    let i = 0;

    const result = await createTeacherClassWithGeneratedCode(client, TEACHER_ID, INPUT, { generateCode: () => codes[i++] });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.schoolClass.classCode).toBe('SECOND1');
    expect(insertCalls).toHaveLength(2);
  });

  test('F: collision on every attempt up to the limit -> code-exhausted, no infinite loop (exactly MAX_CLASS_CODE_ATTEMPTS inserts)', async () => {
    const outcomes: InsertOutcome[] = Array.from({ length: MAX_CLASS_CODE_ATTEMPTS }, () => ({ kind: 'collision' as const }));
    const { client, insertCalls } = makeFakeClient({ insertOutcomes: outcomes });

    const result = await createTeacherClassWithGeneratedCode(client, TEACHER_ID, INPUT, { generateCode: () => 'SAME01' });

    expect(result).toEqual({ status: 'code-exhausted' });
    expect(insertCalls).toHaveLength(MAX_CLASS_CODE_ATTEMPTS);
  });

  test('G: non-collision insert error -> insert-failed immediately, not retried', async () => {
    const { client, insertCalls } = makeFakeClient({
      insertOutcomes: [{ kind: 'error', error: { code: '42501', message: 'permission denied for table school_class' } }],
    });

    const result = await createTeacherClassWithGeneratedCode(client, TEACHER_ID, INPUT, { generateCode: () => 'AAAAAA' });

    expect(result).toEqual({ status: 'insert-failed' });
    expect(insertCalls).toHaveLength(1); // 재시도하지 않았다
  });

  test('H: teacher_class insert fails -> ownership-failed, compensating delete attempted on the just-created class', async () => {
    const { client, deleteCalls } = makeFakeClient({
      insertOutcomes: [{ kind: 'ok', row: row('ABCDEF') }],
      linkOutcome: { kind: 'error', error: { message: 'insert failed' } },
      deleteOutcome: { kind: 'ok' },
    });

    const result = await createTeacherClassWithGeneratedCode(client, TEACHER_ID, INPUT, { generateCode: () => 'ABCDEF' });

    expect(result).toEqual({ status: 'ownership-failed' });
    expect(deleteCalls).toEqual(['class-new']);
  });

  test('I: compensation delete also fails -> still a controlled ownership-failed to the caller, no internal DB detail leaked, failure is logged', async () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { client } = makeFakeClient({
        insertOutcomes: [{ kind: 'ok', row: row('ABCDEF') }],
        linkOutcome: { kind: 'error', error: { message: 'insert failed' } },
        deleteOutcome: { kind: 'error', error: { message: 'delete failed too' } },
      });

      const result = await createTeacherClassWithGeneratedCode(client, TEACHER_ID, INPUT, { generateCode: () => 'ABCDEF' });

      expect(result).toEqual({ status: 'ownership-failed' }); // 원본 에러 detail이 result에 없다
      expect(logSpy).toHaveBeenCalledTimes(1);
      const [tag, context] = logSpy.mock.calls[0];
      expect(tag).toContain('[teacher-class-creation]');
      expect(context).toEqual({ classId: 'class-new' });
    } finally {
      logSpy.mockRestore();
    }
  });
});
