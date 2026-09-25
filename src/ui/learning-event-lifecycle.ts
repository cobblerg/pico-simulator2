// 학습 이벤트 전송 허용 플래그 (Stage 0-D9-C)
//
// workspace-autosave.ts와 정확히 같은 이유로, 같은 모양으로 만든 작은
// 중립 모듈이다 — student-entry-ui.ts(언제 켜고 끌지 결정)와
// learning-event-sink.ts(이 플래그를 확인만 함) 양쪽에서 import한다. 두
// 파일이 서로를 직접 import하면 순환 의존이 생기므로 이 모듈을 통해서만
// 상태를 주고받는다.
//
// 기본값은 false다 — 학생이 아직 입장하지 않은 상태(페이지 로드 직후
// boot/open 같은 이벤트)에서 발생하는 picosim:event가 학습 기록으로
// 저장되면 안 되기 때문이다(0-D9-C review §11). student-entry-ui.ts가
// 다음 시점에 이 플래그를 조작한다:
//   - 정상 입장 성공(accepted) 직후: enable
//   - F5로 이미 유효한 StudentContext를 이어받을 때: enable
//   - "다시 입장" 클릭 시작 시점(다른 어떤 정리 작업보다도 먼저): disable
//     — 그 이후로는 새 이벤트를 절대 큐에 넣지 않는다.
//   - 로그아웃 실패로 "다시 입장"이 중단돼 같은 학생이 계속 쓰게 될 때:
//     enable로 되돌림(workspace-autosave의 enableWorkspaceAutosave()와
//     대칭).
let enabled = false;

export function isLearningEventSinkEnabled(): boolean {
  return enabled;
}

export function enableLearningEventSink(): void {
  enabled = true;
}

export function disableLearningEventSink(): void {
  enabled = false;
}
