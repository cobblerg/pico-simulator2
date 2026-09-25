// Student Entry Flow의 data access 경계 (Stage 0-D6)
//
// student-domain.ts(타입/normalize/validate)는 이 파일을 import하지 않는다 —
// 의존 방향은 항상 student-data.ts → student-domain.ts다. 이 파일은 "조회
// 방법"만 책임지고, "조회된 값이 서로 일관적인지 판정"하는 것은 여전히
// student-domain.ts의 validateStudentEntry 책임으로 남긴다.
//
// StudentDataSource는 class가 아니라 3개 메서드만 가진 object type이다 —
// 이 repo에 도메인 로직을 담는 class가 없고(content-access.ts,
// checkpoint-evaluator.ts 모두 순수 함수 모듈), 이 인터페이스도 상태를 갖지
// 않기 때문이다. 각 메서드가 Promise를 반환하는 것은 지금 당장 비동기 조회가
// 필요해서가 아니라, 0-D7에서 Supabase 구현체로 교체될 때 이 타입과
// student-entry.ts가 무수정으로 유지되게 하기 위함이다.
import { SchoolClass, Student, Enrollment } from './student-domain';

export type StudentDataSource = {
  findSchoolClassByCode(classCode: string): Promise<SchoolClass | undefined>;
  findEnrollment(classId: string, studentNo: string): Promise<Enrollment | undefined>;
  findStudent(studentId: string): Promise<Student | undefined>;
};

// ---------- in-memory implementation (0-D6 검증용) ----------
//
// 실제 학생 개인정보를 담지 않는다 — 호출부(verification script)가 가상
// fixture를 채워 넣는다. fixtures 배열은 이 함수 밖에서 만들어져 closure로
// 캡처될 뿐, 이 파일 안에는 어떤 고정 데이터도 없다.
export type InMemoryStudentFixtures = {
  classes: SchoolClass[];
  enrollments: Enrollment[];
  students: Student[];
};

export function createInMemoryStudentDataSource(fixtures: InMemoryStudentFixtures): StudentDataSource {
  return {
    async findSchoolClassByCode(classCode) {
      return fixtures.classes.find((c) => c.classCode === classCode);
    },
    async findEnrollment(classId, studentNo) {
      return fixtures.enrollments.find((e) => e.classId === classId && e.studentNo === studentNo);
    },
    async findStudent(studentId) {
      return fixtures.students.find((s) => s.studentId === studentId);
    },
  };
}
