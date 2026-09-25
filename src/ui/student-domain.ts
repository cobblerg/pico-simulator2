// Student/Class/Enrollment 도메인 타입 (Stage 0-D5-A)
//
// docs/PRD.md 12장(Student/Enrollment 분리 모델, Model B)을 TypeScript 타입으로만
// 옮긴 것이다. 이 파일은 타입 정의만 담고 있으며, 함수/클래스/런타임 상수/
// normalization/validation/데이터 조회/Supabase/UUID 생성 등 어떤 로직도
// 포함하지 않는다.
//
// 이 파일은 의도적으로 다른 모듈을 import하지 않으며(외부 의존 0개),
// 아직 어떤 기존 코드에서도 import되지 않는다 — 0-A의 content.ts, 0-C1의
// checkpoint.ts와 동일하게 "연결 안 된" type-only leaf 모듈로 착지한다.

// ---------- SchoolClass ----------
// 학년도별로 새로 생성되는 논리적 학급(PRD 12.4). "Class"라는 이름은 TS/JS의
// class 키워드와 시각적으로 혼동되므로 SchoolClass로 명명한다.
// teacherId는 교사 인증 방식이 아직 미결정이라 포함하지 않는다(PRD 11장 열린 질문).
export type SchoolClass = {
  classId: string; // 내부 식별자
  schoolYear: string; // 학년도
  grade: number; // 학년
  classNumber: number; // 반
  classCode: string; // 학생 입장용 변경 가능한 코드 (PRD 12.19)
};

// ---------- Student ----------
// 학급/학번이 바뀌어도 유지되는 학생 정체성(PRD 12.2). classId/studentNo는
// Enrollment로 이동했으므로 여기 두지 않는다.
export type Student = {
  studentId: string;
  name: string;
};

// ---------- Enrollment ----------
// 특정 학생이 특정 학년도·학급에 소속되어 있다는 사실(PRD 12.3).
// studentNo는 반드시 string이다 — "01", "001" 같은 leading zero가 의미를 가질 수
// 있고, 애초에 산술 연산 대상이 아닌 식별 라벨이기 때문이다(number로 바꾸지 않는다).
// status/leftAt(전학·진급 상태)은 정책이 아직 확정되지 않아 포함하지 않는다.
export type Enrollment = {
  enrollmentId: string;
  studentId: string; // FK -> Student
  classId: string; // FK -> SchoolClass
  studentNo: string; // 그 학급에서 쓰는 학번 (NOT NULL, string)
  enrolledAt: string; // 소속이 시작된 시점 (ISO 8601 문자열)
};

// ---------- StudentEntryInput ----------
// 학생이 실제로 입력하는 원시 값. Student/Enrollment 엔티티와 섞지 않는다 —
// 입력은 신뢰할 수 없는 텍스트이고, 저장 엔티티는 조회의 결과이기 때문이다.
export type StudentEntryInput = {
  classCode: string;
  studentNo: string;
  name: string;
};

// ---------- StudentEntryResult ----------
// 학생 입장 판정 결과. boolean 하나로 뭉치지 않고, 서로 다른 처리(호출부 행동)가
// 필요한 5가지 상황을 discriminated union으로 구분한다(PRD 12.7~12.9 대응).
// name-mismatch/data-integrity-error에는 실제 이름이나 studentNo를 담지 않는다
// (개인정보 노출 방지) — ID만으로 호출부가 필요한 판단을 할 수 있게 한다.
export type StudentEntryResult =
  | {
      status: 'accepted';
      studentId: string;
      enrollmentId: string;
      classId: string;
    }
  | {
      status: 'class-not-found';
    }
  | {
      status: 'enrollment-not-found';
      classId: string;
    }
  | {
      status: 'name-mismatch';
      enrollmentId: string;
      classId: string;
    }
  | {
      status: 'data-integrity-error';
      enrollmentId: string;
    };

// ---------- StudentContext ----------
// 학생 입장이 성공(accepted)한 뒤 앱이 계속 들고 있을 최소 런타임 identity
// context. 개인정보 최소화를 위해 name/studentNo/classCode는 담지 않는다 —
// 화면 표시가 필요하면 그때그때 Student/Enrollment를 다시 조회한다.
export type StudentContext = {
  studentId: string;
  enrollmentId: string;
  classId: string;
};

// ---------- RosterEntryInput ----------
// 교사가 명단에 입력하는 한 학생의 원시 값. classId는 교사가 현재 선택한
// SchoolClass 컨텍스트에서 별도로 공급되므로 여기 포함하지 않는다.
export type RosterEntryInput = {
  studentNo: string;
  name: string;
};

// ---------- RosterEntryValidation ----------
// 명단 등록(또는 향후 일괄 import) 시 한 행의 검증 결과. 이름 중복은 정상
// 상황(동명이인 허용, PRD 12.5)이므로 이 union에 포함하지 않는다 — studentNo
// 중복/누락과 이름 누락만 오류로 취급한다.
export type RosterEntryValidation =
  | {
      status: 'valid';
      entry: RosterEntryInput;
    }
  | {
      status: 'duplicate-student-no';
      studentNo: string;
    }
  | {
      status: 'missing-student-no';
    }
  | {
      status: 'missing-name';
    };

// ---------- normalization (Stage 0-D5-B) ----------
//
// 아래 두 함수는 "명확히 같은 입력의 표현 차이만 정리하고, 학생의 신원을
// 추측하지 않는다"는 원칙만 적용하는 순수 함수다. 앞뒤 공백 제거와 Unicode
// NFC 정규화(손실 없는 표준 정규화 — 같은 사람이 입력한 동일한 한글 텍스트가
// 결합형/분해형 인코딩 차이로 다르게 비교되는 것을 막는다)만 수행한다.
//
// 다음은 절대 하지 않는다: 내부 공백 제거, 대소문자 변경, fuzzy/유사도 매칭,
// 자모 기반 유사 매칭, 숫자 변환(Number/parseInt), leading zero 제거/학번
// padding, 이름 자동 수정. 이런 "도움이 되려는" 보정은 서로 다른 학생을
// 잘못 연결할 위험을 만든다.
//
// normalize != validate: 빈 문자열이 되어도 여기서는 오류를 내지 않는다.
// 값이 비어 있는지 판단하는 것은 0-D5-C의 validation 책임이다.
// 입력 객체는 mutate하지 않고 항상 새 객체를 반환한다.

function normalizeText(value: string): string {
  return value.trim().normalize('NFC');
}

export function normalizeStudentEntryInput(input: StudentEntryInput): StudentEntryInput {
  return {
    classCode: normalizeText(input.classCode),
    studentNo: normalizeText(input.studentNo),
    name: normalizeText(input.name),
  };
}

export function normalizeRosterEntry(input: RosterEntryInput): RosterEntryInput {
  return {
    studentNo: normalizeText(input.studentNo),
    name: normalizeText(input.name),
  };
}

// ---------- validation (Stage 0-D5-C1) ----------
//
// validateStudentEntry는 이미 조회된 Student/Enrollment/SchoolClass 데이터와
// (정규화된) 학생 입력이 서로 일관적인지만 판정하는 순수 함수다. 이 함수는:
//
// - DB/repository를 조회하지 않는다 (StudentEntryValidationContext로 조회
//   결과를 미리 받는다 — repository나 DB 개념은 이 타입에 넣지 않는다).
// - Student/Enrollment를 생성하지 않는다.
// - 아무 것도 저장하지 않는다.
// - input/context를 mutate하지 않는다.
//
// normalizeStudentEntryInput()을 내부에서 다시 호출하지 않는다 — normalize와
// validate의 책임을 분리하기 위함이다. 향후 orchestration layer가
// normalize → lookup → validate 순서로 조합할 것을 전제한다. 따라서 trim되지
// 않은 raw 입력을 그대로 넣으면 저장된 값과 형식이 달라 의도치 않게 실패할
// 수 있다 — 이는 의도된 계약이다.
//
// 판정 우선순위(먼저 만족하는 조건이 결과를 결정하며, 비정상적인 context
// 조합에서도 이 순서는 deterministic하다):
//   1. schoolClass 없음 → class-not-found
//   2. input.classCode !== schoolClass.classCode → class-not-found
//      (정상 흐름이라면 classCode로 SchoolClass를 조회했으므로 항상 같아야
//      한다. 다르면 잘못된 context가 전달된 것이며, 사용자 관점에서는 입력한
//      classCode에 해당하는 유효한 Class가 확인되지 않은 것과 동일하다.
//      내부 ID 정보를 노출하지 않기 위해 data-integrity-error가 아닌
//      class-not-found로 취급한다 — schoolClass 자체가 없는 경우(1번)와
//      같은 이유이므로 그 바로 다음 우선순위로 둔다.)
//   3. enrollment 없음 → enrollment-not-found
//   4. student 없음 → data-integrity-error (조회 결과 자체가 모순)
//   5. enrollment.classId/studentId가 schoolClass/student와 다름
//      → data-integrity-error
//   6. input.studentNo !== enrollment.studentNo → data-integrity-error
//      (정상 orchestration이라면 (classId, studentNo)로 enrollment를
//      조회했으므로 항상 같아야 한다. 잘못된 enrollment가 전달되어 다른
//      학생을 accepted시키는 것을 막기 위한 방어적 검사다. fuzzy matching이나
//      숫자 변환은 하지 않는다.)
//   7. input.name !== student.name (strict equality) → name-mismatch
//   8. 위 전부 통과 → accepted
//
// 이 함수가 검사하지 않는 것: input.classCode/studentNo/name이 빈 문자열인지
// 여부. "조회된 domain data와 입력 identity가 서로 일관적인가"만 판정하며,
// form validation은 향후 orchestration layer의 책임으로 남긴다.
//
// name-mismatch/data-integrity-error 결과에는 실제 name/studentNo/classCode
// 값을 담지 않는다 — StudentEntryResult 타입 자체가 이를 강제한다(위 참고).

export type StudentEntryValidationContext = {
  schoolClass?: SchoolClass;
  enrollment?: Enrollment;
  student?: Student;
};

export function validateStudentEntry(
  input: StudentEntryInput,
  context: StudentEntryValidationContext
): StudentEntryResult {
  const { schoolClass, enrollment, student } = context;

  if (schoolClass === undefined) {
    return { status: 'class-not-found' };
  }

  if (input.classCode !== schoolClass.classCode) {
    return { status: 'class-not-found' };
  }

  if (enrollment === undefined) {
    return { status: 'enrollment-not-found', classId: schoolClass.classId };
  }

  if (student === undefined) {
    return { status: 'data-integrity-error', enrollmentId: enrollment.enrollmentId };
  }

  if (enrollment.classId !== schoolClass.classId || enrollment.studentId !== student.studentId) {
    return { status: 'data-integrity-error', enrollmentId: enrollment.enrollmentId };
  }

  if (input.studentNo !== enrollment.studentNo) {
    return { status: 'data-integrity-error', enrollmentId: enrollment.enrollmentId };
  }

  if (input.name !== student.name) {
    return {
      status: 'name-mismatch',
      enrollmentId: enrollment.enrollmentId,
      classId: schoolClass.classId,
    };
  }

  return {
    status: 'accepted',
    studentId: student.studentId,
    enrollmentId: enrollment.enrollmentId,
    classId: schoolClass.classId,
  };
}

// ---------- roster validation (Stage 0-D5-C2) ----------
//
// validateRosterEntry는 교사가 학생 명단을 등록할 때 한 행(row)이 유효한지
// 판정하는 순수 함수다. validateStudentEntry와 마찬가지로 이미
// normalizeRosterEntry()를 통과한 입력을 받는 것을 기본 계약으로 하며,
// 내부에서 normalizeRosterEntry()를 다시 호출하지 않는다 — normalize와
// validate의 책임을 분리하기 위함이다. 향후 orchestration layer가
// raw input → normalizeRosterEntry() → duplicate lookup →
// validateRosterEntry() 순서로 조합할 것을 전제한다.
//
// studentNo 중복 여부는 이 함수가 직접 DB/배열을 검색해서 찾지 않는다 —
// context.studentNoTaken이라는 이미 계산된 boolean만 받는다. "중복 여부
// 계산"은 향후 data access/orchestration 책임이고, "중복 판정"만 이 함수의
// 책임이다. 이 결정을 담을 정보가 boolean 하나뿐이므로 별도 context 타입을
// 만들지 않고 inline object type을 쓴다.
//
// 판정 우선순위(먼저 만족하는 조건이 결과를 결정한다. 한 번에 여러 오류를
// 반환하지 않는다):
//   1. input.studentNo === '' → missing-student-no
//   2. input.name === '' → missing-name
//   3. context.studentNoTaken === true → duplicate-student-no
//   4. 위 전부 통과 → valid
//
// name 중복(동명이인)은 검사하지 않는다 — 동명이인은 정상 상황이고, 애초에
// 이 함수의 context에는 이름 목록 자체가 없다. studentNo는 string 그대로
// 비교한다: Number 변환, leading zero 제거/padding, 형식 추측을 하지 않는다.

export function validateRosterEntry(
  input: RosterEntryInput,
  context: { studentNoTaken: boolean }
): RosterEntryValidation {
  if (input.studentNo === '') {
    return { status: 'missing-student-no' };
  }

  if (input.name === '') {
    return { status: 'missing-name' };
  }

  if (context.studentNoTaken === true) {
    return { status: 'duplicate-student-no', studentNo: input.studentNo };
  }

  return { status: 'valid', entry: input };
}
