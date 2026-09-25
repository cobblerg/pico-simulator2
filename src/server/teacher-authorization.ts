// 교사-학급 권한 경계 (Stage 0-D10-B)
//
// teacher-session.ts가 "이 사람이 승인된 교사인가"(신원)를 책임진다면, 이
// 파일은 "이 교사가 이 학급에 접근할 수 있는가"(권한)만 책임진다 — 서로
// 다른 책임이라 별도 파일로 분리했다(0-D10-B design review §5). 이후
// 0-D10-C 이후의 모든 교사 API(학급 상세, 학생 목록, timeline, feedback)가
// 이 파일의 두 함수를 공통으로 재사용해야 한다 — API마다 "이 교사가 이
// classId/enrollmentId에 접근해도 되는가"를 각자 다시 구현하지 않는다.
//
// 두 함수 모두 teacherId를 인자로 받되, 이 인자는 항상 호출부(handler)가
// resolveTeacherFromAccessToken()으로 access token을 검증해 얻은 값이어야
// 한다 — 브라우저가 request body/query로 보낸 teacherId를 그대로 넘기는
// 호출은 이 프로젝트의 어떤 handler도 만들지 않는다(0-D10-B 정책 8, 학생
// Event API가 body의 studentId/enrollmentId/classId를 절대 신뢰하지 않는
// 것과 동일한 원칙).
//
// service-role client는 RLS를 우회한다 — 즉 이 파일의 두 함수야말로 "어느
// 교사가 어느 학급을 볼 수 있는가"를 실제로 결정하는 유일한 방어선이다.
// DB가 대신 막아주지 않는다(0-D10 아키텍처 리뷰 §7에서 이미 명시한 원칙).
import { SupabaseClient } from '@supabase/supabase-js';

export type TeacherClassSummary = {
  classId: string;
  schoolYear: string;
  grade: number;
  classNumber: number;
  classCode: string;
};

type TeacherClassLinkRow = { class_id: string };
type SchoolClassRow = {
  class_id: string;
  school_year: string;
  grade: number;
  class_number: number;
  class_code: string;
};

// teacher_class에 (teacherId, classId) 조합이 실존하는지만 확인한다.
// 정상적으로는 PK 유일성상 0개 또는 1개만 가능하다 — 방어적으로 2개 이상도
// "허용하지 않음"으로 취급한다(learning-event-data.ts의
// verifyEnrollmentConsistency, teacher-session.ts의
// findApprovedTeacherByAuthUserId와 동일한 방어 패턴).
export async function assertTeacherOwnsClass(
  client: SupabaseClient,
  teacherId: string,
  classId: string
): Promise<boolean> {
  const { data, error } = await client
    .from('teacher_class')
    .select('teacher_id, class_id')
    .eq('teacher_id', teacherId)
    .eq('class_id', classId)
    .limit(2);

  if (error) throw error;
  return data.length === 1;
}

// teacherId에 연결된 school_class만 반환한다. 1) teacher_class를
// teacherId로 필터해 classId 목록을 얻고, 2) 그 목록으로만 school_class를
// 조회한다 — 다른 교사의 classId가 섞일 수 있는 경로 자체가 없다(2단계의
// IN 절 자체가 이미 teacherId로 필터된 결과이기 때문). 담당 학급이 없으면
// 빈 배열을 반환한다(에러가 아니다 — 정상 상태).
export async function listTeacherClasses(
  client: SupabaseClient,
  teacherId: string
): Promise<TeacherClassSummary[]> {
  const { data: links, error: linkError } = await client
    .from('teacher_class')
    .select('class_id')
    .eq('teacher_id', teacherId);

  if (linkError) throw linkError;

  const classIds = (links as TeacherClassLinkRow[]).map((row) => row.class_id);
  if (classIds.length === 0) return [];

  const { data: classes, error: classError } = await client
    .from('school_class')
    .select('class_id, school_year, grade, class_number, class_code')
    .in('class_id', classIds);

  if (classError) throw classError;

  return (classes as SchoolClassRow[]).map((row) => ({
    classId: row.class_id,
    schoolYear: row.school_year,
    grade: row.grade,
    classNumber: row.class_number,
    classCode: row.class_code,
  }));
}
