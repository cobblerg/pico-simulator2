// 학급별 학생 목록 조회 (Stage 0-D10-C)
//
// teacher-authorization.ts는 "이 교사가 이 학급에 접근할 수 있는가"만
// 책임진다(0-D10-B에서 확정된 경계). 이 파일은 "그 학급의 학생이 누구인가"
// 라는 별개 책임을 진다 — assertTeacherOwnsClass()를 통과한 뒤에만
// 호출되는 것을 전제로 하며, 이 파일 자체는 authorization을 전혀 하지
// 않는다(0-D10-C 확정 결정 1 — teacher-authorization.ts에 추가하지 않고
// 신규 파일로 분리).
//
// enrollment(class_id로 필터) → student(student_id로 JOIN 대신 별도
// 조회)의 2단계 조회 패턴은 teacher-authorization.ts의
// listTeacherClasses()(teacher_class → school_class 2단계)와 동일한
// 스타일이다 — 이 프로젝트가 Supabase 관계를 다룰 때 일관되게 쓰는 방식.
import { SupabaseClient } from '@supabase/supabase-js';

export type StudentSummary = {
  enrollmentId: string;
  studentId: string;
  studentNo: string;
  name: string;
};

type EnrollmentRow = { enrollment_id: string; student_id: string; student_no: string };
type StudentRow = { student_id: string; name: string };

// 이 classId에 등록된 학생만 반환한다. 호출부(teacher-students-handler.ts)가
// assertTeacherOwnsClass()로 이미 접근 권한을 확인한 뒤에만 이 함수를
// 불러야 한다 — 이 함수 자체는 classId가 그 교사의 것인지 검증하지 않는다
// (책임 분리, 파일 헤더 참고).
export async function listStudentsForClass(client: SupabaseClient, classId: string): Promise<StudentSummary[]> {
  const { data: enrollments, error: enrollmentError } = await client
    .from('enrollment')
    .select('enrollment_id, student_id, student_no')
    .eq('class_id', classId);

  if (enrollmentError) throw enrollmentError;
  if (enrollments.length === 0) return [];

  const rows = enrollments as EnrollmentRow[];
  const studentIds = rows.map((r) => r.student_id);

  const { data: students, error: studentError } = await client
    .from('student')
    .select('student_id, name')
    .in('student_id', studentIds);

  if (studentError) throw studentError;

  const nameByStudentId = new Map((students as StudentRow[]).map((s) => [s.student_id, s.name]));

  return rows.map((r) => ({
    enrollmentId: r.enrollment_id,
    studentId: r.student_id,
    studentNo: r.student_no,
    name: nameByStudentId.get(r.student_id) ?? '',
  }));
}
