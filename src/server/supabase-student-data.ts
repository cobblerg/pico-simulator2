// Supabase 기반 StudentDataSource 구현체 (Stage 0-D7-A)
//
// src/ui/student-data.ts의 StudentDataSource 계약을 그대로 구현한다 —
// student-data.ts 자체는 수정하지 않는다. 이 파일은 서버 전용이며
// SupabaseClient(secret key로 생성된 것, supabase.ts 참고)를 인자로 받는다 —
// secret key를 이 파일 안에서 직접 읽지 않고 항상 밖에서 만들어진 client를
// 주입받는다.
//
// snake_case(DB 컬럼명) ↔ camelCase(도메인 타입) 매핑은 이 파일의 책임이다.
// student-domain.ts의 타입은 DB naming 때문에 수정하지 않는다.
//
// row가 0개면 undefined, 1개면 domain object로 매핑한다. UNIQUE 제약(migration
// SQL 참고) 덕분에 정상적으로는 2개 이상 나올 수 없지만, 혹시 나오면 조용히
// 하나를 고르지 않고 data-integrity/infrastructure failure로 throw한다 —
// 0-D6의 원칙(resolve = domain result, reject = infrastructure failure)을
// 그대로 따른다. Supabase 쿼리 자체가 에러를 반환하면 그대로 throw해
// 호출자(enterStudent)에게 전파되게 둔다 — 여기서 catch하지 않는다.
import { SupabaseClient } from '@supabase/supabase-js';
import { SchoolClass, Student, Enrollment } from '../ui/student-domain';
import { StudentDataSource } from '../ui/student-data';

type SchoolClassRow = {
  class_id: string;
  school_year: string;
  grade: number;
  class_number: number;
  class_code: string;
};

type StudentRow = {
  student_id: string;
  name: string;
};

type EnrollmentRow = {
  enrollment_id: string;
  student_id: string;
  class_id: string;
  student_no: string;
  enrolled_at: string;
};

function toSchoolClass(row: SchoolClassRow): SchoolClass {
  return {
    classId: row.class_id,
    schoolYear: row.school_year,
    grade: row.grade,
    classNumber: row.class_number,
    classCode: row.class_code,
  };
}

function toStudent(row: StudentRow): Student {
  return { studentId: row.student_id, name: row.name };
}

function toEnrollment(row: EnrollmentRow): Enrollment {
  return {
    enrollmentId: row.enrollment_id,
    studentId: row.student_id,
    classId: row.class_id,
    studentNo: row.student_no,
    enrolledAt: row.enrolled_at,
  };
}

export function createSupabaseStudentDataSource(client: SupabaseClient): StudentDataSource {
  return {
    async findSchoolClassByCode(classCode) {
      const { data, error } = await client
        .from('school_class')
        .select('class_id, school_year, grade, class_number, class_code')
        .eq('class_code', classCode)
        .limit(2);

      if (error) throw error;
      if (data.length === 0) return undefined;
      if (data.length > 1) {
        throw new Error(`data integrity: school_class.class_code UNIQUE 위반 — 2개 이상의 row가 조회됨`);
      }
      return toSchoolClass(data[0] as SchoolClassRow);
    },

    async findEnrollment(classId, studentNo) {
      const { data, error } = await client
        .from('enrollment')
        .select('enrollment_id, student_id, class_id, student_no, enrolled_at')
        .eq('class_id', classId)
        .eq('student_no', studentNo)
        .limit(2);

      if (error) throw error;
      if (data.length === 0) return undefined;
      if (data.length > 1) {
        throw new Error(`data integrity: enrollment(class_id, student_no) UNIQUE 위반 — 2개 이상의 row가 조회됨`);
      }
      return toEnrollment(data[0] as EnrollmentRow);
    },

    async findStudent(studentId) {
      const { data, error } = await client
        .from('student')
        .select('student_id, name')
        .eq('student_id', studentId)
        .limit(2);

      if (error) throw error;
      if (data.length === 0) return undefined;
      if (data.length > 1) {
        throw new Error(`data integrity: student.student_id PK 위반 — 2개 이상의 row가 조회됨`);
      }
      return toStudent(data[0] as StudentRow);
    },
  };
}
