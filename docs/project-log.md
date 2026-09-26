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

## 2026-09-26 — BUG-ResultMessage-01-A Mission 3/4 Final Result Message Fallback

### Status
CLOSED

### Commit
- commit: b64e4c9243b0c5c9383395185d0ef0239ec916dd
- short hash: b64e4c9
- message: fix: add final result fallback for m3 and m4

### Deployment
- Production URL: https://pico-simulator2.vercel.app
- Vercel deployment: success
- GitHub push: success
- origin/main: 8047c43 → b64e4c9

### Problem
During D11-B3 manual Production verification, some mission result messages were not reliably shown after stopping execution.

Affected missions reported:
- Mission 3: 버튼으로 LED 켜기
- Mission 4: 가변저항 값 읽기
- Mission 6: 서보 각도 바꾸기

### Root Cause
- Mission 3 and Mission 4 used live checkpoints but did not have checkAtEnd() fallback branches.
- These missions are while True style missions, so students usually end execution by pressing Stop.
- When Stop ends execution, checkAtEnd(true) is called.
- Before this fix, checkAtEnd() did not re-check m3/m4, so a final pass/fail result message was not guaranteed.
- Mission 6 already had a checkAtEnd() branch; static analysis did not identify the same structural issue for m6.

### Completed Scope
- Added checkAtEnd() fallback handling for Mission 3.
- Added checkAtEnd() fallback handling for Mission 4.
- Reused the existing checkLive() + showCheck fallback pattern used by existing missions.
- Updated the checkLive() guard so m3/m4 can be re-evaluated after execution has stopped.
- Kept Mission 6 logic unchanged.
- Kept checkpoint evaluator logic unchanged.
- Kept mission data unchanged.

### Added Failure Messages
Mission 3:
- 버튼을 누르고 있는 동안 LED가 켜지고, 떼면 꺼지는지 확인해 보세요.

Mission 4:
- 콘솔에 가변저항 값이 바뀌어 출력되는지 확인해 보세요.

### Explicit Non-Changes
- No AI Coach change.
- No src/index.html change.
- No src/ui/styles.css change.
- No checkpoint evaluator change.
- No mission data change.
- No m6-specific logic change.
- No OpenAI API call.
- No Supabase change.
- No learning_event structure change.
- No student_session change.
- No server API change.
- No editor.get() change.

### Verification Completed
- app.ts strict type-check completed.
- checkpoint evaluator type-check completed.
- Student build artifacts generated successfully.
- Vercel Production deployment completed successfully.
- Production HTML/JS bundle contains the new m3/m4 failure messages.
- HTTP 200 OK confirmed for Production page.
- Manual Production verification completed by the user.

### Manual Production Verification
Result: PASS

Checked:
- Mission 3 result guidance now appears correctly after Stop.
- Mission 4 result guidance now appears correctly after Stop.
- Mission 6 existing result guidance still appears correctly.
- Run / Stop / Reset worked normally.
- No new browser Console errors were reported.
- AI Coach flow remained normal.

### Notes
This bug was discovered during D11-B3 manual verification but was not caused by D11-B3. It was an existing mission result-message fallback issue in the checkpoint display flow.

## 2026-09-26 — D11-B4 Adaptive Hint Ladder

### Status
CLOSED

### Commit
- commit: 6521f10bc8848aaf0871ee9be7dd4a8046057583
- short hash: 6521f10
- message: feat: add adaptive hint ladder

### Deployment
- Production URL: https://pico-simulator2.vercel.app
- Vercel deployment: success
- GitHub push: success
- origin/main: 8f3cbcc → 6521f10

### Completed Scope
- Added mission-scoped CoachingSession.hintLevel.
- Added advanceHintLevel(missionId).
- Added static adaptive hint ladder content.
- Added src/ui/coaching-hint.ts.
- Added HintLevel type.
- Added CoachingHint type.
- Added MAX_COACHING_HINT_LEVEL.
- Added COACHING_HINTS for four hypothesisFocus values.
- Added getCoachingHint(focus, hintLevel).
- Added "더 힌트가 필요해요" button to the AI Coach hypothesis screen.
- Connected hint display to the existing hypothesisFocus screen.
- Reused the existing ai-coach-hypothesis-message area for hint display.
- Reused the existing hypothesis action button for hint action labels.
- Connected hint progression to mission-scoped CoachingSession.hintLevel.
- Capped hint progression at level 3.
- Hid the "더 힌트가 필요해요" button after level 3.
- Preserved the existing B3 guidance before the first hint request.

### Hint Ladder Design
D11-B4 uses hypothesisFocus as the adaptive signal.

Supported focus values:
- code
- wiring
- device-behavior
- not-sure

Hint levels:
- level 1: 다시 볼 대상 안내
- level 2: 비교 기준 좁히기
- level 3: 다음 실험 행동 제안

The hint ladder is intentionally static and does not use AI-generated responses.

### Explicit Non-Changes
- No OpenAI API call.
- No AI-generated hint.
- No student code analysis.
- No editor.get() call.
- No Supabase schema change.
- No migration.
- No learning_event change.
- No logEvent call for hint usage.
- No student_session change.
- No server API change.
- No Run / Real Run logic change.
- No checkpoint evaluator change.
- No mission data change.
- No free-text student input.
- No retry/attempt state.
- No automatic Run action.
- No student identity stored in CoachingSession.

### Verification Completed
- Static code review completed.
- Type-check completed for app.ts.
- Type-check completed for coaching-session.ts.
- Type-check completed for coaching-hint.ts.
- Type-check completed for coaching-scaffold.ts.
- Type-check completed for coaching-observation.ts.
- Student build artifacts generated successfully.
- Vercel Production deployment completed successfully.
- Production HTML/JS bundle contains D11-B4-related strings.
- HTTP 200 OK confirmed for Production page.
- Manual Production UI verification completed by the user.

### Manual Production Verification
Result: PASS

Checked:
- AI 학습 코치 button worked.
- tried-not-working / result-unclear paths reached the observation screen.
- Observation selection reached the hypothesis focus screen.
- Hypothesis focus selection displayed the existing B3 guidance first.
- "더 힌트가 필요해요" button appeared.
- First hint request displayed level 1 hint.
- Second hint request displayed level 2 hint.
- Third hint request displayed level 3 hint.
- "더 힌트가 필요해요" button disappeared at level 3.
- Hint action button returned to the question screen.
- Mission-level hint state behaved correctly.
- Run / Stop / Reset remained normal.
- No new blocking issue was reported.

### Known Separate Issue Found During Manual Verification
During Production manual verification, the user observed that previous local work remained visible after opening https://pico-simulator2.vercel.app and reaching the student entry modal.

Observed:
- The student entry modal was displayed.
- The simulator behind the modal still showed a previously edited mission/code state.

Initial interpretation:
- This appears to be existing browser-local simulator state persistence.
- It is likely related to local saved project state, browser storage, or prior session UI state.
- It was not introduced by D11-B4.
- D11-B4 did not modify student entry, local project persistence, saved project loading, or simulator reset behavior.

Disposition:
- This does not block D11-B4 closure.
- Track separately as a future issue if needed.

Suggested future issue:
- StudentEntry-LocalState-01: Decide whether student entry should reset or isolate previous browser-local simulator state.

### Notes
D11-B4 intentionally remains client-side and in-memory only. The hint ladder uses static guidance based on hypothesisFocus and hintLevel. It does not analyze student code, infer student ability, generate AI responses, or record hint usage to learning_event. Retry / Action Gate behavior is deferred to D11-B5.

## 2026-09-26 — D11-B5 Action / Retry Gate

### Status
CLOSED

### Commit
- commit: a353fd10cecdb53a738cb8f9ed91f74a98c8e3cd
- short hash: a353fd1
- message: feat: add retry gate after level 3 hint

### Deployment
- Production URL: https://pico-simulator2.vercel.app
- Vercel deployment: success
- GitHub push: success
- origin/main: 71f5edc → a353fd1

### Completed Scope
- Added static retry gate copy module.
- Added src/ui/coaching-retry.ts.
- Added CoachingRetryGate type.
- Added LEVEL_3_RETRY_GATE.
- Added getLevel3RetryGate().
- Connected retry gate UI after level 3 hint action.
- Reused the existing hypothesis message area for retry gate guidance.
- Reused the existing hypothesis action button as the primary retry gate button.
- Reused the existing hypothesis back button as the secondary retry gate button.
- Changed the level 3 hint action flow so that "실험해볼게요" shows the retry gate instead of immediately returning to the question screen.
- Kept level 0, level 1, and level 2 action flows returning directly to the question screen.
- Kept retry gate primary and secondary buttons returning to the question screen.
- Restored the hypothesis back button label to "다른 이유 고르기" when re-entering the hypothesis screen.
- Kept the retry gate as a soft, skippable interstitial rather than a blocking gate.

### Retry Gate Copy
Guidance:
- 지금까지 확인한 것을 바탕으로 다시 한 번 실행해 볼까요? 실행해봤다면 아래 버튼을 눌러 주세요.

Primary action:
- 실행해봤어요

Secondary action:
- 돌아갈게요

### Design Decision
D11-B5 intentionally uses a soft self-report gate rather than a mandatory Run-detection gate.

Reason:
- Action and Retry are related but not identical.
- Some useful student actions, such as checking wiring or comparing device behavior, may not require pressing Run immediately.
- Run detection does not fully represent all meaningful student actions.
- A hard gate could unnecessarily block beginner students.
- The retry gate should encourage action, not enforce it.

### Explicit Non-Changes
- No OpenAI API call.
- No AI-generated guidance.
- No student code analysis.
- No editor.get() call.
- No Supabase schema change.
- No migration.
- No learning_event change.
- No new logEvent call.
- No student_session change.
- No server API change.
- No Run / Real Run logic change.
- No Stop / Reset logic change.
- No checkpoint evaluator change.
- No mission data change.
- No free-text student input.
- No picosim:event listener.
- No retryDetected field.
- No retryCount field.
- No attemptCount field.
- No CoachingSession field added for D11-B5.
- No automatic Run action.
- No student identity stored in CoachingSession.
- StudentEntry-LocalState-01 remains a separate issue.

### Verification Completed
- Static code review completed.
- Type-check completed for app.ts.
- Type-check completed for coaching-retry.ts.
- Type-check completed for AI Coach related files.
- Student build artifacts generated successfully.
- Vercel Production deployment completed successfully.
- Production HTML/JS bundle contains D11-B5-related strings.
- HTTP 200 OK confirmed for Production page.
- Manual Production UI verification completed by the user.

### Manual Production Verification
Result: PASS

Checked:
- AI 학습 코치 button worked.
- tried-not-working / result-unclear paths reached the observation screen.
- Observation selection reached the hypothesis focus screen.
- Hypothesis focus selection displayed the existing B3 guidance first.
- "더 힌트가 필요해요" button appeared.
- Level 1 hint flow worked.
- Level 2 hint flow worked.
- Level 3 hint flow worked.
- Level 3 action "실험해볼게요" displayed the retry gate.
- Retry gate guidance was displayed.
- Retry gate primary action "실행해봤어요" was displayed.
- Retry gate secondary action "돌아갈게요" was displayed.
- "실행해봤어요" returned to the question screen.
- "돌아갈게요" returned to the question screen.
- Re-entering the hypothesis screen restored the back button label to "다른 이유 고르기".
- Run / Stop / Reset remained normal.
- No new blocking issue was reported.

### Known Behavior
The mission-scoped hintLevel introduced in D11-B4 persists within the in-memory CoachingSession for the current mission.

Implication:
- If a student already reached hintLevel 2 in the same mission, the next "더 힌트가 필요해요" click can advance to hintLevel 3.
- In that case, the level 3 action can lead to the retry gate sooner than a fresh mission session.
- This is expected behavior based on the B4 mission-scoped hintLevel design.
- It is not treated as a blocker for D11-B5.

### Notes
D11-B5 intentionally does not detect Run or Real Run completion. The retry gate is a soft interstitial that encourages the student to act or retry, while still allowing them to return to the question screen. Passive picosim:event-based Run detection remains a possible future enhancement but was not included in this stage.

## 2026-09-26 — D11-B6 Post-Retry Reflection Flow

### Status
CLOSED

### Commit
- commit: c355b4a3df8b4f2e7a4ecbdf6b60551ffcd6aeb6
- short hash: c355b4a
- message: feat: add post-retry reflection flow

### Deployment
- Production URL: https://pico-simulator2.vercel.app
- Vercel deployment: success
- GitHub push: success
- origin/main: 26889c2 → c355b4a

### Completed Scope
- Added static post-retry reflection copy module.
- Added src/ui/coaching-reflection.ts.
- Added CoachingReflectionPrompt type.
- Added POST_RETRY_REFLECTION_PROMPT.
- Added getPostRetryReflectionPrompt().
- Connected post-retry reflection UI after retry gate primary action.
- Changed retry gate primary flow so that "실행해봤어요" shows the reflection prompt instead of immediately returning to the question screen.
- Reused the existing hypothesis message area for the reflection guidance.
- Reused the existing hypothesis action button as the re-observation action.
- Reused the existing hypothesis back button as the resolved self-report action.
- Connected "다시 관찰해볼게요" to the existing observation screen.
- Connected "이제 괜찮아요" to the existing question screen.
- Kept the existing B3 observation choices unchanged.
- Kept retry gate secondary "돌아갈게요" returning to the question screen.
- Kept the flow as a soft, optional reflection step rather than a blocking gate.

### Reflection Copy
Guidance:
- 다시 확인해 본 결과, 무엇이 달라졌나요?

Re-observation action:
- 다시 관찰해볼게요

Resolved self-report action:
- 이제 괜찮아요

Resolved message:
- 좋아요. 필요하면 다시 AI 학습 코치를 열어 확인할 수 있어요.

### Design Decision
D11-B6 intentionally uses a short two-button reflection step after the retry gate primary action.

Reason:
- The retry gate asks whether the student has acted or retried.
- The reflection step asks what the student wants to do after checking again.
- Some students may still need to observe the result again.
- Some students may feel ready to continue without another observation cycle.
- Sending every student directly back to the observation screen could imply that the problem is still unresolved.
- A two-button reflection step gives students a natural choice without forcing another loop.

### Resolved Self-Report Boundary
- "이제 괜찮아요" is treated only as the student's self-report.
- It is not treated as checkpoint pass.
- It is not treated as mission success.
- It does not change the #check result.
- It does not auto-run code.
- It does not close the panel automatically.
- It does not write to learning_event.
- It does not add any evaluation record.
- It does not add a CoachingSession field.

### Explicit Non-Changes
- No OpenAI API call.
- No AI-generated guidance.
- No student code analysis.
- No editor.get() call.
- No Supabase schema change.
- No migration.
- No learning_event change.
- No new logEvent call.
- No student_session change.
- No server API change.
- No Run / Real Run logic change.
- No Stop / Reset logic change.
- No checkpoint evaluator change.
- No mission data change.
- No free-text student input.
- No picosim:event listener.
- No Run detection.
- No retryDetected field.
- No retryCount field.
- No attemptCount field.
- No resolvedSelfReport field.
- No reflectionState field.
- No reObservationCount field.
- No CoachingSession field added for D11-B6.
- No automatic Run action.
- No student identity stored in CoachingSession.
- StudentEntry-LocalState-01 remains a separate issue.

### Verification Completed
- Static code review completed.
- Type-check completed for app.ts.
- Type-check completed for coaching-reflection.ts.
- Type-check completed for AI Coach related files.
- Student build artifacts generated successfully.
- Vercel Production deployment completed successfully.
- Production HTML/JS bundle contains D11-B6-related strings.
- HTTP 200 OK confirmed for Production page.
- Manual Production UI verification completed by the user.

### Manual Production Verification
Result: PASS

Checked:
- AI 학습 코치 button worked.
- tried-not-working / result-unclear paths reached the observation screen.
- Observation selection reached the hypothesis focus screen.
- Hypothesis focus selection displayed the existing B3 guidance first.
- "더 힌트가 필요해요" button appeared.
- Level 1 hint flow worked.
- Level 2 hint flow worked.
- Level 3 hint flow worked.
- Level 3 action "실험해볼게요" displayed the retry gate.
- Retry gate primary action "실행해봤어요" displayed the reflection prompt.
- Reflection guidance "다시 확인해 본 결과, 무엇이 달라졌나요?" was displayed.
- Reflection primary action "다시 관찰해볼게요" was displayed.
- Reflection secondary action "이제 괜찮아요" was displayed.
- "다시 관찰해볼게요" moved to the existing observation screen.
- The existing four observation choices were shown.
- "이제 괜찮아요" returned to the question screen.
- Re-entering the hypothesis screen restored the back button label to "다른 이유 고르기".
- Run / Stop / Reset remained normal.
- No new blocking issue was reported.

### Known Behavior
The D11-B6 reflection step is shown only after the B5 retry gate primary action.

Flow:
- Level 3 hint action "실험해볼게요"
- Retry gate
- "실행해봤어요"
- Reflection prompt
- "다시 관찰해볼게요" or "이제 괜찮아요"

"이제 괜찮아요" does not mean the simulator checkpoint passed. The official mission result remains controlled by the existing checkpoint logic and #check area.

### Notes
D11-B6 intentionally does not detect Run or Real Run completion. The reflection step is a soft post-retry prompt that helps students decide whether to observe again or continue. Passive picosim:event-based Run detection remains a possible future enhancement but was not included in this stage.

## 2026-09-26 — BUG-StudentEntry-LocalState-01/02 Previous Local State Exposure

### Status
CLOSED

### BUG-StudentEntry-LocalState-01

**Problem**
After a refresh, the student entry dialog reappeared, but the previous local simulator state (mission selection, completed checkmarks, code, board/console UI) remained visible behind it.

**Root Cause**
- `initStudentEntryGate()` opens the student entry `<dialog>` with `showModal()`, but this is non-blocking — the rest of app.ts's boot sequence keeps running immediately afterward.
- app.ts reads `picosim:mission` / `picosim:ws:<missionId>` / `picosim:passed` from localStorage and renders the editor, board, and mission list right away, regardless of whether the entry gate has been passed.
- The existing `.proj-dialog::backdrop` rule used a semi-transparent background (`rgba(10, 20, 14, 0.45)`), so the already-rendered previous state showed through behind the dialog.
- No server-side data exposure (learning_event / student_session / Supabase) was found — this was a client-side visual exposure of localStorage-backed state only.

**Solution**
- Added `#student-entry-dialog::backdrop { background: var(--surface-2); }` in `src/ui/styles.css`.
- The ID selector applies only to the student entry dialog, leaving the existing `#proj-dialog` (project save/load dialog) backdrop untouched and still semi-transparent.
- No JS/localStorage/workspace/session logic was changed.

**Commit**
- 43d9652 fix: hide app backdrop during student entry

**Deployment**
- Production URL: https://pico-simulator2.vercel.app
- Vercel deployment: success
- GitHub push: success

**Manual Production Verification**
Result: PASS

Checked:
- Student entry dialog no longer shows the previous simulator screen behind it.
- No new browser Console errors.
- Project save/load dialog backdrop remained semi-transparent as before.

### BUG-StudentEntry-LocalState-02

**Problem**
Even after BUG-01 hid the visual exposure, the underlying local workspace itself was not reset when a different student entered. `picosim:mission`, `picosim:passed`, and `picosim:ws:<missionId>` are stored in localStorage without any per-student namespace. The existing reset (`resetWorkspaceForNextStudent()`) only ran on the "나가기"(exit)/"다시입장" flow. If a student left without clicking "나가기" (closing the tab/browser), the next student entering on the same browser could still inherit the previous student's local workspace.

**Policy**
- Same student re-entering / refreshing / resuming an existing session → keep the existing local workspace.
- A different student entering → reset the previous local workspace.

**Solution**
- Added an owner-key comparison in `src/ui/student-entry-ui.ts`, using `StudentContext.studentId` as the owner key.
- Stored as `picosim:last-student-key` via the existing `project.ts` `store` (no new storage mechanism introduced).
- No owner key recorded yet → do not reset; just record the current studentId.
- Same owner key as before → do not reset, do not reload.
- Different owner key → `disableWorkspaceAutosave()` → `resetWorkspaceForNextStudent()` (existing function, reused as-is) → update the owner key → `location.reload()`, so app.ts re-reads the now-clean localStorage from a fresh boot.
- `resetWorkspaceIfStudentChanged()` is only invoked inside the `accepted` branch of the entry form's submit handler — never on entry failure or network error.
- The "나가기"/"다시입장" flow was left unmodified; it does not clear the owner key, which remains as the comparison baseline for the next entry.

**Commit**
- fed8cf0 fix: reset workspace when student changes

**Deployment**
- Production URL: https://pico-simulator2.vercel.app
- Vercel deployment: success
- GitHub push: success

**Manual Production Verification**
Result: PASS

Checked:
- A second test student (B) was added for verification.
- Student A's workspace persisted across refresh/re-entry as the same student.
- Student B entering after A (without A using "나가기") triggered a reset and reload, clearing A's code/board/passed/mission state.
- Student B's own workspace persisted across refresh/re-entry as the same student.
- No new browser Console errors.

### Explicit Non-Changes (both BUG-01 and BUG-02)
- No server / Supabase / OpenAI change.
- No student_session server logic change.
- No learning_event / logEvent change.
- No Run / Real Run change.
- No Stop / Reset change.
- No AI Coach change.
- No change to the picosim:ws:<missionId> storage structure itself.
- No project-wide student-identity-based localStorage namespace introduced.

### Known Limitations
- On first rollout, a browser with no owner key recorded yet will not reset on the very first entry after this fix ships, so previously-existing local state may still be visible once.
- Multiple tabs on the same browser share the same localStorage: a student switch detected in one tab can reset workspace data that another tab is still using. This is a structural property of the current single-namespace localStorage design and was intentionally left out of scope for BUG-01/02.
