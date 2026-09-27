// D11-C6 §8/§9 — End-to-End Stabilization: teacher-created roster ↔ student entry
//
// registerRosterEntries()(teacher-roster-creation.ts, Supabase-shaped) and
// enterStudent()(student-entry.ts, camelCase domain-shaped via
// createInMemoryStudentDataSource) are two independently-tested code paths
// that have never been connected in a single test before. This file connects
// them without building a stateful fake Postgres: it takes the exact output
// of registerRosterEntries() and feeds it into createInMemoryStudentDataSource()
// fixtures (§8's own suggested recipe — "생성된 row를 fake datasource/state에
// 반영") to prove a teacher-created roster row is accepted by the existing
// student-entry path with the SAME studentId/enrollmentId, and that the
// D11-C0 exceptional-student recovery sequence (reject → teacher registers →
// retry accepted) holds end to end.
//
// No real Supabase call — the fake client below only supports the exact
// operations a single successful registerRosterEntries() call needs.
import { describe, test, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { registerRosterEntries } from '../../src/server/teacher-roster-creation';
import { enterStudent } from '../../src/ui/student-entry';
import { createInMemoryStudentDataSource, type InMemoryStudentFixtures } from '../../src/ui/student-data';

function makeSucceedingFakeClient(): SupabaseClient {
  return {
    from(table: string) {
      if (table === 'enrollment') {
        return {
          select() {
            return {
              eq() {
                return { in: async () => ({ data: [], error: null }) }; // 이 학급엔 기존 등록 학생 없음
              },
            };
          },
          insert() {
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      if (table === 'student') {
        return {
          insert() {
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      throw new Error(`unexpected table in fake client: ${table}`);
    },
  } as unknown as SupabaseClient;
}

function fixturesFor(
  classId: string,
  classCode: string,
  created: { studentId: string; enrollmentId: string; studentNo: string; name: string }
): InMemoryStudentFixtures {
  return {
    classes: [{ classId, schoolYear: '2026', grade: 1, classNumber: 1, classCode }],
    students: [{ studentId: created.studentId, name: created.name }],
    enrollments: [
      { enrollmentId: created.enrollmentId, studentId: created.studentId, classId, studentNo: created.studentNo, enrolledAt: '2026-01-01T00:00:00Z' },
    ],
  };
}

describe('D11-C6 §8: teacher-created roster student is accepted by student-entry with matching identity', () => {
  test('registerRosterEntries() output, seeded into student-entry fixtures, results in accepted with the same studentId/enrollmentId', async () => {
    const classId = 'class-int-1';
    const classCode = 'ABC123';

    const rosterResult = await registerRosterEntries(makeSucceedingFakeClient(), classId, [{ studentNo: '17', name: '김민준' }]);
    expect(rosterResult.status).toBe('ok');
    if (rosterResult.status !== 'ok') throw new Error('unreachable');
    const created = rosterResult.entries[0];

    const dataSource = createInMemoryStudentDataSource(fixturesFor(classId, classCode, created));
    const entryResult = await enterStudent({ classCode, studentNo: created.studentNo, name: created.name }, dataSource);

    expect(entryResult).toEqual({ status: 'accepted', studentId: created.studentId, enrollmentId: created.enrollmentId, classId });
  });
});

describe('D11-C6 §9: exceptional student recovery sequence (reject -> teacher registers -> retry accepted)', () => {
  test('unknown studentNo is rejected, then accepted after the exact same teacher-registration path used elsewhere', async () => {
    const classId = 'class-int-2';
    const classCode = 'XYZ789';

    // 1) 명단에 없는 학생 — 자동 생성 없이 거절되어야 한다(D11-C0 정책).
    const beforeDataSource = createInMemoryStudentDataSource({
      classes: [{ classId, schoolYear: '2026', grade: 1, classNumber: 2, classCode }],
      students: [],
      enrollments: [],
    });
    const before = await enterStudent({ classCode, studentNo: '30', name: '전학생' }, beforeDataSource);
    expect(before.status).toBe('enrollment-not-found');

    // 2) 교사가 C3/C4와 동일한 단건 등록 경로(registerRosterEntries)로 즉석
    //    등록한다 — 별도 pending/승인 시스템을 거치지 않는다(D11-C0 확정).
    const rosterResult = await registerRosterEntries(makeSucceedingFakeClient(), classId, [{ studentNo: '30', name: '전학생' }]);
    expect(rosterResult.status).toBe('ok');
    if (rosterResult.status !== 'ok') throw new Error('unreachable');
    const created = rosterResult.entries[0];

    // 3) 학생이 같은 화면에서 재시도한다 — student-entry-ui.ts는 rejected 시
    //    폼을 리셋하지 않으므로(§7 확인) 새로고침 없이 같은 값을 다시 제출할
    //    수 있고, enterStudent()는 매번 데이터소스를 실시간 조회하므로
    //    (캐시 없음) 등록 직후 즉시 accepted될 수 있다. 여기서는 "등록 후
    //    DB 상태"를 두 번째 dataSource로 표현한다(같은 원리, 별도 mutable
    //    저장소를 새로 만들지 않기 위한 단순화).
    const afterDataSource = createInMemoryStudentDataSource(fixturesFor(classId, classCode, created));
    const after = await enterStudent({ classCode, studentNo: '30', name: '전학생' }, afterDataSource);

    expect(after).toEqual({ status: 'accepted', studentId: created.studentId, enrollmentId: created.enrollmentId, classId });
  });
});
