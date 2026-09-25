// 작업 자동저장 억제 플래그 (Stage 0-D8 보완)
//
// "다시 입장"(학생 교체) 클릭 시점부터 페이지가 완전히 새로고침될 때까지,
// 현재 학생의 작업 상태가 디바운스 타이머(saveWsSoon)나 pagehide 같은 어떤
// 자동저장 경로로도 localStorage에 다시 쓰이지 않도록 막기 위한 최소
// 공유 상태다.
//
// app.ts(saveWsSoon/saveWsNow가 실제로 저장하기 전에 이 플래그를 확인)와
// student-entry-ui.ts("다시 입장" 시점에 이 플래그를 끔) 양쪽에서
// import한다 — 두 파일이 서로를 직접 import하면 순환 의존이 생기므로,
// 이 작은 중립 모듈을 통해서만 상태를 주고받는다.
//
// Stage 0-D9-A1: "다시 입장"이 서버 로그아웃 실패로 중단될 수 있게 되면서
// (student_session 쿠키가 확실히 끊겼다고 확인되기 전에는 reload하지
// 않음), 그 경우 현재 학생이 페이지를 계속 쓸 수 있으므로 자동저장을
// 다시 켜야 한다 — enableWorkspaceAutosave()를 그 재시도 경로에서 쓴다.
let enabled = true;

export function isWorkspaceAutosaveEnabled(): boolean {
  return enabled;
}

export function disableWorkspaceAutosave(): void {
  enabled = false;
}

export function enableWorkspaceAutosave(): void {
  enabled = true;
}
