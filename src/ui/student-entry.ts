// Student Entry orchestration (Stage 0-D6)
//
// enterStudent()는 raw 입력을 normalize하고, StudentDataSource로 SchoolClass/
// Enrollment/Student를 순서대로 조회한 뒤, 그 결과를 student-domain.ts의
// validateStudentEntry()에 그대로 넘겨 판정을 위임하는 orchestration
// 함수다. 이 파일 자체는 어떤 domain status도 직접 만들지 않는다 — class-
// not-found/enrollment-not-found 등은 전부 validateStudentEntry가 결정한다.
//
// lookup은 필요한 만큼만 한다(short-circuit): SchoolClass가 없으면
// Enrollment/Student를 조회하지 않고, Enrollment가 없으면 Student를
// 조회하지 않는다.
//
// infrastructure failure(DataSource가 던지는 예외/reject) 정책: 이 함수는
// dataSource 호출을 try/catch로 감싸지 않는다 — reject는 그대로 호출자에게
// 전파된다. enterStudent가 resolve하면 항상 StudentEntryResult(정상적인
// domain 판정, 실패 포함)이고, reject하면 항상 infrastructure failure라는
// 뜻이 되도록 이 둘을 뒤섞지 않는다.
import { StudentEntryInput, StudentEntryResult, StudentContext, normalizeStudentEntryInput, validateStudentEntry } from './student-domain';
import { StudentDataSource } from './student-data';

export async function enterStudent(
  rawInput: StudentEntryInput,
  dataSource: StudentDataSource
): Promise<StudentEntryResult> {
  const input = normalizeStudentEntryInput(rawInput);

  const schoolClass = await dataSource.findSchoolClassByCode(input.classCode);
  if (schoolClass === undefined) {
    return validateStudentEntry(input, {});
  }

  const enrollment = await dataSource.findEnrollment(schoolClass.classId, input.studentNo);
  if (enrollment === undefined) {
    return validateStudentEntry(input, { schoolClass });
  }

  const student = await dataSource.findStudent(enrollment.studentId);

  return validateStudentEntry(input, { schoolClass, enrollment, student });
}

// StudentEntryResult의 accepted variant가 이미 StudentContext와 동일한 세
// 필드(studentId/enrollmentId/classId)를 담고 있으므로, 별도 Result<T>나
// union을 새로 만들지 않고 이 한 줄짜리 추출 헬퍼만 둔다. 호출자는 추가
// lookup 없이 accepted 결과에서 바로 StudentContext를 얻을 수 있다.
export function toStudentContext(
  accepted: Extract<StudentEntryResult, { status: 'accepted' }>
): StudentContext {
  return {
    studentId: accepted.studentId,
    enrollmentId: accepted.enrollmentId,
    classId: accepted.classId,
  };
}
