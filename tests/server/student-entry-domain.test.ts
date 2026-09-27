// D11-C1 Identity Regression Baseline — domain layer (validateStudentEntry /
// enterStudent)
//
// Test the existing behavior. Do not redesign it. This file locks the
// identity contract confirmed in D11-C0 §C: enterStudent()/validateStudentEntry()
// only ever compare already-looked-up SchoolClass/Enrollment/Student rows
// against normalized input — they never create rows, and studentNo is only
// unique scoped to (classId, studentNo), never globally.
//
// createInMemoryStudentDataSource (src/ui/student-data.ts) already exists as
// the project's own fake StudentDataSource for exactly this purpose (its own
// header comment: "0-D6 검증용") — reused as-is, no new test fixture
// architecture introduced.
import { describe, test, expect } from 'vitest';
import { validateStudentEntry } from '../../src/ui/student-domain';
import { enterStudent } from '../../src/ui/student-entry';
import { createInMemoryStudentDataSource, type InMemoryStudentFixtures } from '../../src/ui/student-data';

const CLASS_A = { classId: 'class-A', schoolYear: '2026', grade: 1, classNumber: 1, classCode: 'CODE-A' };
const CLASS_B = { classId: 'class-B', schoolYear: '2026', grade: 1, classNumber: 2, classCode: 'CODE-B' };

const STUDENT_1 = { studentId: 'stu-1', name: '김민준' };
const STUDENT_2 = { studentId: 'stu-2', name: '이서연' };

// Case 6 fixture: both classes use the SAME studentNo ('1') for a different
// student — this is the concrete case that would fail if studentNo were ever
// treated as a global identity instead of scoped to (classId, studentNo).
const ENROLL_A1 = { enrollmentId: 'enroll-A1', studentId: STUDENT_1.studentId, classId: CLASS_A.classId, studentNo: '1', enrolledAt: '2026-01-01T00:00:00Z' };
const ENROLL_B1 = { enrollmentId: 'enroll-B1', studentId: STUDENT_2.studentId, classId: CLASS_B.classId, studentNo: '1', enrolledAt: '2026-01-01T00:00:00Z' };

function makeFixtures(): InMemoryStudentFixtures {
  return {
    classes: [CLASS_A, CLASS_B],
    enrollments: [ENROLL_A1, ENROLL_B1],
    students: [STUDENT_1, STUDENT_2],
  };
}

describe('validateStudentEntry (pure domain result) — D11-C1 Case 1/2/3/4', () => {
  test('Case 1: exact match on classCode+studentNo+name -> accepted with existing ids', () => {
    const result = validateStudentEntry(
      { classCode: CLASS_A.classCode, studentNo: ENROLL_A1.studentNo, name: STUDENT_1.name },
      { schoolClass: CLASS_A, enrollment: ENROLL_A1, student: STUDENT_1 }
    );

    expect(result).toEqual({
      status: 'accepted',
      studentId: STUDENT_1.studentId,
      enrollmentId: ENROLL_A1.enrollmentId,
      classId: CLASS_A.classId,
    });
  });

  test('Case 2: studentNo matches but name differs -> name-mismatch (no auto-correct, no new student)', () => {
    const result = validateStudentEntry(
      { classCode: CLASS_A.classCode, studentNo: ENROLL_A1.studentNo, name: '다른이름' },
      { schoolClass: CLASS_A, enrollment: ENROLL_A1, student: STUDENT_1 }
    );

    expect(result).toEqual({
      status: 'name-mismatch',
      enrollmentId: ENROLL_A1.enrollmentId,
      classId: CLASS_A.classId,
    });
  });

  test('Case 3: class exists but no enrollment for that studentNo -> enrollment-not-found', () => {
    const result = validateStudentEntry(
      { classCode: CLASS_A.classCode, studentNo: 'unknown-no', name: '아무개' },
      { schoolClass: CLASS_A }
    );

    expect(result).toEqual({ status: 'enrollment-not-found', classId: CLASS_A.classId });
  });

  test('Case 4: classCode does not resolve to any SchoolClass -> class-not-found', () => {
    const result = validateStudentEntry({ classCode: 'NO-SUCH-CODE', studentNo: '1', name: '아무개' }, {});

    expect(result).toEqual({ status: 'class-not-found' });
  });
});

describe('enterStudent (orchestration) — D11-C1 Case 5/6', () => {
  test('Case 5: repeated entry by the same student is idempotent — same ids both times, no new rows implied', async () => {
    const dataSource = createInMemoryStudentDataSource(makeFixtures());
    const input = { classCode: CLASS_A.classCode, studentNo: ENROLL_A1.studentNo, name: STUDENT_1.name };

    const first = await enterStudent(input, dataSource);
    const second = await enterStudent(input, dataSource);

    expect(first).toEqual({
      status: 'accepted',
      studentId: STUDENT_1.studentId,
      enrollmentId: ENROLL_A1.enrollmentId,
      classId: CLASS_A.classId,
    });
    expect(second).toEqual(first);
  });

  test('Case 6: identical studentNo in two different classes resolves to two distinct enrollments — (class_id, student_no) scoping, not global studentNo identity', async () => {
    const dataSource = createInMemoryStudentDataSource(makeFixtures());

    const resultA = await enterStudent({ classCode: CLASS_A.classCode, studentNo: '1', name: STUDENT_1.name }, dataSource);
    const resultB = await enterStudent({ classCode: CLASS_B.classCode, studentNo: '1', name: STUDENT_2.name }, dataSource);

    expect(resultA).toEqual({
      status: 'accepted',
      studentId: STUDENT_1.studentId,
      enrollmentId: ENROLL_A1.enrollmentId,
      classId: CLASS_A.classId,
    });
    expect(resultB).toEqual({
      status: 'accepted',
      studentId: STUDENT_2.studentId,
      enrollmentId: ENROLL_B1.enrollmentId,
      classId: CLASS_B.classId,
    });

    // 교차 확인: A반 학생이 B반 enrollment로 잘못 연결되지 않았는지.
    if (resultA.status === 'accepted' && resultB.status === 'accepted') {
      expect(resultA.enrollmentId).not.toBe(resultB.enrollmentId);
      expect(resultA.studentId).not.toBe(resultB.studentId);
    }
  });

  test('Case 6b: wrong name for the SAME studentNo in the OTHER class -> name-mismatch, not a cross-class accept', async () => {
    const dataSource = createInMemoryStudentDataSource(makeFixtures());

    // B반의 studentNo '1'은 이서연 소유다 — A반 학생 이름(김민준)으로는
    // B반에 studentNo '1'로 들어갈 수 없어야 한다.
    const result = await enterStudent({ classCode: CLASS_B.classCode, studentNo: '1', name: STUDENT_1.name }, dataSource);

    expect(result).toEqual({ status: 'name-mismatch', enrollmentId: ENROLL_B1.enrollmentId, classId: CLASS_B.classId });
  });
});
