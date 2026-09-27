// D11-B Regression Test Gate — Stabilization 1 (Teacher UI order + evidence
// language)
//
// src/ui/teacher-app.ts calls document.getElementById at module top level
// (the el() helper) the moment it is imported — Vitest's default "node"
// environment has no `document`, so importing this file directly throws
// immediately. jsdom/happy-dom are out of scope for this Phase 1 (approved
// Audit decision: DOM environment = NONE). describeEvent/EVENT_LABELS/
// COACH_REFLECTION_CHOICE_LABELS were exported anyway (see the comment
// above their declarations in teacher-app.ts) as minimal groundwork for a
// future DOM-environment phase, but this suite does not import them —
// instead it reads the production source files as plain text and asserts
// on their literal content. This is intentionally weaker than a real unit
// test (it can't catch a change that produces the same string through
// different logic), but it directly protects the exact two regressions
// this Stabilization pass fixed.
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const teacherHtml = fs.readFileSync(path.join(__dirname, '../../src/teacher.html'), 'utf8');
const teacherAppSrc = fs.readFileSync(path.join(__dirname, '../../src/ui/teacher-app.ts'), 'utf8');

describe('Stabilization 1 — Teacher section order (source-level)', () => {
  test('T12: Timeline < AI analysis < Teacher feedback < Post-feedback observation', () => {
    const ids = ['t-timeline-list', 't-ai-section', 't-feedback-section', 't-pfo-section'];
    const positions = ids.map((id) => teacherHtml.indexOf(`id="${id}"`));

    positions.forEach((pos, i) => {
      expect(pos, `id="${ids[i]}" must exist in src/teacher.html`).toBeGreaterThanOrEqual(0);
    });
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i], `${ids[i]} must come after ${ids[i - 1]}`).toBeGreaterThan(positions[i - 1]);
    }
  });
});

describe('Stabilization 1 — Evidence language (source-level)', () => {
  test('T13: coach-reflection resolved is labeled as self-report, never as a verified fact', () => {
    expect(teacherAppSrc).toContain(`resolved: '해결됐다고 응답'`);
    expect(teacherAppSrc).not.toContain(`resolved: '해결됨'`);
  });

  test('T13b: feedback-retry label communicates a selection, not a completed retry/execution', () => {
    expect(teacherAppSrc).toContain(`'feedback-retry': '교사 피드백 후 다시 시도 선택'`);
    expect(teacherAppSrc).not.toMatch(/'feedback-retry':\s*'[^']*(재시도 완료|다시 시도 완료|재실행 완료|실행 완료)/);
  });
});
