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

## 2026-09-26 — D11-B7 Resolved Soft Closure

### Summary
D11-B7은 post-retry reflection 이후 학생이 "이제 괜찮아요"를 선택했을 때 곧바로 질문 화면으로 복귀하지 않고, 짧은 resolved closure 안내를 보여주는 기능이다. 이는 학생의 자기보고를 공식 성공 판정으로 처리하지 않으면서, 흐름을 부드럽게 마무리하는 UI 단계다.

### Problem / Motivation
B6까지는 retry 후 reflection에서 "이제 괜찮아요" 선택 시 곧바로 질문 화면으로 돌아가 흐름이 다소 급하게 끝나는 느낌이 있었다. 학생의 자기보고를 checkpoint pass처럼 오해하지 않도록, 성공/완료/통과 표현 없이 짧은 중립 안내가 필요했다.

### Design Decision
- 기존 hypothesis 영역을 재사용한다.
- 새 DOM/HTML을 추가하지 않는다.
- 새 CoachingSession field를 추가하지 않는다.
- Run 감지, 성공 판정, checkpoint 변경, logEvent, Supabase/OpenAI 호출을 추가하지 않는다.
- resolved closure는 navigation-only UI다.
- "이제 괜찮아요"는 학생 자기보고일 뿐, 공식 미션 성공 판정이 아니다.

### Implementation
- src/ui/coaching-reflection.ts
  - resolvedMessage를 중립 문구로 조정: "알겠어요. 필요하면 다시 AI 학습 코치에서 확인할 수 있어요."
- src/ui/app.ts
  - currentCoachResolvedClosureVisible 추가
  - RESOLVED_CLOSURE_BACK_LABEL 추가: "질문 화면으로 돌아가기"
  - showResolvedClosure() 추가
  - reflection secondary button path: reflection → resolved closure
  - resolved closure button path: resolved closure → question screen
  - action button hidden in resolved closure

### Flow
- level 3 hint action "실험해볼게요"
- retry gate
- "실행해봤어요"
- post-retry reflection
- "이제 괜찮아요"
- resolved closure message
- "질문 화면으로 돌아가기"
- question screen

다음 기존 흐름도 그대로 유지됨:
- "다시 관찰해볼게요" → observation screen
- retry gate secondary "돌아갈게요" → question screen
- level 0/1/2 action → question screen
- hint ladder / retry gate / reflection 기존 흐름 유지

### Commit
- 2db3049 feat: add resolved closure to AI coach

### Verification
- TypeScript PASS
- npm run build에서 student artifacts 정상 생성
- teacher.html은 기존 로컬 PUBLIC_SUPABASE_URL/PUBLIC_SUPABASE_ANON_KEY 미설정 문제로 실패, 이번 변경과 무관
- Production deployment success
- Production static verification success
  - resolved closure message found
  - "질문 화면으로 돌아가기" found
  - old resolved message "좋아요..." absent
  - B4/B5/B6 기존 문구 유지 확인

### Explicit Non-Changes
- src/index.html 변경 없음
- styles.css 변경 없음
- CoachingSession 필드 추가 없음
- session reset 없음
- mission transition policy 변경 없음
- panel auto-close 없음
- Run / Real Run 변경 없음
- Stop / Reset 변경 없음
- checkpoint evaluator 변경 없음
- mission data 변경 없음
- learning_event/logEvent 변경 없음
- picosim:event listener 추가 없음
- Supabase/OpenAI 호출 추가 없음
- editor.get() 추가 없음
- resolvedSelfReport / reflectionState / reObservationCount 추가 없음

### Separate BUGs
D11-B7 수동 확인 중 발견된 별도 이슈가 있었고, D11-B7과 직접 관련 없는 코드 경로로 분리 처리되었다.

- BUG-StudentEntry-LocalState-01
  - commit: 43d9652
  - CLOSED
- BUG-StudentEntry-LocalState-02
  - commit: fed8cf0
  - CLOSED
- project-log 기록: 22a35f9

이들은 D11-B7 resolved closure 코드와 직접 관련 없는 student entry/localStorage 이슈였음.

### Status
CLOSED

## 2026-09-26 — D11-B8 — AI Coach → Teacher Timeline Integration

### Status
CLOSED

### 구현 목적
AI Coach의 핵심 학습 과정이 학생 브라우저 내부에서만 사라지지 않고, 새 Timeline 시스템을 만들지 않고 기존 `learning_event` 파이프라인을 통해 교사가 Teacher Timeline에서 확인할 수 있도록 연결했다.

### 추가된 이벤트

#### coach-open
학생이 AI 학습 코치를 열었음을 기록.

Teacher Timeline 표시: `AI 학습 코치 시작`

#### coach-hint
학생이 요청한 hint level을 기록.

payload: `level: 1 | 2 | 3`

Teacher Timeline 예:
- `AI 코치 힌트 요청 · 1단계`
- `AI 코치 힌트 요청 · 2단계`
- `AI 코치 힌트 요청 · 3단계`

#### coach-retry
학생이 retry gate에서 재시도 transition을 진행했음을 기록. 이 이벤트는 실제 Run 실행 자체를 증명하는 이벤트가 아니다.

Teacher Timeline 표시: `AI 코치 재시도`

#### coach-reflection
post-retry reflection의 결과를 기록.

허용 choice: `re-observe` | `resolved`

Production E2E에서 확인된 예: `AI 코치 학습 성찰 · 해결됨`

### Implementation
- `src/server/learning-event-handler.ts`
  - `ALLOWED_EVENT_TYPES`에 `coach-open`/`coach-hint`/`coach-retry`/`coach-reflection` 추가 (기존 20종 → 24종)
  - `pickEnum` 헬퍼 추가, `coach-hint`(level/focus)·`coach-reflection`(choice) sanitizer를 고정 enum 값만 허용하도록 작성 (자유 텍스트/식별 정보 없음)
- `src/server/teacher-timeline-data.ts`
  - `TIMELINE_SANITIZERS`에 4개 coach-* 이벤트 매핑 추가
- `src/ui/learning-event-sink.ts`
  - 클라이언트 측 `ALLOWED_EVENT_TYPES`에도 동일하게 4개 추가 (서버 목록과 정확히 일치)
- `src/ui/app.ts`
  - AI 코치 패널을 열 때 `coach-open` 발행
  - hint level 진행 시 `coach-hint` 발행 (level, focus)
  - retry gate 진행 시 `coach-retry` 발행
  - reflection에서 "다시 관찰해볼게요"/"이제 괜찮아요" 선택 시 `coach-reflection` 발행 (choice: `re-observe`/`resolved`)
- `src/ui/teacher-app.ts`
  - `EVENT_LABELS`에 4개 coach-* 라벨 추가
  - `COACH_REFLECTION_CHOICE_LABELS` 추가 (`re-observe` → "다시 관찰", `resolved` → "해결됨")
  - `describeEvent()`에 coach-hint의 level, coach-reflection의 choice를 라벨 뒤에 덧붙이는 분기 추가

### Commit
- 2e8a865 feat: add AI coach events to teacher timeline

### Verification
- Production E2E verification 완료 (coach-open/coach-hint/coach-retry/coach-reflection 각 이벤트가 Teacher Timeline에 위 표시 형식으로 확인됨)

### Explicit Non-Changes
- 새 Timeline 시스템 도입 없음 — 기존 `learning_event` 파이프라인 재사용
- checkpoint/mission 판정 로직 변경 없음
- coach-retry는 Run 실행 자체를 증명하지 않음 (retry gate transition만 기록)
- Run / Real Run / Stop / Reset 변경 없음

## 2026-09-27 — D11-B9 — Teacher AI Learning Insight

### Status
CLOSED

### 구현 목적
Teacher Timeline의 실제 learning events와 AI Coach events(D11-B8)를 기반으로, 교사가 학생의 문제 해결 과정을 빠르게 이해할 수 있는 구조화된 AI 학습과정 분석을 제공한다. 새 AI 분석 기능을 만드는 것이 아니라, 기존 `gpt-5-mini` / Responses API / Structured Outputs 기반 분석 기능(0-D11-A)을 확장한 것이다.

### 최종 분석 구조
AI 출력은 다음 6개 필드로 구성된다.
- 학습과정 요약 (`summary`)
- 관찰 근거 (`observations` + `evidence`)
- 도움 활용 (`helpUsage` + `evidence`)
- 재시도·변화 (`retryChange` + `evidence`)
- 교사 확인 포인트 (`teacherCheckPoints`)
- AI 피드백 초안 (`suggestedFeedback`)

`suggestedFeedback`은 기존 "피드백 입력란에 가져오기"(`aiCopyBtn`) 기능과의 호환성을 위해 그대로 유지했다.

### 교육적 안전 원칙
- 관찰 가능한 learning events를 근거로만 분석한다.
- evidence는 `E1, E2, ...` 형식의 실제 입력 event seq에만 연결된다(모델이 지어낸 값은 조용히 제거).
- 학생의 능력/성향/지능/노력/의도를 단정하지 않는다.
- 채점/등급화를 하지 않는다.
- 단일 event 하나만으로 원인을 추론하지 않는다.
- 힌트 사용을 능력 부족으로 해석하지 않는다.
- `coach-retry`는 실제 Run 실행의 증거가 아니다.
- `coach-reflection`의 `resolved`는 "학생이 해결되었다고 자기보고함"이며 객관적 이해/해결 검증이 아니다.
- `teacherCheckPoints`는 교사가 확인할 질문/제안 형태여야 하며 판정문이 아니다.

### Privacy / Security Boundary
OpenAI 입력에는 다음이 없다:
- 학생 이름
- studentId
- classId
- enrollmentId
- 전체 코드

입력 구조는 `seq` / `activityId` / `eventType` / minimized `payload`로 고정되며, `store:false`를 유지한다. student attribution/authorization은 기존 서버 경계(`teacher-session.ts`/`teacher-authorization.ts`)를 변경하지 않았다. DB/schema/Supabase migration 변경 없음.

`checkpoint.msg` privacy audit 결과: 학생 자유 텍스트가 아니라 시스템이 생성하는 고정 한국어 템플릿 + 시뮬레이터 계산값/고정 부품명만 포함하는 것으로 확인됨(`src/ui/app.ts`의 `showCheck()` 호출부 전수 확인).

### BUG-D11-B9-AI-Output-01
Production 첫 검증에서 HTTP 500, server log `malformed AI output: invalid JSON` 발생. 기존 코드가 OpenAI Responses API의 `response.status`/`incomplete_details`를 검사하지 않아 incomplete response와 malformed JSON을 구분하지 못했던 문제였다.

**수정**: `response.status === 'incomplete'`를 `JSON.parse` 이전에 감지하고 `incomplete_details.reason`을 서버 로그에 기록하도록 개선(`assertResponseComplete()`). 브라우저에는 기존 generic error UX 그대로 유지.

**Commit**: 04809235d9d7a7a229574ee14adab343ae832628

### BUG-D11-B9-AI-Output-02
BUG-01 배포 후 Production에서 실제 `incomplete AI output: max_output_tokens`를 확인 — output token budget 부족이 Production에서 확정됨.

`MAX_OUTPUT_TOKENS`: `2000` → BUG-01 단계에서 `3000` → Production `max_output_tokens` 확인 후 `4000`(최종값).

**Commit**: e85c4a0058961aeea6ab4dc0a3fd624a97ba7052

### BUG-D11-B9-AI-Output-03
`4000` 배포 후 Production에서 `Request timed out.` 확인. Production log와 설치된 OpenAI SDK 구현(`node_modules/openai`의 `APIConnectionTimeoutError` 기본 메시지 일치) 확인 결과, OpenAI SDK request timeout(25초)이 원인이며 별도 `AbortController`/manual timeout은 없음을 확인했다.

`AI_TIMEOUT_MS`: `25_000` → `45_000`(최종값).

**Commit**: 47acc8c47f1cfed43e0879fd80e10dfa3b83c59d

### Production E2E
`https://pico-simulator2.vercel.app/teacher.html`에서 실제 Teacher AI Analysis 검증 완료.

확인된 내용:
- 학습과정 요약 정상
- 관찰 근거 + evidence 정상
- 도움 활용 정상
- 재시도·변화 정상
- 교사 확인 포인트 정상
- AI 피드백 초안 정상
- m2 LED 문제 해결 과정 분석 정상
- m6 servo 미통과 과정 구분 정상
- hint 사용을 부정적 능력 평가로 해석하지 않음
- 학생 자기보고와 실제 Run/checkpoint 기록을 구분

최종 안정성 확인: Production 분석 성공 약 40초, 동일 조건 추가 분석 성공 약 35초 — 45초 timeout 내에서 2회 연속 성공.

### Known Follow-Up
D11-B9 blocker는 아니지만 후속 최적화 후보로 기록한다: Teacher AI Analysis latency. 현재 실제 Production에서 약 35~40초가 소요된다.

향후 별도 성능 개선에서 검토 가능:
- `MAX_EVENTS_FOR_AI = 50` 적정성
- event input 압축
- prompt 길이
- output 구조/길이
- activity 범위 전략

이번 D11-B9 close에서 위 항목은 구현하지 않는다.

또한 internal activityId(`m1`/`m2`/`m6`) 표시가 교사에게 혼동을 줄 수 있으므로, 향후 human-readable mission label UX 개선 후보로 기록한다.

### Closure
D11-B9: CLOSED

Feature commit:
- e4a106d2f0ba2965f328c9d86c8e3a0fdb669b71 feat: expand teacher AI learning insights

Stabilization commits:
- 04809235d9d7a7a229574ee14adab343ae832628 fix: handle incomplete AI analysis output
- e85c4a0058961aeea6ab4dc0a3fd624a97ba7052 fix: increase AI analysis output budget
- 47acc8c47f1cfed43e0879fd80e10dfa3b83c59d fix: extend AI analysis request timeout

Production E2E: PASS

## 2026-09-27 — D11-B10 — Student Teacher Feedback View

### Status
CLOSED

### 구현 목적
Teacher 화면에서 저장한 피드백을 해당 학생이 자신의 PicoSim2 학생 화면에서 안전하게 확인할 수 있도록 연결했다. Teacher Feedback Loop 전체를 구현한 것이 아니라, "teacher feedback 저장 → 학생에게 전달 → 학생이 확인" 구간만 완성한 기능이다.

### Reused Architecture
새 피드백 시스템을 만들지 않고 기존 구조를 그대로 재사용했다:
- `teacher_feedback` table
- `listFeedbackForEnrollment()`
- `student_session` HttpOnly signed cookie
- `StudentSessionPayload.enrollmentId`

DB schema/migration 변경 없음. 기존 Teacher feedback 작성/수정/저장 흐름 변경 없음.

### Student Feedback API
`GET /api/student-feedback`

동작: `student_session` → `verifyStudentSession()` → `session.enrollmentId` → `listFeedbackForEnrollment()` → minimized response.

response: `id` / `content` / `createdAt` / `updatedAt`

반환하지 않는 identity/internal fields: `teacherId` / `enrollmentId` / `studentId` / `classId` / `eventId`

GET 이외 method는 허용하지 않는다(405). invalid/missing/expired `student_session`은 feedback을 반환하지 않는다(401).

### Security Boundary
학생 feedback identity의 source of truth는 오직 server-side verified `student_session`이다. client URL/query/body의 `studentId`/`enrollmentId`/`classId`/`teacherId`를 조회 identity로 사용하지 않는다 — 실제로 endpoint 자체에 다른 학생을 지정할 identity parameter가 없다. 학생 A가 학생 B의 feedback을 지정해서 조회하는 API 구조를 만들지 않았다. feedback content는 학생 UI에서 `textContent`로 렌더하여 HTML을 실행하지 않는다.

### Student UI
학생 화면에 "선생님 피드백" 카드를 추가했다.

상태: `loading` / `empty` / `error` / `result`. 여러 feedback을 지원하며, 학생 화면에서는 최신 feedback이 먼저 보이도록 표시한다(교사 화면은 반대로 오래된 것부터 쌓아 보여주는 기존 방식 그대로 유지). `student_session`이 확정된 뒤에만 feedback을 fetch한다. 학생 전환 시 기존 workspace reset/reload 흐름을 그대로 활용해 이전 학생의 feedback이 새 학생에게 남지 않도록 했다 — localStorage를 feedback identity로 사용하지 않는다.

### Feature Commit
- full hash: 530f7a78b78a09aa1949f40194e0af8a9768fb0e
- short: 530f7a7
- message: feat: show teacher feedback to students

included files:
- api/student-feedback.ts
- src/server/student-feedback-handler.ts
- src/ui/student-feedback.ts
- src/ui/student-entry-ui.ts
- src/index.html
- src/ui/styles.css

6 files changed, 215 insertions

### Validation
구현 단계 validation:
- build PASS
- student feedback API bundle PASS
- valid session → own feedback PASS
- empty feedback PASS
- multiple feedback PASS
- missing session → 401 PASS
- invalid signed cookie → 401 PASS
- expired session → 401 PASS
- non-GET → 405 PASS
- DB error → generic 500 PASS
- response data minimization PASS
- XSS-safe text rendering PASS

DB/schema/migration 변경 없음.

### Production E2E
Production에서 실제 검증 완료.

Teacher가 학생 A에게 다음 테스트 feedback 저장: "D11-B10 테스트 - LED 연결 과정을 다시 설명해 보세요."

학생 A 화면: "선생님 피드백" 카드에서 해당 feedback이 정상 표시됨. 날짜: 2026. 9. 27.

확인:
- teacher-saved feedback delivery: PASS
- student feedback rendering: PASS

이후 학생 B로 전환하여 확인: 학생 A에게 저장한 위 feedback이 학생 B 화면에서는 보이지 않음.

따라서 Production에서:
- student A isolation: PASS
- student B isolation: PASS

핵심 경로: Teacher save → teacher_feedback → student_session enrollment identity → GET /api/student-feedback → correct student UI

Production E2E PASS.

### Explicitly Out of Scope
이번 D11-B10에서 구현하지 않은 항목:
- read/unread 상태
- "확인했습니다" 기능
- feedback-read learning_event
- 특정 mission linkage
- event_id linkage
- "다시 해보기" 버튼
- feedback 이후 학습 변화 자동 비교
- 학생 답글
- polling/auto refresh
- notification

이 항목들은 D11-B10 closure 조건이 아니다.

### Known Follow-Up
후속 Teacher Feedback Loop 후보:

교사 피드백 → 학생 확인 → 다시 시도 → 새로운 learning_event → 교사가 이후 변화 확인

또한 현재 학생 화면을 열어 둔 상태에서 교사가 새 feedback을 저장하면 자동으로 갱신되지 않을 수 있으므로, feedback refresh UX는 별도 후속 후보다.

이번 closure에서는 구현하지 않는다.

### Closure
D11-B10: CLOSED

Feature commit:
- 530f7a78b78a09aa1949f40194e0af8a9768fb0e feat: show teacher feedback to students

Production E2E: PASS

DB/schema migration: NONE

Student isolation: PASS

Known follow-up: AI analysis latency optimization

## 2026-09-27 — D11-B11 — Feedback-Guided Retry

### Status
CLOSED

### 구현 목적
학생이 교사가 작성한 feedback에서 "확인하고 다시 해보기"를 명시적으로 선택했을 때, 그 선택 사실을 신뢰 가능한 `learning_event`로 기록하고 Teacher Timeline에서 교사가 확인할 수 있도록 연결했다. Teacher Feedback Loop에서 "교사 피드백 → 학생 확인/재시도 선택 → 교사 Timeline" 구간을 완성한 기능이다.

### Event Semantics
신규 event: `feedback-retry`

payload: `{ feedbackId: string }`

정확한 의미: 학생이 특정 teacher feedback에서 "확인하고 다시 해보기"를 선택했다. 이 event 하나만으로 다음을 의미하지 않는다: 실제 Run 실행, 실제 재시도 완료, 문제 해결, checkpoint 통과, feedback 이해, 학습 성공. 실제 이후 행동은 기존 `run`/`checkpoint` 등의 별도 `learning_event`가 증거를 제공한다.

### Ownership Security
feedback-retry 저장 전 검증 순서: `student_session` → confirmed enrollment → feedbackId UUID validation → feedback enrollment lookup(`getFeedbackEnrollmentId()`) → enrollment ownership comparison → event insert.

학생 A session으로 학생 B feedbackId를 제출하면 400 + `learning_event` insert 없음. 존재하지 않는 feedbackId 역시 다른 학생 feedbackId와 구별되는 정보를 client에 노출하지 않는다. 학생 identity의 source of truth는 `student_session`뿐이며, client body에 studentId/enrollmentId/classId/teacherId 등을 추가하지 않는다.

### Student UX
학생의 각 feedback 항목에 "확인하고 다시 해보기" 버튼을 추가했다. 클릭 시 기존 `POST /api/events` endpoint를 직접 재사용한다(별도 신규 API route 없음). 직접 호출한 이유: loading/disabled UI, 성공 UI, 실패 시 버튼 복구, explicit user action의 결과를 확인해야 하는 요구사항 때문이다.

성공 시 "확인함 · 다시 해보세요" 상태로 변경되고 현재 렌더 세션에서 중복 제출을 방지한다. 실패 시 generic error + 버튼 재활성화.

다음은 하지 않는다: navigation, mission 자동 이동, workspace reset, localStorage 저장, read/unread 영속 상태.

### activityId Semantics
`learning_event.activity_id`가 필수이므로 버튼 클릭 당시 현재 workspace/activity를 기록한다. Production에서 `[m1] 교사 피드백 후 다시 시도 선택`으로 표시됨을 확인했다.

**중요**: `[m1]`은 버튼 클릭 당시 현재 activity context를 의미하며, "이 feedback이 m1에 대한 feedback이다"라는 의미가 아니다. feedback과 특정 mission을 자동 연결하지 않는다.

### Teacher Timeline
`feedback-retry` label: "교사 피드백 후 다시 시도 선택"

`TIMELINE_SANITIZERS`: `feedback-retry` → `{}`. 따라서 feedbackId는 Teacher Timeline response/UI에 노출되지 않는다.

### AI Learning Analysis
AI input에는 `feedback-retry` eventType이 포함될 수 있으나, feedbackId는 Timeline sanitizer를 통해 제거되어 AI에 전달되지 않는다.

`AI_SYSTEM_INSTRUCTIONS`에 "feedback-retry는 학생의 '다시 해보기 선택' 사실일 뿐이며 실제 Run/성공/문제 해결/feedback 이해의 증거가 아니다"라는 guardrail을 추가했다. `AI_OUTPUT_JSON_SCHEMA` 변경 없음.

### DB / Schema
NO MIGRATION. `teacher_feedback`/`learning_event` schema 변경 없음. `teacher_feedback.event_id`는 사용하지 않는다 — 해당 필드는 "특정 과거 learning_event에 대한 feedback"을 위한 기존 nullable FK 의미를 그대로 유지한다.

### Feature Commit
- full hash: 5f064768c6ddc33761d56afac6d2079d28e99b2d
- short: 5f06476
- message: feat: add feedback-guided retry event

8 files changed, 159 insertions(+), 3 deletions(-)

files:
- src/server/ai-learning-analysis.ts
- src/server/learning-event-data.ts
- src/server/learning-event-handler.ts
- src/server/teacher-feedback-data.ts
- src/server/teacher-timeline-data.ts
- src/ui/learning-event-sink.ts
- src/ui/student-feedback.ts
- src/ui/teacher-app.ts

### Validation
구현/Review Gate validation:
- own feedback → event insert PASS
- cross-student feedback → 400 / insert 없음 PASS
- unknown feedback → 400 / insert 없음 PASS
- invalid UUID → 400 / DB lookup 없음 PASS
- missing/invalid session → 거부 PASS
- forged enrollmentId → 거부 PASS
- feedbackId hidden from Timeline PASS
- feedbackId hidden from AI PASS
- existing learning events regression PASS
- Teacher feedback existing paths regression PASS
- build PASS

### Production E2E
Production에서 실제 확인 완료.

학생 화면: 기존 teacher feedback("D11-B10 테스트 - LED 연결 과정을 다시 설명해 보세요.") 표시 상태에서 "확인하고 다시 해보기" action 수행. 성공 후 버튼: "확인함 · 다시 해보세요"로 변경됨. PASS.

Teacher Timeline: `오전 11:09 · [m1] 교사 피드백 후 다시 시도 선택` 실제 표시 확인. PASS.

따라서 Production 핵심 경로: teacher feedback → student feedback UI → explicit retry selection → feedback-retry learning_event → Teacher Timeline. PASS.

### Important Interpretation Boundary
Production Timeline의 `[m1]`은 버튼 클릭 당시 현재 activity context다. feedback 자체가 m1을 대상으로 작성되었다는 증거가 아니다.

또한 feedback-retry 뒤에 향후 run/checkpoint가 발생하더라도, 현재 데이터 모델에는 attempt correlation id / causal parent / feedback-run linkage가 없으므로 "이 feedback 때문에 해당 Run이 발생했다"고 데이터 수준에서 단정하지 않는다.

가능한 표현: "학생이 다시 해보기를 선택했고, 이후 시간순으로 Run이 관찰되었다."

### Explicitly Out of Scope
D11-B11에서 구현하지 않은 항목:
- read/unread persistent state
- feedback-acknowledged 별도 event
- student reply
- mission/activity feedback linkage
- teacher_feedback.event_id 사용
- subsequent Run correlation
- attempt id
- causal linkage
- automatic navigation
- notification
- feedback refresh
- DB migration

### Closure
D11-B11: CLOSED

Feature commit:
- 5f064768c6ddc33761d56afac6d2079d28e99b2d feat: add feedback-guided retry event

Production E2E: PASS

Feedback ownership security: PASS

Teacher Timeline integration: PASS

DB/schema migration: NONE

### Remaining Feedback Loop Boundary
구현하지 않고 기록만 남긴다:
- feedback 이후 실제 Run은 기존 learning_event로 관찰 가능
- 특정 feedback과 이후 Run 사이의 causal/correlation linkage는 아직 없음
- post-feedback learning change visibility는 후속 후보

## 2026-09-27 — D11-B12 — Post-Feedback Learning Change Visibility

### Status
CLOSED

### 구현 목적
Teacher Feedback Loop에서 "teacher feedback → student feedback view → '확인하고 다시 해보기' → feedback-retry" 이후, 교사가 학생의 실제 후속 학습 행동을 쉽게 확인할 수 있도록 Teacher 화면에 "피드백 이후 관찰" deterministic card를 추가했다.

**중요**: 이 기능은 feedback effectiveness를 평가하는 기능이 아니다.

### Observation Semantics
anchor: 가장 최근 `eventType === 'feedback-retry'`.

observation window: 그 anchor 이후의 `learning_event`만 사용한다.

구현 방식: chronological events 배열에서 가장 최근 feedback-retry index를 찾고 `events.slice(anchorIndex + 1)`로 이후 event를 계산한다. 특정 feedbackId는 사용하지 않는다.

### Deterministic Fields
`hasRetry` / `retryAt` / `totalEvents` / `runCount` / `checkpointCount` / `coachCount` / `latestActivityId` / `latestCheckpointMsg`. 모든 값은 기존 sanitized `learning_event` 배열에서 deterministic하게 계산된다. AI 판정 없음.

### Interpretation Boundary
이 기능이 표현하는 것: "가장 최근 다시 해보기 선택 이후 시간순으로 관찰된 학습 행동".

표현하지 않는 것: 특정 feedback 때문에 Run했다, feedback으로 학습이 향상됐다, 학생이 이해했다, 학생이 성공했다, feedback 효과가 있었다.

`temporal sequence ≠ causation`

UI 고정 안내: "시간순으로 관찰된 사실만 보여주며, 특정 피드백과의 인과관계를 의미하지 않습니다."

### Run / Checkpoint / Coach Semantics
- **Run**: `runCount`는 실행 버튼 클릭이 관찰된 횟수. 성공/정답 의미 아님.
- **Checkpoint**: `checkpointCount`는 checkpoint event가 관찰된 횟수. `latestCheckpointMsg`는 기존 sanitized message를 그대로 표시. 향상/개선 판정 없음.
- **Coach**: `coachCount`는 feedback-retry 이후 `coach-*` event가 관찰된 횟수. 학생 능력/이해 부족을 의미하지 않음.

### Cross-Activity Semantics
post-feedback observation은 activityId로 필터링하지 않는다. 예: `[m1] feedback-retry → [m2] run → [m3] checkpoint`이면 모두 observation에 포함된다. `latestActivityId`는 가장 최근 관찰 event의 activity context다. `feedback-retry.activityId`는 feedback 대상 mission을 의미하지 않는다.

### Server Implementation
`src/server/teacher-timeline-data.ts`: `PostFeedbackObservation` type, `buildPostFeedbackObservation(events)` pure deterministic calculation, new DB query 없음.

`src/server/teacher-timeline-handler.ts`: 기존 `listRecentLearningEventsForEnrollment()` 결과 재사용, 기존 events response 유지, `postFeedbackObservation` 필드 추가, authorization chain 변경 없음.

### Teacher UI
`src/teacher.html`: "피드백 이후 관찰" card 추가.

`src/ui/teacher-app.ts`: observation 렌더링, empty/result state, student/class lifecycle reset, 학생 전환 시 이전 학생 observation 잔존 방지. 새 CSS 없음.

### Empty State
feedback-retry가 없으면 "아직 다시 해보기를 선택한 기록이 없습니다."를 표시한다. 이는 error가 아니라 feedback-retry event가 없다는 사실만 의미한다.

### Privacy / Security
`postFeedbackObservation`에 노출하지 않음: `feedbackId` / `teacherId` / `enrollmentId` / `studentId` / `classId` / `eventId`. feedbackId 자체를 계산에 사용하지 않는다.

기존 Teacher Timeline security(teacher token → teacher identity → class ownership → student enrollment) 그대로 유지. 새 identity input 없음.

### DB / API / AI Scope
DB migration: NONE

new API route: NONE

new DB query: NONE

AI changes: NONE

student-side changes: NONE

teacher_feedback.event_id reinterpretation: NONE

### Feature Commit
- full hash: b8a10924d4378b21ba4130c7e76e6efc53542804
- short: b8a1092
- message: feat: show post-feedback learning observations

files:
- src/server/teacher-timeline-data.ts
- src/server/teacher-timeline-handler.ts
- src/teacher.html
- src/ui/teacher-app.ts

diff: 4 files changed, 169 insertions, 3 deletions

### Local Validation
- Case 1: feedback-retry 없음 → hasRetry false — PASS
- Case 2: checkpoint, feedback-retry, run, run, checkpoint → totalEvents 3, runCount 2, checkpointCount 1 — PASS
- Case 3: feedback-retry, run, feedback-retry, checkpoint, coach-open → 가장 최근 retry만 anchor, totalEvents 2, runCount 0, checkpointCount 1, coachCount 1 — PASS
- Case 4: [m1] feedback-retry, [m2] run, [m3] checkpoint → cross-activity 포함, latestActivityId m3 — PASS
- Case 5: feedback-retry가 마지막 event → hasRetry true, totalEvents 0, counts 0 — PASS
- Case 6: anchor 이전 run 10개 → post-feedback count에서 제외 — PASS

scratch validation: 19/19 PASS

build: PASS

Teacher events API bundle: PASS

### Production E2E
Production anchor: 최근 다시 해보기 선택 2026-09-27 오전 11:09.

첫 확인:
- 이후 학습 이벤트: 3회
- 실행: 1회
- 체크포인트: 1회
- 최근 체크포인트: "내장 LED가 1.0초 동안 켜졌어요."
- AI 코치 사용: 0회
- 최근 활동: m1

그 후 학생이 추가 학습 행동을 수행.

두 번째 확인:
- anchor: 오전 11:09 그대로 유지
- 이후 학습 이벤트: 7회
- 실행: 2회
- 체크포인트: 2회
- 최근 체크포인트: "내장 LED가 1.0초 동안 켜졌어요."
- AI 코치 사용: 1회
- 최근 활동: m1

판정:
- anchor stability: PASS
- new Run reflected: PASS
- new checkpoint reflected: PASS
- coach event reflected: PASS
- deterministic recount: PASS
- interpretation boundary visible: PASS

Production E2E: PASS

### Explicitly Out of Scope
- feedback effectiveness score
- improvement score
- before/after numerical score
- automatic improvement judgment
- causal attribution
- specific feedback association
- feedbackId UI exposure
- feedbackId AI exposure
- attempt/correlation architecture
- mission auto-linking
- teacher_feedback.event_id reinterpretation
- student ranking
- ability classification
- notification
- analytics dashboard redesign

### Remaining Boundary
현재 B12는 가장 최근 feedback-retry 이후의 시간순 학습 행동을 보여준다.

그러나 특정 feedback과 특정 이후 Run/checkpoint 사이의 causal/correlation linkage는 여전히 없다. 이는 의도적으로 추측하지 않는 설계다.

향후 정말 필요할 경우에만 별도의 attempt/correlation architecture를 독립 설계해야 한다. 현재 B12의 결함으로 처리하지 않는다.

### Closure
D11-B12: CLOSED

feature commit: b8a1092

Production E2E: PASS

deterministic observation: PASS

privacy/security: PASS

DB/schema changes: NONE

## 2026-09-27 — D11-B Stabilization 1 — Teacher UI & Evidence Language Cleanup

### Status
CLOSED

### 목적
D11-B8~B12 Integration Audit에서 발견된 두 가지 통합 friction을 해결한 small stabilization 작업이다. 새 기능 개발이 아니다.

해결한 문제:
1. Teacher 학생 상세 화면의 정보 순서가 교사의 의사결정 흐름과 어긋나 있던 문제
2. `coach-reflection`의 `resolved`가 Timeline에서 단순 "해결됨"으로 표시되어 학생 자기보고가 검증된 해결처럼 읽힐 수 있던 evidence-language 문제

### Teacher UI Order
Before: Timeline → 피드백 이후 관찰 → AI 학습과정 분석 → 교사 피드백

After: Timeline → AI 학습과정 분석 → 교사 피드백 → 피드백 이후 관찰

의도: Evidence → AI Interpretation/Decision Support → Teacher Decision/Feedback → Follow-up Evidence.

변경은 `src/teacher.html`의 기존 DOM block reorder만 수행했다. ID/class/section content/JS selector/API 호출은 변경하지 않았다.

### Evidence Language
Before: `AI 코치 학습 성찰 · 해결됨`

After: `AI 코치 학습 성찰 · 해결됐다고 응답`

의미: `coach-reflection` payload `{ choice: 'resolved' }`는 학생이 스스로 "해결되었다"고 응답했다는 사실만 증명한다. 실제 문제 해결, 정답, 이해 완료, 학습 성공을 증명하지 않는다. 따라서 Teacher Timeline label 자체에서 self-report 성격이 드러나도록 수정했다. `re-observe` label은 변경하지 않았다.

### Semantic Boundary
다음은 전부 변경되지 않았다: eventType, `coach-reflection` payload, `learning_event` storage, Timeline sanitizer, AI payload, AI prompt, AI schema. 저장된 evidence 의미는 그대로이며 Teacher UI 표현만 더 정확하게 수정했다.

### Changed Files
정확히 2개: `src/teacher.html`, `src/ui/teacher-app.ts`

Feature/Stabilization commit:
- full: d01e09e5709e5a8164208e91c0eef9337703cdad
- short: d01e09e
- message: chore: refine teacher feedback loop UI
- diff: 2 files changed, 29 insertions(+), 23 deletions(-)

### Explicitly Unchanged
Teacher Timeline API, Teacher authorization, AI analysis, AI prompt/schema, teacher feedback save/edit, student feedback, feedback-retry, post-feedback observation calculation, learning-event logging, student workspace, DB/schema — 전부 무변경.

DB migration: NONE

new API: NONE

new event: NONE

### Local Validation
`npm run build` PASS.

`dist/teacher.html` 확인: Timeline → AI → Feedback → PFO 순서 PASS. 새 label "해결됐다고 응답" bundle 반영 PASS. 구 resolved label "해결됨" 제거 확인 PASS.

### Production UI Verification
PASS.

확인 1: 기존 `coach-reflection` resolved Timeline event가 `AI 코치 학습 성찰 · 해결됐다고 응답`으로 표시됨. PASS.

확인 2: Teacher 학생 상세 화면의 전체 정보 순서가 Timeline → AI 학습과정 분석 → 교사 피드백 → 피드백 이후 관찰로 표시됨. PASS.

새 student action이나 새 coach event를 생성하지 않고 기존 Production 기록으로 검증했다.

### Closure
D11-B Stabilization 1: CLOSED

Implementation: d01e09e

Build: PASS

Production UI Verification: PASS

Evidence-language correction: PASS

Teacher information-order correction: PASS

Privacy/security regression: NONE

DB/schema changes: NONE

### Next Direction
새 기능 D11-B13으로 바로 진행하지 않는다.

D11-B8~B12 Integration Audit에서 가장 큰 장기 구조적 위험으로 확인된 "자동화된 회귀 테스트 부재"를 다음 안정화 작업에서 검토한다.

다음 후보: D11-B Regression Test Gate

목적: 기존 scratch/manual validation 중 핵심 보안·event semantics·feedback ownership·post-feedback observation 시나리오를 repository에 영속적인 regression test로 승격할 수 있는지 설계한다. 이번 docs 단계에서는 test framework를 설치하거나 test 코드를 만들지 않았다.

## 2026-09-27 — D11-B Stabilization 2 — Compact Teacher Timeline

### Status
CLOSED

### 목적
Production Teacher Timeline에 `learning_event`가 많이 누적되면 Timeline이 페이지 전체 높이를 크게 늘려 AI 학습과정 분석, 교사 피드백, 피드백 이후 관찰 영역으로 이동하기 어려웠다. 이번 stabilization은 Timeline 데이터를 줄이지 않고 표시 영역만 compact하게 만들어 Teacher workflow 접근성을 개선했다.

### Implementation
**Default Timeline**:
- `max-height: 240px`, `overflow-y: auto`
- 약 7~8개 event 표시
- 과거 event는 내부 scroll로 탐색

**Latest position**:
- Timeline render/load 완료 후 최신 event 위치로 자동 scroll

**Expand**:
- `[확대]` button
- 동일 Timeline DOM 재사용
- expanded `max-height: 65vh`
- 내부 scroll 유지
- button text → `[축소]`
- `aria-expanded` 갱신

**Collapse**:
- compact 240px로 복귀
- 새 fetch 없음
- Timeline 재렌더 없음

**Student switching**:
- expanded state reset
- button → `[확대]`
- compact state 복귀
- 새 학생 Timeline 최신 위치 표시

### Changed Files
기능 commit: e7a62ea275ca65683423fe832c8d518064531fe0

message: feat: add compact teacher timeline

changed files:
- src/teacher.html
- src/ui/teacher-app.ts

기능 commit diff: 2 files changed, 42 insertions(+), 1 deletion(-)

### Explicitly Unchanged
- server/API changes: NONE
- DB/schema: NONE
- migration: NONE
- AI analysis: UNCHANGED
- B12 buildPostFeedbackObservation: UNCHANGED
- MAX_EVENTS=200: UNCHANGED
- MAX_EVENTS_FOR_AI: UNCHANGED
- learning_event: UNCHANGED
- teacher_feedback: UNCHANGED
- Timeline event ordering: UNCHANGED
- Timeline event semantics: UNCHANGED
- Student UI: UNCHANGED

### Semantic Boundary
Compact Timeline은 learning records 자체를 축약하지 않는다. 서버가 제공하는 기존 최대 200개 event는 그대로 유지된다. 이번 변경은 오직 Teacher UI에서 보이는 viewport를 제한한다.

`[확대]`/`[축소]`/Timeline scroll은 학습 행동이 아니므로 `learning_event`를 생성하지 않는다.

### Production Verification
Production UI Verification: PASS

실제 Production에서 확인:
1. 이벤트가 많은 0101 테스트학생에서 Timeline이 compact panel로 제한됨.
2. 기본 상태에서 내부 scrollbar 정상.
3. 최신 쪽 event가 기본적으로 표시됨.
4. Timeline 내부 scroll로 과거 event 탐색 가능.
5. `[확대]` 클릭 시 button이 `[축소]`로 변경되고 Timeline 영역이 크게 확장됨.
6. 확대 상태에서도 Timeline 내부 scrollbar 유지.
7. 동일 Timeline content가 유지됨.
8. 학생 A의 Timeline을 확대해 둔 상태에서 0102 테스트학생B로 전환.
9. 학생 전환 후 button이 자동으로 `[확대]`로 reset됨.
10. Timeline이 compact 상태로 복귀함.
11. 0102 테스트학생B의 최신 기록이 표시됨.
12. Timeline 바로 아래에 AI 학습과정 분석 영역이 가까이 나타나 기존의 과도한 page scrolling 문제가 개선됨.

### Explicitly Out of Scope
이번 stabilization에 포함하지 않은 것:
- Timeline filtering
- event grouping
- mission-open suppression
- deduplication
- pagination
- Timeline search
- date grouping
- attempt/correlation
- server event limit 변경
- AI event limit 변경

이들은 필요성이 확인될 경우 별도 후속 과제로 판단한다.

### Closure
D11-B Stabilization 2: CLOSED

Implementation: e7a62ea

Production UI Verification: PASS

DB/schema: NONE

Migration: NONE

### Next Direction
D11-B Regression Test Gate

목적: B8~B12 및 Stabilization 1~2의 핵심 Teacher Feedback Loop 동작을 반복 가능한 regression checks로 보호한다.

단, Regression Test Gate는 이 docs-only close 작업에서는 시작하지 않는다.

## 2026-09-27 — D11-B Regression Test Gate

### Status
CLOSED

### 목적
D11-B8~B12 및 Stabilization 1~2를 향후 코드 변경으로부터 보호하기 위한 최소 자동 regression test 기반을 도입했다.

이번 Gate의 목표는 높은 line coverage가 아니라 다음의 회귀를 탐지하는 것이다:
- learning-record trust
- identity / authorization
- event semantics
- deterministic derived logic
- AI privacy boundary
- teacher-in-the-loop boundary

### Test Infrastructure
- Test runner: Vitest
- 추가 scripts: `npm test` → `vitest run`, `npm run test:watch` → `vitest`
- Test organization: `tests/server/`, `tests/ui/`
- DOM environment: NONE
- Playwright: NOT ADDED
- Real Supabase: NOT USED
- Real OpenAI: NOT USED

### Implementation Commit
- full: 7c5fd4672fe74c4ddc82f1943db6626318f385cf
- short: 7c5fd46
- message: test: add D11-B regression gate
- 변경: 9 files changed, 1574 insertions(+), 8 deletions(-)

### Test Files
추가된 6개 테스트 파일:
- tests/server/post-feedback-observation.test.ts
- tests/server/feedback-retry.test.ts
- tests/server/student-feedback.test.ts
- tests/server/ai-learning-analysis.test.ts
- tests/server/teacher-in-loop.test.ts
- tests/ui/teacher-regression.test.ts

### Production Testability Change
`src/ui/teacher-app.ts`에서 `EVENT_LABELS`/`COACH_REFLECTION_CHOICE_LABELS`/`describeEvent` 3개 심볼에 export visibility만 추가했다.

- dictionary 값 변경 없음
- describeEvent body 변경 없음
- DOM initialization 변경 없음
- event binding 변경 없음
- runtime behavior 변경 없음
- Timeline/API behavior 변경 없음

Vitest node 환경에서 `teacher-app.ts`는 import 시 DOM을 즉시 요구하기 때문에, Phase 1에서는 직접 import test 대신 source-level regression test를 사용했다. jsdom/happy-dom을 추가하지 않았다.

### Regression Coverage
- B9 AI privacy → T9 / T9b / T9c
- B9 AI failure handling → T10 / T11
- B10 Student Feedback isolation → T7 / T8
- B11 Feedback ownership → T4 / T5 / T6
- B12 Post-Feedback deterministic observation → T1 / T2 / T3
- Stabilization 1 → T12 / T13 / T13b
- Teacher-in-the-loop → T14

### Important Semantic Boundaries
테스트가 보호하는 의미를 명확히 남긴다.

- feedback-retry ≠ 실제 code Run 완료
- coach-reflection resolved = 학생이 "해결됐다고 응답"한 자기보고
- B12 Post-Feedback Observation = feedback-retry 이후 시간 순서상 관찰된 기록. B12는 특정 feedback이 후속 학습 행동의 원인이라고 주장하지 않는다.
- AI analysis input은 허용된 최소 정보만 사용하고, identity/full code/free-text error 등 금지 정보가 AI payload에 포함되지 않도록 보호한다.
- AI suggested feedback은 자동 저장/자동 전송되지 않으며, 교사가 최종 검토하는 teacher-in-the-loop을 유지한다.

### Test Result
- Test Files: 6 passed (6)
- Tests: 17 passed (17)
- Failed: 0

최종 Commit Gate 재실행 Duration: 419ms(참고값, 환경 의존)

### Build Result
`npm run build`: PASS(더미 Supabase env 사용). 3개 build artifact 정상 생성. `dist/teacher.html`: 241KB. export visibility 추가로 기존 bundle behavior/size에 의미 있는 변화 없음.

### External Service Boundary
- Production Supabase: NOT USED
- Production DB: NOT USED
- Real OpenAI: NOT USED
- Production URLs: NOT CALLED

모든 server test는 fake client/data source/provider 기반이다.

DB/schema: NONE

Migration: NONE

### Deferred
이번 Gate에서 의도적으로 제외된 것:
- B8 coach-* sanitizer 저장 단계 자동 테스트
- Stabilization 2 DOM/browser automation
- aria-expanded 실제 click behavior
- scrollHeight / auto-scroll browser behavior
- jsdom
- happy-dom
- Playwright
- full browser E2E
- real Supabase integration
- Production DB test
- real OpenAI call
- AI response quality evaluation
- visual regression
- performance/load testing
- 25 event type 전체 snapshot
- full auth matrix

이 항목들은 현재 Gate의 실패나 미완료가 아니라 의도적인 deferred scope다.

### Development Rule Going Forward
향후 D11-B 관련 production 변경 전/후 최소 검증: `npm test`, `npm run build`.

특히 Teacher Feedback Loop의 semantic/privacy/identity 관련 변경에서는 Regression Gate를 통과해야 한다.

단, CI 도입은 이번 단계 범위가 아니다.

### Closure
D11-B Regression Test Gate: CLOSED

Implementation: 7c5fd46

Automated tests: 17 PASS

Build: PASS

DB/schema: NONE

Migration: NONE

Real Supabase/OpenAI: NOT USED

### Next Direction
새 기능 번호를 임의로 만들지 않는다.

- D11-B stabilization / regression protection baseline established.
- B8 coach-* sanitizer automated coverage: DEFERRED candidate
- Stabilization 2 browser automation: LATER
- Playwright: LATER, preferably after CI/test workflow need is clear
- 새 feature: NOT STARTED

## 2026-09-27 — D11-C Teacher Class & Roster Management

### Status
CLOSED (code-level) — staging smoke test pending

### 목적
교사가 Supabase SQL Editor 없이 PicoSim2 안에서 직접 학급을 생성하고 학생 명단을 등록할 수 있게 하여, D11-B까지 완성된 학습 → 학습기록 → 교사 Timeline → AI 분석 → 교사 피드백 → 학생 피드백 확인 흐름의 유일한 미완성 진입점(교사 학급/명단 생성)을 실제 제품 경로로 연결했다. 이 축은 2026-09-27에 진행된 "PicoSim2 — Full Project Status Audit" §J(Next Development Axis Candidates)에서 최우선 축(Axis 1)으로 식별된 것이다.

### Baseline
D11-C 시작 baseline: `5d93b905bcc333abf895751a6b8c5494549cc14a`(short `5d93b90`)

### Stages

| Stage | Commit | 핵심 |
|---|---|---|
| C0 — Product Contract | (문서만, commit 없음) | classCode/roster/예외학생/authorization/transaction 계약 확정(읽기 전용 조사) |
| C1 — Student Identity Regression Baseline | `947ab04` | 기존 student entry identity contract를 17개 테스트로 고정(회귀 보호, production 무변경) |
| C2 — Class Creation Server Boundary | `d033ed6` | 승인 교사의 학급 생성(`POST /api/teacher/classes`), 시스템 생성 6자리 classCode, teacher_class ownership, compensation |
| C3 — Roster Management Server Boundary | `dc77107` | 단건/bulk 통일 `entries[]` 계약(`POST /api/teacher/classes/:classId/students`), all-or-nothing validation, 중복/race 방어, compensation |
| C4 — Teacher Class & Roster UI | `605b040` | 학급 생성 폼, classCode 표시, 단건/bulk 등록 UI, 순수 파서(`teacher-roster-parser.ts`) |
| C5 — Exceptional Student Recovery | `989d901` | 학생용 generic 회복 안내 문구, 교사 즉석 등록 안내, enumeration resistance 유지 |
| C6 — End-to-End Stabilization | `d8d39e2` | Pilot vertical slice 전 구간 identity 추적, **multi-row INSERT RETURNING 순서 의존성 제거**(실제 결함 수정), 통합 테스트 2건 추가, README 환경변수 문서화 |
| C7 — Regression Gate & Project Closure | (이 entry) | 전체 회귀 재검증 + 문서화 + closure |

### Student Identity Contract
- roster-first: 교사 사전 등록이 기본 경로, 학생 자가 생성 없음
- 학생 자가 등록(self-registration) 금지 — 어떤 코드 경로도 무인증 상태에서 Student/Enrollment를 생성하지 않는다
- `(class_id, student_no)` class-scoped invariant — studentNo는 global identity가 아니며 DB UNIQUE 제약으로 보장됨(migration 20260925090000)
- 이름은 정확히 등록된 이름과 일치해야 하며(strict equality, fuzzy matching 없음), 불일치는 name-mismatch로 분류되지만 public 응답에서는 노출되지 않음
- public 응답은 항상 `{status:'rejected'}` 하나로 접힘(enumeration resistance, D11-C1이 4가지 내부 사유 전부를 회귀 보호)
- 재입장 시 기존 studentId/enrollmentId를 재사용(멱등), 새 row를 만들지 않음

### Teacher Class Contract
- 승인된 교사(teacher 테이블에 관리자가 수동 등록한 teacherId)만 학급 생성 가능
- classCode는 교사가 입력하지 않고 시스템이 생성(6자리, 혼동 문자 0/O/1/I 제외한 대문자+숫자)
- classCode 충돌은 정상적으로 예상 가능한 상황으로 취급 — 최대 5회 재시도, 무한 루프 없음, unique_violation(Postgres 23505)만 충돌로 인식
- classId가 durable identity, classCode는 재발급 가능한 변경 속성(student_session은 classId만 담아 재발급에 영향받지 않음)
- 학급 생성은 school_class + teacher_class 두 row로 구성되며, teacher_class 생성 실패 시 방금 만든 school_class를 보상 삭제

### Roster Contract
- 서버 계약은 `entries: [{studentNo, name}]` 하나로 통일 — 단건도 bulk와 같은 경로(entries 길이 1)
- raw pasted text 파싱은 서버가 아니라 교사 브라우저(C4 `teacher-roster-parser.ts`, 순수 함수)의 책임
- all-or-nothing validation — 하나라도 invalid하면 전체 write 없음, 구조화된 `{index, studentNo, reason}` 오류 반환
- 중복 방어 2단계: 애플리케이션 사전 조회(같은 학급 내 기존 studentNo + batch 내부 중복) + DB UNIQUE(class_id, student_no) 최종 방어선
- **RETURNING-order 안전화(D11-C6에서 실제로 발견·수정한 결함)**: 초기 구현은 multi-row `INSERT ... RETURNING`의 반환 행 순서가 입력 순서와 같다고 가정해 studentId/enrollmentId를 배열 index로 대응시켰다 — 이 순서는 Postgres/Supabase 어느 쪽도 공식적으로 보장하지 않아 이론상 identity mis-link(학번 A의 enrollment가 실제로는 학번 B의 studentId를 가리킴) 위험이 있었다. `crypto.randomUUID()`로 studentId/enrollmentId를 insert 전에 애플리케이션이 직접 생성해 어떤 DB 응답 순서에도 의존하지 않도록 수정했다(스키마 변경/migration/RPC 없음).
- student/enrollment 각각 한 번의 multi-row INSERT(Postgres 단일 문장 원자성 활용), 실패 시 이번 요청이 만든 studentId만 보상 삭제(다른 요청/기존 row에 영향 없음)

### Exceptional Student Contract
- 명단에 없는 학생의 자동 생성 없음, pending/승인 큐 같은 별도 시스템 없음
- 학생 화면은 모든 rejected case에 동일한 generic 안내(`STUDENT_ENTRY_REJECTED_MESSAGE`)만 표시 — 실패 사유를 추측해 다르게 보여주지 않음
- 교사가 C3/C4의 정상 단건 등록 기능을 그대로 사용해 즉석 등록(별도 워크플로 없음)
- 학생은 같은 dialog/form에서 새로고침 없이 재시도 가능 — `enterStudent()`가 매번 DB를 실시간 조회하므로 등록 직후 accepted 가능함을 코드로 확인(D11-C6 §7)

### Regression Coverage
- 총 92 tests, 15 test files, 0 failures(2026-09-27 최종 재실행 기준)
- Student identity: Case 1~6b + 공개 경계 8종(`tests/server/student-entry-domain.test.ts`, `tests/server/student-entry-handler.test.ts`)
- Class creation: classCode 생성 2종 + A/E/F/G/H/I 6종(`tests/server/teacher-class-creation.test.ts`) + handler 5종(`tests/server/teacher-classes-handler.test.ts`)
- Roster: A/B/C/D/E/F/G/K/L/M/N 12종(`tests/server/teacher-roster-creation.test.ts`) + handler 12종(`tests/server/teacher-students-handler.test.ts`)
- Roster ↔ Student entry 통합: 2종(`tests/server/roster-student-entry-integration.test.ts`, D11-C6 신규)
- Bulk paste parser: 10종(`tests/ui/teacher-roster-parser.test.ts`)
- 학생 회복 안내 문구: 4종(`tests/ui/student-entry-message.test.ts`)
- D11-B 기존 17종(feedback/AI/timeline/teacher-in-loop) 회귀 없음

### Regression Matrix

| Boundary | Protection |
|---|---|
| Valid roster student entry | automated test(Case 1) |
| Name mismatch | automated test(Case 2, 6b) |
| Unknown studentNo | automated test(Case 3) |
| Unknown classCode | automated test(Case 4) |
| Re-entry identity reuse | automated test(Case 5) |
| Cross-class studentNo isolation | automated test(Case 6) |
| Enumeration resistance | automated test(handler enumeration + data-integrity-error) |
| Malformed student entry | automated test(handler malformed 4종) |
| Teacher class creation | automated test(A) |
| classCode collision | automated test(E, F) |
| class ownership creation | automated test(A, handler wiring) |
| Class creation compensation | automated test(H, I) |
| Single roster registration | automated test(A) |
| Bulk roster registration | automated test(B) |
| Duplicate roster rejection | automated test(D, E) |
| Cross-class duplicate isolation | automated test(F) |
| Roster compensation | automated test(L, M, N) |
| RETURNING-order-safe mapping | automated/stabilization test(A, B, handler wiring — 응답 필드가 실제 insert payload와 일치함을 직접 검증) |
| Bulk parser | automated test(10종) |
| Student recovery message | automated test(4종) |

### Test Gate
```
Test Files  15 passed (15)
     Tests  92 passed (92)
```
Failed: 0

### Build Result
- Student/main build(dist/index.html, dist/picosim-artifact.html): PASS
- Teacher build(dist/teacher.html): `PUBLIC_SUPABASE_URL`/`PUBLIC_SUPABASE_ANON_KEY` 환경변수 미설정으로 FAIL(코드 회귀 아님 — 환경 제약, README에 문서화 완료)
- Compile verification: scratch-only fake define으로 `teacher-app.ts`/신규 server 파일 esbuild 번들 성공 확인(fake 값은 repository에 기록하지 않음)

### External Service Boundary
- Production Supabase write(class/roster/student/enrollment): **NOT EXECUTED**
- Google OAuth 실제 로그인: **NOT EXECUTED**
- Production DB read/write: **NOT EXECUTED**
- Real OpenAI call: **NOT EXECUTED**
- 모든 D11-C server test는 fake SupabaseClient/in-memory fixture 기반이다.

DB/schema 변경: NONE. Migration: NONE.

### Manual Staging Smoke Test Status
다음 항목은 이번 D11-C(C0~C7) 전 구간에서 **실행되지 않았다** — PASS로 표시하지 않는다.

- Google OAuth 실제 로그인 — NOT EXECUTED — staging smoke test required
- 실제 Supabase class write — NOT EXECUTED — staging smoke test required
- 실제 Supabase roster write — NOT EXECUTED — staging smoke test required
- 실제 student entry against staging DB — NOT EXECUTED — staging smoke test required
- 실제 learning_event write — NOT EXECUTED — staging smoke test required
- 실제 OpenAI analysis call — NOT EXECUTED — staging smoke test required
- 실제 teacher feedback write/read — NOT EXECUTED — staging smoke test required
- 실제 student follow-up(다시 해보기) — NOT EXECUTED — staging smoke test required
- 실제 브라우저 시각 확인(Chrome 확장 미연결) — NOT EXECUTED — staging smoke test required

### Pilot Smoke Test Checklist(다음 단계에서 사용자가 직접 수행)

**Teacher setup**
- [ ] Teacher Google login succeeds
- [ ] Teacher approved
- [ ] Create class
- [ ] Generated classCode visible
- [ ] Add one student
- [ ] Bulk-add several students
- [ ] Roster displays correctly

**Student normal flow**
- [ ] Enter classCode
- [ ] Enter studentNo
- [ ] Enter registered name
- [ ] Entry accepted
- [ ] Simulator opens

**Exceptional student**
- [ ] Unregistered student rejected generically
- [ ] No reason-specific identity information exposed
- [ ] Teacher adds student
- [ ] Student retries without page reload
- [ ] Entry accepted

**Learning record**
- [ ] Student completes activity/checkpoint
- [ ] learning_event recorded
- [ ] Teacher Timeline displays event

**AI analysis**
- [ ] Teacher requests AI analysis
- [ ] OpenAI request succeeds
- [ ] Analysis is displayed
- [ ] Failure handling is acceptable if provider unavailable

**Teacher feedback**
- [ ] Teacher saves feedback
- [ ] Feedback appears in student flow

**Student follow-up**
- [ ] Student reads feedback
- [ ] Student chooses retry/follow-up
- [ ] Subsequent learning observation/event is recorded

### Deferred
- Staging smoke test(위 체크리스트) — 다음 단계
- classCode regeneration(재생성 API/UI)
- 학급/학생 edit·remove lifecycle(이름/학번 수정, 삭제)
- 더 넓은 교사 analytics(학급 단위 대시보드, DB-01/04)
- Digital Society/multi-subject content 확장
- 실제 LLM 기반 Student AI Coach(현재는 결정론적 스캐폴드)
- CSV import/export, QR 코드

### Closure
D11-C Teacher Class & Roster Management: **CODE-LEVEL CLOSED**

Implementation commits: `947ab04` → `d033ed6` → `dc77107` → `605b040` → `989d901` → `d8d39e2`

Automated tests: 92 PASS

Build: student/main PASS, teacher build environment-blocked(코드 아님)

DB/schema: NONE 추가(기존 grant로 충분)

Migration: NONE

Real Supabase/Google OAuth/OpenAI: NOT USED

**Pilot V1 code-complete for the current Pico vertical slice; staging smoke test pending.**

("production ready"/"fully verified"/"pilot completed" 같은 표현은 실제 브라우저·외부 서비스 검증 전이므로 사용하지 않는다.)

### Next Direction
**Pilot Staging Smoke Test** — 위 체크리스트를 실제 Supabase 프로젝트 + 실제 Google 계정 + 실제 OpenAI key가 설정된 staging 환경에서 사람이 직접 수행한다. 이 검증이 끝나기 전까지 새 기능 번호(D11-D 등)를 임의로 시작하지 않는다.
