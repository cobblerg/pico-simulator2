# CLAUDE.md

이 문서는 Claude Code가 picosim2 프로젝트에서 작업할 때 지켜야 할 맥락과 규칙입니다.

## 1. 프로젝트 개요

**목적**: picosim2는 브라우저 안에서 가상 RP2040 칩(rp2040js 에뮬레이터) 위에 **실제 공식 MicroPython v1.29.0 펌웨어(RPI_PICO용)를 그대로 부팅·실행**시키는 교육용 시뮬레이터입니다. 흉내만 내는 게 아니라 진짜 펌웨어가 가상 칩 위에서 동작하므로, 가상에서 통과한 코드는 한 글자도 바꾸지 않고 실물 라즈베리파이 피코에서 동일하게 동작하고 오류 메시지도 Thonny와 같습니다.

**주요 사용자**: 한국 초·중·고 정보/코딩 수업의 **교사와 학생**.
- 교사: 미션별로 사용 가능한 부품·미리 배치된 회로·시작 코드를 설정하고, 학생용 활동 링크를 배포합니다.
- 학생: 가상 보드에 부품을 배치하고 파이썬 코드를 작성·실행하며 미션을 통과한 뒤, "실물로 옮기기" 탭을 통해 실제 피코로 전환합니다.

**현재 구현된 주요 기능**:
- 가상 RP2040 보드(SVG)에 LED·버튼·가변저항·부저·서보모터를 드래그로 배치
- CodeMirror 6 기반 파이썬 에디터, raw REPL 프로토콜로 가상 칩에서 코드 실행/정지/REPL 입력
- 6개 내장 미션(`m1`~`m6`, `src/ui/data.ts`)과 미션별 자동 통과 판정(`src/ui/app.ts`의 `checkAtEnd`/`checkLive`)
- 프로젝트 저장/불러오기/이름 붙여 저장/공유 링크/`.picosim.json` 파일 내보내기·가져오기 (`src/ui/project.ts`)
- 교사 활동 설정(허용 부품, 미리 배치 회로, 고정 여부, 시작 코드)과 학생용 활동 링크·파일 배포
- "실물로 옮기기" 탭: 가상 회로 → 실물 핀 번호 배선표 자동 변환, 실물 전용 체크리스트, Web Serial로 실제 피코 연결·실행·`main.py` 저장
- 실물 특성 의도적 재현: 풀업/풀다운 없는 입력 핀 흔들림, 버튼-풀 설정 불일치 경고, 가변저항은 ADC 핀(GP26~28)만 허용, 서보는 50Hz 아니면 무반응, `time.sleep()`은 실제 시간과 동기화
- 모든 학습 행동을 `picosim:event` CustomEvent로 발행 (교사 대시보드 연동을 위한 훅)

**배포 URL**: https://pico-simulator2.vercel.app (GitHub `cobblerg/pico-simulator2`, `main` 브랜치 자동 배포)

## 2. 기술 구조

**언어/라이브러리**
- TypeScript로 작성하되 별도 타입 체크 단계 없음(`tsconfig.json` 없음, esbuild가 타입체크 없이 트랜스파일만 수행)
- `rp2040js` — 가상 RP2040 칩 에뮬레이터 (엔진의 핵심)
- `@codemirror/*`, `@lezer/highlight` — 코드 에디터(CodeMirror 6)
- `esbuild` — 번들러/미니파이어 (빌드 유일 수단)
- `uf2`, `typescript` — package.json에는 있으나 `build.mjs`가 직접 사용하지 않음(수동 UF2 파싱, 타입체크 생략)

**src 구조**
```
src/engine/core.ts     PicoEngine: UF2 펌웨어 로드, 실시간 속도 맞춤 실행 루프,
                        raw REPL 프로토콜, GPIO/PWM/ADC 상태 리포트
src/engine/worker.ts   Web Worker 엔트리 — core.ts를 메인 스레드와 분리 실행
src/engine/client.ts   PicoClient — 화면 ↔ Worker(또는 폴백으로 동일 스레드) 통신 창구
src/engine/bootrom.ts  RP2040 부트롬 바이너리 데이터 (BSD-3 라이선스)
src/real/serial.ts     RealPico — Web Serial API로 실물 피코와 가상과 동일한
                        raw REPL 프로토콜 통신
src/ui/data.ts         핀 배치(PINS), 부품 정의(PART_INFO), 미션 정의(MISSIONS),
                        오류 메시지 해설(ERROR_HELP) — 미션 추가는 여기서 시작
src/ui/board.ts        BoardView — SVG 가상 보드/부품 렌더링, 드래그앤드롭 배치,
                        핀 상태 시각화
src/ui/editor.ts       createEditor — CodeMirror 6 파이썬 에디터 래퍼,
                        에러 라인 하이라이트
src/ui/project.ts      저장/불러오기/공유 링크 인코딩, 교사 활동(Activity) 설정,
                        localStorage 저장소 (SIM-18, SIM-06)
src/ui/app.ts          화면 전체 오케스트레이션: 상태 관리, 이벤트 바인딩,
                        미션 점검 로직, 실행 버튼, 실물 연결 UI (가장 큰 파일)
src/ui/styles.css      전체 스타일
src/index.html         build.mjs가 CSS/JS를 삽입하는 HTML 템플릿
micropython-v1.29.0-RPI_PICO.uf2   공식 소스 빌드 펌웨어 — 빌드의 "입력"이지
                        산출물이 아니므로 반드시 git에 유지
```

**build.mjs 역할**
`src/engine/worker.ts`와 `src/ui/app.ts`를 esbuild로 각각 IIFE 번들(minify)하고, UF2 펌웨어를 base64로 JS에 인라인 임베드한 뒤, `src/index.html` 템플릿에 CSS/JS를 문자열 치환으로 삽입합니다. 결과로 `dist/index.html`(설치·배포용, standalone=true)과 `dist/picosim-artifact.html`(아티팩트/미리보기용, standalone=false) 두 개의 단일 HTML 파일을 만듭니다. 외부 네트워크 호출이 없는 결정적(deterministic) 빌드이며, Vercel이 배포마다 이 스크립트를 자동 실행합니다.

**server.mjs 역할**
Node 내장 `http` 모듈만 쓰는 초경량 정적 파일 서버로, `dist/`를 `http://localhost:3000`에서 서빙합니다. 로컬에서 빌드 결과를 브라우저로 직접 확인할 때만 쓰이며 **Vercel 배포와는 무관**합니다.

**package.json 주요 명령**
- `npm install` / `npm ci` — 의존성 설치
- `npm run build` (= `node build.mjs`) — `dist/` 생성
- `npm start` (= `node server.mjs`) — 로컬 프리뷰 서버 실행

## 3. 개발 원칙

- 기존 기능을 임의로 삭제하거나 변경하지 않습니다. 특히 `src/ui/data.ts`의 `MISSIONS` 배열, `src/ui/app.ts`의 `checkAtEnd`/`checkLive` 판정 로직, `src/ui/project.ts`의 저장 포맷(`ProjectFile`/`ActivityFile`, `parseFile`의 검증 규칙)은 기존 저장 데이터·공유 링크의 하위 호환성과 직결되므로 특히 주의합니다.
- 기능을 추가하기 전에 관련 코드를 먼저 분석합니다. 예: 미션 추가는 `data.ts`(정의) + `app.ts`(`checkAtEnd`/`checkLive`, 자동 점검) + 필요 시 `board.ts`(부품 시각화)까지 함께 봐야 합니다.
- 한 번에 하나의 기능 단위로 작업합니다.
- 큰 구조 변경(예: 엔진 프로토콜 변경, 저장 포맷 변경, 빌드 파이프라인 변경)은 구현 전에 영향 범위를 먼저 설명합니다.
- 최소한의 파일만 수정합니다. 관련 없는 리팩터링을 함께 하지 않습니다.
- 기존 UI/UX(한국어 문구 톤, 토스트/다이얼로그 패턴, SVG 보드 스타일)와 일관성을 유지합니다.

## 4. 테스트 원칙

- 기능 수정 후 `npm run build`를 실행합니다.
- 빌드 오류(esbuild 오류)가 없는지 확인합니다. 이 프로젝트는 `tsc` 타입체크 단계가 없으므로 esbuild 빌드 통과가 곧 유일한 자동 검증입니다.
- 가능하면 `npm start`(또는 `dist/index.html`을 직접 열어) 실제 기능을 브라우저에서 실행해 테스트합니다. 특히 가상 칩 부팅, 코드 실행, 미션 점검처럼 빌드만으로는 검증되지 않는 런타임 동작은 반드시 직접 확인합니다.
- 기존 핵심 기능(가상 칩 부팅, 코드 실행/정지, 부품 배치, 미션 6개 각각의 통과 판정, 저장/불러오기/공유 링크, 교사 설정)이 깨지지 않았는지 확인합니다.
- 문제가 발생하면 임의로 우회(예: 에러 무시, 조건 완화)하지 말고 원인을 먼저 분석합니다.

## 5. Git 원칙

- `dist/`는 빌드 산출물이므로 Git에 commit하지 않습니다(`.gitignore`에 등록됨). Vercel이 배포마다 새로 생성합니다.
- `node_modules/`도 commit하지 않습니다.
- 소스와 필요한 설정 파일(`package.json`, `package-lock.json`, `vercel.json`, `.gitignore` 등)만 commit합니다.
- 기능이 정상 작동하는 것을 확인한 후에만 commit/push합니다.
- 큰 기능은 가능하면 별도 브랜치(예: `feat/...`)에서 작업하고, 검증 후 `main`에 fast-forward 병합합니다.
- 예상하지 못한 변경(의도하지 않은 파일 수정, 자동 개행/인코딩 변경 등)이 `git status`/`git diff`에 보이면 commit하지 않고 먼저 원인을 확인합니다.

## 6. Vercel 배포 구조

```
GitHub main push
  → Vercel 자동 감지
  → npm run build
  → node build.mjs
  → dist 생성
  → Production 자동 배포 (https://pico-simulator2.vercel.app)
```

- 로컬에서 만든 `dist`를 GitHub에 올리지 않습니다. Vercel이 매 배포마다 소스로부터 `dist`를 새로 생성합니다(`vercel.json`의 `buildCommand: "npm run build"`, `outputDirectory: "dist"`).
- Production 배포 후에는 실제 서비스(`https://pico-simulator2.vercel.app`)가 HTTP 200으로 응답하는지, 필요하면 빌드 산출물 체크섬(MD5)이 로컬 재빌드 결과와 일치하는지까지 확인합니다.
- Preview 배포 URL(`*-cobblerg-6339s-projects.vercel.app` 고유 주소)은 Vercel Deployment Protection(SSO)으로 보호되어 있어 로그인 없이는 접근할 수 없습니다. 반면 Production 별칭 도메인(`pico-simulator2.vercel.app`)은 공개되어 있으므로 배포 확인은 이 도메인으로 합니다.

## 7. AI 작업 규칙

사용자가 기능 추가를 요청하면 바로 코드를 수정하기 전에 다음을 먼저 수행합니다:
1. 요구사항을 이해한다.
2. 관련 파일을 찾는다 (2번 "기술 구조"의 src 구조를 참고해 어느 계층인지 먼저 판단 — 엔진 로직인지, 보드/UI인지, 미션 정의인지, 저장/공유 로직인지).
3. 현재 구현 구조를 분석한다.
4. 기존 기능에 미치는 영향을 확인한다 (특히 저장 데이터 포맷, 공유 링크, 미션 판정 로직처럼 하위 호환이 중요한 부분).

그 후 필요한 최소 변경만 수행합니다.

## 8. 안전 규칙

- API key, token, password 등의 비밀정보를 코드에 직접 넣지 않습니다.
- 환경변수가 필요한 경우 사용자에게 먼저 설명하고 진행합니다.
- 데이터 삭제 작업(로컬 파일, git 히스토리, Vercel 배포 등)은 사용자 확인 없이 실행하지 않습니다.
- Git history를 파괴하는 명령(`git reset --hard`, `git push --force`, `git rebase` 등)을 임의로 실행하지 않습니다.
- Production 설정(Vercel 프로젝트 설정, `vercel.json`, 배포 관련 환경변수 등) 변경은 사용자 확인 없이 하지 않습니다.
