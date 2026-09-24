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
