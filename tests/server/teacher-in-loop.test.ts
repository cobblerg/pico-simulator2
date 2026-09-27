// D11-B Regression Test Gate — Teacher-in-the-Loop guard
//
// Goal: catch a regression where AI analysis starts automatically saving/
// sending teacher_feedback (it must not — a teacher must always review,
// optionally edit, and explicitly click [피드백 저장]). This is a static
// source check, not a line-number comparison — it looks for the actual
// import statements and the specific save-path function names, so it
// survives reformatting/reordering of the file.
import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Teacher-in-the-loop guard', () => {
  test('T14: ai-analysis-handler.ts never imports the teacher_feedback save path', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../src/server/ai-analysis-handler.ts'), 'utf8');

    expect(src).not.toMatch(/from ['"]\.\/teacher-feedback-data['"]/);
    expect(src).not.toMatch(/from ['"]\.\/teacher-feedback-handler['"]/);
    expect(src).not.toMatch(/from ['"]\.\/teacher-feedback-update-handler['"]/);
    expect(src).not.toContain('insertFeedback');
    expect(src).not.toContain('updateOwnFeedback');
  });
});
