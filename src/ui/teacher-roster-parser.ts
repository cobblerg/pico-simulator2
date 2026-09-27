// 교사 UI — 붙여넣기 로스터 파싱 + 서버 validation 사유 → 교사용 문구 매핑
// (Stage D11-C4)
//
// document/DOM을 전혀 참조하지 않는 순수 함수 모듈이다 — teacher-app.ts(모듈
// 최상단에서 즉시 document.getElementById를 호출하는 el() 헬퍼 때문에
// Vitest 기본 node 환경에서 import 자체가 실패하는 파일, tests/ui/
// teacher-regression.test.ts 주석 참고)와 분리해 이 파일만 직접 import해
// 테스트한다. 새 jsdom 의존성을 추가하지 않고도 순수 로직을 테스트하기
// 위한 D11-C4 §18 결정 그대로.
//
// raw pasted text("1 김민준\n2 이서연" 같은 presentation-format 문자열)를
// structured entries로 바꾸는 책임은 여기(C4 UI)에 있다 — 서버
// (teacher-roster-creation.ts)는 이 문자열 형식을 전혀 모른다(D11-C3 §2/§9
// 확정 결정).
//
// 정규화(trim/NFC)는 서버(normalizeRosterEntry)가 다시 수행하므로 이
// 파서가 그 책임을 대신하거나 결과를 대체하지 않는다 — 여기서는 오직
// "한 줄을 studentNo/name 두 필드로 나누는" 구조적 파싱만 한다.
export type ParsedRosterRow = { studentNo: string; name: string };

// 규칙(D11-C4 §9 그대로):
//   1. newline으로 row 분리
//   2. 빈 줄(trim 후 빈 문자열) 무시
//   3. 각 row trim
//   4. 첫 번째 whitespace/tab 묶음을 studentNo/name 경계로 사용
//   5. 첫 token → studentNo
//   6. 나머지 전체 → name(내부 공백 유지)
//   7. 구분자가 없는 row(공백/탭이 전혀 없음)는 studentNo만 있고 name은
//      빈 문자열로 남긴다 — 파서가 조용히 걸러내지 않는다. 서버/도메인
//      validation(missing-name)이 이를 거부할 수 있도록 그대로 보존한다.
export function parseRosterPasteText(raw: string): ParsedRosterRow[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const match = line.match(/^(\S+)[ \t]+(.*)$/);
      if (match) {
        return { studentNo: match[1], name: match[2] };
      }
      return { studentNo: line, name: '' };
    });
}

// teacher-roster-creation.ts(registerRosterEntries)가 반환하는
// RegisterRosterValidationError.reason과 정확히 같은 문자열 집합이다(새
// enum을 만들지 않는다) — 서버 응답의 details[].reason을 그대로 매개변수로
// 받는다.
export type RosterValidationReason = 'missing-student-no' | 'missing-name' | 'duplicate-student-no';

// 내부 enum/reason 문자열을 교사에게 그대로 보여주지 않는다(D11-C4 §12
// 요구사항) — 이 함수가 유일한 변환 지점이다.
export function rosterValidationReasonToMessage(reason: RosterValidationReason): string {
  switch (reason) {
    case 'missing-student-no':
      return '학번이 없습니다.';
    case 'missing-name':
      return '이름이 없습니다.';
    case 'duplicate-student-no':
      return '같은 학번이 이미 존재합니다.';
  }
}
