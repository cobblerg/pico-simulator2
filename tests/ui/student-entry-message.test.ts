// D11-C5 — Exceptional Student Recovery Flow: student-facing rejection message
//
// src/ui/student-entry-ui.ts는 teacher-app.ts와 달리 모듈 최상단에서
// document.getElementById를 호출하지 않는다(DOM 접근은 전부
// initStudentEntryGate() 함수 안에서만 일어난다) — 그래서 이 상수만은 직접
// import해 pure string 수준으로 검증할 수 있다. 새 DOM test 환경(jsdom 등)은
// 추가하지 않는다.
//
// 목적: (1) 학생에게 보이는 거절 안내가 여전히 단 하나의 문구인지,
// (2) 그 문구 안에 name-mismatch/enrollment-not-found/class-not-found/
// data-integrity-error 같은 내부 reason이나 그것을 유추하게 하는 구체적
// 실패 사유("등록되지 않은 학생입니다" 등)가 섞여 들어가지 않았는지를
// 고정한다(D11-C0/C1의 enumeration resistance를 UI 레벨에서도 보호).
import { describe, test, expect } from 'vitest';
import { STUDENT_ENTRY_REJECTED_MESSAGE } from '../../src/ui/student-entry-ui';

const INTERNAL_REASON_STRINGS = ['name-mismatch', 'enrollment-not-found', 'class-not-found', 'data-integrity-error'];

// 실패 사유를 추측해 보여주는 문구(D11-C5 §4가 명시적으로 금지)의 예시들 —
// 이런 표현이 하나라도 섞여 있으면 안 된다.
const GUESSED_FAILURE_PHRASES = ['등록되지 않은 학생', '이름이 틀렸', '존재하지 않는 학급', '학번이 없습니다', '학번이 틀렸'];

describe('STUDENT_ENTRY_REJECTED_MESSAGE (D11-C5 regression)', () => {
  test('is a single non-empty generic message', () => {
    expect(typeof STUDENT_ENTRY_REJECTED_MESSAGE).toBe('string');
    expect(STUDENT_ENTRY_REJECTED_MESSAGE.length).toBeGreaterThan(0);
  });

  test('never contains raw internal domain/server reason strings', () => {
    for (const reason of INTERNAL_REASON_STRINGS) {
      expect(STUDENT_ENTRY_REJECTED_MESSAGE).not.toContain(reason);
    }
  });

  test('never guesses or names a specific failure cause', () => {
    for (const phrase of GUESSED_FAILURE_PHRASES) {
      expect(STUDENT_ENTRY_REJECTED_MESSAGE).not.toContain(phrase);
    }
  });

  test('includes teacher-recovery guidance without naming any identity value', () => {
    expect(STUDENT_ENTRY_REJECTED_MESSAGE).toContain('선생님');
    // 실제 학급 코드/학번/이름 값이 아니라, 그 항목들의 "이름"만 안내에 등장해야 한다.
    expect(STUDENT_ENTRY_REJECTED_MESSAGE).toMatch(/학급 코드/);
    expect(STUDENT_ENTRY_REJECTED_MESSAGE).toMatch(/학번/);
  });
});
