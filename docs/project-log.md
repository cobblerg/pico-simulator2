# PicoSim2 Project Log

## 2026-09-26 — D11-B1 Student AI Coaching Foundation

### Status
CLOSED

### Commit
- commit: bbee6e8723b6cf2d9d442a4dff89984f81bd700f
- short hash: bbee6e8
- message: feat: add D11-B1 student AI coaching foundation

### Deployment
- Production URL: https://pico-simulator2.vercel.app
- Vercel deployment: success
- GitHub push: success
- origin/main: 3d74823 → bbee6e8

### Completed Scope
- Added minimal mission-scoped CoachingSession.
- Added AI 학습 코치 button to the student simulator UI.
- Added static AI Coach panel.
- Connected AI Coach open action to getOrCreateCoachingSession(mission.id).
- CoachingSession is in-memory only.
- CoachingSession is created only when the student opens the AI Coach panel.
- Same mission reuses the same in-memory session.
- Different missions use separate in-memory sessions.

### Explicit Non-Changes
- No OpenAI API call.
- No Supabase schema change.
- No migration.
- No learning_event change.
- No student_session change.
- No Run / Real Run logic change.
- No server API change.
- No student identity stored in CoachingSession.

### Verification Completed
- Static code review completed.
- Student build artifacts generated successfully.
- Vercel Production deployment completed successfully.
- Production HTML contains AI Coach-related strings.
- HTTP 200 OK confirmed for Production page.

### Manual Production Verification
Result: PASS

Checked:
- Student entry succeeded.
- AI 학습 코치 button was visible in the simulator screen.
- Coach panel opened and closed correctly.
- Mission switching worked.
- Run / Stop / Reset worked normally.
- No new browser Console errors were observed.

### Notes
Local `npm start` serves static files only, so `/api/student-entry` returns 404 locally. This is not related to D11-B1. Full student-entry verification requires Vercel Production or a Vercel dev environment with the required server-side environment variables.

## 2026-09-26 — D11-B2 Readiness & Start Scaffolding

### Status
CLOSED

### Commit
- commit: e5b2e352887a1d52ba546ed2268b723c56e443f7
- short hash: e5b2e35
- message: feat: add D11-B2 readiness scaffolding

### Deployment
- Production URL: https://pico-simulator2.vercel.app
- Vercel deployment: success
- GitHub push: success
- origin/main: 829c7f2 → e5b2e35

### Completed Scope
- Added StuckReason type for AI Coach readiness/start scaffolding.
- Added mission-scoped CoachingSession.stuckReason.
- Added setStuckReason(missionId, reason).
- Added static coaching scaffold content for four stuck reasons.
- Added "지금 어디에서 막혔나요?" question UI to the AI Coach panel.
- Added four stuck reason selection buttons.
- Added scaffoldMessage display for each selected reason.
- Added actionLabel button for each selected reason.
- Added "다른 이유 고르기" flow.
- Saved the selected stuckReason into the current mission's in-memory CoachingSession.
- Kept the AI Coach flow as static scaffolding only, without AI-generated answers.

### Stuck Reasons
- goal-unclear: 무엇을 해야 하는지 잘 모르겠어요
- first-step-unclear: 할 일은 알겠는데 어떻게 시작할지 모르겠어요
- tried-not-working: 직접 해봤는데 잘 안 돼요
- result-unclear: 결과는 나왔는데 왜 그런지 잘 모르겠어요

### Explicit Non-Changes
- No OpenAI API call.
- No AI-generated feedback or hint.
- No Supabase schema change.
- No migration.
- No learning_event change.
- No logEvent call for AI Coach selection.
- No student_session change.
- No server API change.
- No Run / Real Run logic change.
- No CodeMirror code reading.
- No student identity stored in CoachingSession.

### Verification Completed
- Static code review completed.
- Type-check completed for app.ts, coaching-session.ts, and coaching-scaffold.ts.
- Student build artifacts generated successfully.
- Vercel Production deployment completed successfully.
- Production HTML contains D11-B2-related strings.
- HTTP 200 OK confirmed for Production page.
- Manual Production UI verification completed by the user.

### Manual Production Verification
Result: PASS

Checked:
- Student entry succeeded.
- AI 학습 코치 button was visible.
- "지금 어디에서 막혔나요?" question was displayed.
- Four stuck reason choices were displayed.
- Each choice displayed the correct scaffold message.
- actionLabel buttons worked correctly.
- "다른 이유 고르기" returned to the question screen.
- Mission switching worked.
- Run / Stop / Reset worked normally.
- No new browser Console errors were observed.
- Responsive layout showed no blocking issue.

### Notes
D11-B2 intentionally remains client-side and in-memory only. The selected stuckReason is saved only in the mission-scoped CoachingSession and is not written to Supabase or learning_event. Teacher Timeline integration is deferred to a later stage.

## 2026-09-26 — D11-B3 Observation & Hypothesis Scaffolding

### Status
CLOSED

### Commit
- commit: 9ecc89fff06ca1db8b7cf0c39838806d8e88da68
- short hash: 9ecc89f
- message: feat: add D11-B3 observation scaffolding

### Deployment
- Production URL: https://pico-simulator2.vercel.app
- Vercel deployment: success
- GitHub push: success
- origin/main: a35a86b → 9ecc89f

### Completed Scope
- Added ObservationChoice type.
- Added HypothesisFocus type.
- Added mission-scoped CoachingSession.observation.
- Added mission-scoped CoachingSession.hypothesisFocus.
- Added setObservation(missionId, observation).
- Added setHypothesisFocus(missionId, focus).
- Added static observation scaffold content.
- Added static hypothesis focus scaffold content.
- Added observation screen to the AI Coach panel.
- Added hypothesis focus screen to the AI Coach panel.
- Connected tried-not-working and result-unclear flows to observation → hypothesis focus scaffolding.
- Kept goal-unclear and first-step-unclear flows as the existing D11-B2 start scaffolding flow.
- Saved selected observation and hypothesisFocus into the current mission's in-memory CoachingSession.
- Kept the AI Coach flow static and client-side only, without AI-generated answers or code analysis.

### Observation Choices
- no-change: 아무 변화도 일어나지 않았어요
- error-message: 오류 메시지가 떴어요
- unexpected-behavior: 무언가 달라지긴 했는데, 원하던 모습은 아니었어요
- not-sure: 아직 잘 모르겠어요

### Hypothesis Focus Choices
- code: 코드
- wiring: 핀 연결
- device-behavior: 장치 동작
- not-sure: 아직 모르겠어요

### Explicit Non-Changes
- No OpenAI API call.
- No AI-generated feedback or hint.
- No student code analysis.
- No editor.get() call.
- No Supabase schema change.
- No migration.
- No learning_event change.
- No logEvent call for AI Coach observation/hypothesis selection.
- No student_session change.
- No server API change.
- No Run / Real Run logic change.
- No checkpoint evaluator change.
- No free-text input storage.
- No student identity stored in CoachingSession.

### Verification Completed
- Static code review completed.
- Type-check completed for app.ts, coaching-session.ts, coaching-observation.ts, and coaching-scaffold.ts.
- Student build artifacts generated successfully.
- Vercel Production deployment completed successfully.
- Production HTML contains D11-B3-related strings.
- HTTP 200 OK confirmed for Production page.
- Manual Production UI verification was performed by the user.

### Manual Production Verification
Result: PASS for D11-B3 AI Coach flow

Checked:
- AI 학습 코치 button was visible.
- "지금 어디에서 막혔나요?" question was displayed.
- goal-unclear and first-step-unclear kept the existing D11-B2 scaffold flow.
- tried-not-working continued to the observation screen.
- result-unclear continued to the observation screen.
- Observation choices were displayed.
- Observation choice selection displayed the expected guidance and action button.
- Observation action continued to the hypothesis focus screen.
- Hypothesis focus choices were displayed.
- Hypothesis focus selection displayed the expected guidance and action button.
- Hypothesis action returned to the question screen.
- "다른 이유 고르기" returned to the question screen.
- The AI Coach flow remained static and did not provide answers or code fixes.

### Known Separate Issue Found During Manual Verification
During Production manual verification, an existing checkpoint/result-message issue was observed in some missions.

Observed:
- Mission 3: 버튼으로 LED 켜기
- Mission 4: 가변저항 값 읽기
- Mission 6: 서보 각도 바꾸기

Investigation summary:
- Mission 3 and Mission 4 do not have checkAtEnd() fallback branches.
- These missions are while True style missions where students usually end execution with Stop.
- When stopped, checkAtEnd(true) does not guarantee a final pass/fail message for m3/m4.
- Mission 6 has a checkAtEnd branch in static analysis, so its reported behavior needs separate runtime reproduction.
- This issue was not introduced by D11-B3.
- D11-B3 did not modify checkAtEnd, checkLive, showCheck, checkpoint evaluator, Run, Stop, Reset, or Real Run logic.

Disposition:
- This is tracked as a separate existing mission checkpoint/result-message bug.
- It does not block closing D11-B3 because the D11-B3 AI Coach flow is independent of checkpoint result display.
- A follow-up bugfix should add or verify final result-message handling for m3/m4 and investigate m6 runtime behavior.

### Notes
D11-B3 intentionally remains client-side and in-memory only. The selected observation and hypothesisFocus are saved only in the mission-scoped CoachingSession and are not written to Supabase or learning_event. Teacher Timeline integration and persistent learning records are deferred to later stages.
