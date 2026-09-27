// D11-C4 — Teacher Class & Roster UI: bulk paste parser + error mapping
//
// src/ui/teacher-roster-parser.ts는 DOM을 전혀 참조하지 않는 순수 함수
// 모듈이라 teacher-app.ts와 달리 직접 import해 테스트할 수 있다(파일
// 헤더 참고). jsdom 등 새 DOM test environment는 도입하지 않는다.
import { describe, test, expect } from 'vitest';
import { parseRosterPasteText, rosterValidationReasonToMessage } from '../../src/ui/teacher-roster-parser';

describe('parseRosterPasteText', () => {
  test('single row (whitespace form)', () => {
    expect(parseRosterPasteText('1 김민준')).toEqual([{ studentNo: '1', name: '김민준' }]);
  });

  test('multiple rows', () => {
    expect(parseRosterPasteText('1 김민준\n2 이서연\n3 박지호')).toEqual([
      { studentNo: '1', name: '김민준' },
      { studentNo: '2', name: '이서연' },
      { studentNo: '3', name: '박지호' },
    ]);
  });

  test('tab separated (spreadsheet paste)', () => {
    expect(parseRosterPasteText('1\t김민준\n2\t이서연')).toEqual([
      { studentNo: '1', name: '김민준' },
      { studentNo: '2', name: '이서연' },
    ]);
  });

  test('multiple whitespace between studentNo and name collapses to one boundary', () => {
    expect(parseRosterPasteText('1    김민준')).toEqual([{ studentNo: '1', name: '김민준' }]);
  });

  test('blank lines are ignored', () => {
    expect(parseRosterPasteText('1 김민준\n\n\n2 이서연\n   \n3 박지호')).toEqual([
      { studentNo: '1', name: '김민준' },
      { studentNo: '2', name: '이서연' },
      { studentNo: '3', name: '박지호' },
    ]);
  });

  test('name containing internal spaces is preserved as-is', () => {
    expect(parseRosterPasteText('1 김 민 준')).toEqual([{ studentNo: '1', name: '김 민 준' }]);
  });

  test('row with no separator at all -> studentNo captured, name left empty (not silently dropped)', () => {
    expect(parseRosterPasteText('1김민준')).toEqual([{ studentNo: '1김민준', name: '' }]);
  });

  test('leading/trailing whitespace on a row is trimmed before parsing', () => {
    expect(parseRosterPasteText('   1 김민준   ')).toEqual([{ studentNo: '1', name: '김민준' }]);
  });

  test('empty input -> empty array', () => {
    expect(parseRosterPasteText('')).toEqual([]);
    expect(parseRosterPasteText('   \n  \n')).toEqual([]);
  });
});

describe('rosterValidationReasonToMessage', () => {
  test('maps every server reason to a teacher-facing Korean message (no raw enum leaks through)', () => {
    expect(rosterValidationReasonToMessage('missing-student-no')).toBe('학번이 없습니다.');
    expect(rosterValidationReasonToMessage('missing-name')).toBe('이름이 없습니다.');
    expect(rosterValidationReasonToMessage('duplicate-student-no')).toBe('같은 학번이 이미 존재합니다.');
  });
});
