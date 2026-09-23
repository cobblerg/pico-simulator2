# PicoSim 2 — 칩을 흉내 내는 가상 피코

브라우저 안에서 가상 RP2040 칩이 **실물과 같은 MicroPython 펌웨어(v1.29.0, Raspberry Pi Pico용)** 를 그대로 실행합니다.
그래서 가상에서 통과한 코드는 한 글자도 바꾸지 않고 실물 피코에서 똑같이 동작하고, 오류 메시지도 Thonny와 똑같습니다.

## 바로 쓰기

`dist/index.html` 한 파일에 전부(펌웨어, 가상 칩, 화면)가 들어 있습니다.

- **GitHub Pages**: 기존 `pico-simulator1` 저장소에 `dist/index.html`을 올리면 됩니다 (예: `v2/index.html`로 올리면 `…github.io/pico-simulator1/v2/`).
- **Netlify**: `dist` 폴더를 끌어다 놓기.
- 실물 연결(Web Serial)은 **https 주소 + 크롬·엣지·웨일**에서만 동작합니다. 파일을 더블클릭해 연 화면에서는 연결 버튼이 동작하지 않을 수 있습니다.

## 실물 수업으로 넘어가는 흐름

1. **가상 실습**: 부품을 핀으로 끌어다 놓고, 코드를 실행하고, 미션 점검을 통과한다.
2. **실물로 옮기기** 탭
   - ① 펌웨어 맞추기: 가상과 같은 v1.29.0 UF2를 받아 BOOTSEL로 설치 (설치 버전에서는 파일로 바로 받기)
   - ② 배선표: 가상 회로를 실물 핀 번호(GP15 = 20번 핀), GND 위치, 저항, 극성으로 자동 변환
   - ③ 실물 점검: 가상에서는 생기지 않는 문제(LED 극성, 저항, 브레드보드 홈, 풀업/풀다운, 서보 5V) 체크리스트
   - ④ 실물에서 실행: USB로 연결된 피코에 같은 코드를 보내 실행·정지·`main.py`로 저장. 결과는 콘솔에 파란색으로 나와 가상 결과와 비교
3. Thonny를 쓰는 교실이면 "코드 복사" 후 Thonny에 붙여 넣기

## 가상에서 일부러 재현한 실물 현상

- 풀업/풀다운 없이 입력 핀을 읽으면 값이 흔들린다 (경고 표시)
- 버튼을 GND에 연결하고 `PULL_DOWN`을 쓰면 눌러도 값이 바뀌지 않는다 (경고 표시)
- 가변저항은 ADC 핀(GP26~28)에만 연결된다
- 서보는 50Hz가 아니면 움직이지 않는다
- `time.sleep(1)`은 실제 1초 (실제 시간에 맞춰 실행)

## 가상과 실물의 차이 (알고 쓰기)

- 가상 보드에서는 LED 저항이 자동으로 들어가고, 전압·전류·배선 실수는 없다 → ③ 점검표로 보완
- 가상 피코에는 파일 시스템이 없어 `open('파일','w')`는 `OSError: ENODEV`가 난다 (실물은 정상)
- Pico W의 와이파이는 없다 (이 가상 칩은 Pico, RP2040)
- 계산이 매우 무거운 코드는 실물보다 느리게 돈다 (보통 수업 코드는 실시간)

## 폴더 구조

```
src/engine/core.ts     가상 칩 엔진: rp2040js + 펌웨어 부팅, 실시간 맞춤, raw REPL 실행, 핀·PWM·ADC
src/engine/worker.ts   화면이 멈추지 않도록 Web Worker에서 실행
src/engine/client.ts   화면 ↔ 가상 칩 연결 (Worker가 막히면 같은 스레드에서 실행)
src/real/serial.ts     실물 피코 연결 (Web Serial, Thonny·mpremote와 같은 raw REPL 방식)
src/ui/data.ts         핀 배치, 부품, 미션, 오류 해설  ← 미션 추가는 여기
src/ui/board.ts        가상 보드와 부품 그림, 끌어다 놓기
src/ui/app.ts          화면 동작, 미션 점검, 학습 기록
build.mjs              모든 것을 index.html 한 파일로 묶기
micropython-v1.29.0-RPI_PICO.uf2   공식 소스(v1.29.0 태그)로 빌드한 펌웨어
```

## 다시 빌드하기

```bash
npm install
node build.mjs        # dist/index.html (설치용), dist/picosim-artifact.html (미리보기용)
```

## 미션 추가하기

`src/ui/data.ts`의 `MISSIONS` 배열에 항목을 추가하고, 자동 점검이 필요하면 `src/ui/app.ts`의 `checkAtEnd`(실행이 끝났을 때) 또는 `checkLive`(실행 중)에 조건을 추가합니다. 점검에 쓸 수 있는 기록은 `runEdges`(핀이 바뀐 시각), `runStdout`(출력), `runPins`(PWM 주파수·듀티)입니다.

## 대시보드 연동 (PRD 7장)

모든 학습 행동이 `picosim:event`로 발생합니다: `run`, `run-end`, `error`(종류·줄), `stop`, `paste`(5줄 이상 붙여넣기), `part-add/move/remove`, `checkpoint`(통과 여부), `real-connect`, `real-run`, `real-run-end` 등.

```js
window.addEventListener('picosim:event', (e) => {
  // e.detail = { t: 시각, type: '종류', data: {...} }
  // 여기서 Supabase 등 서버로 보내면 교사 대시보드에 쌓인다
});
```

## 기술 메모

- 가상 칩: [rp2040js](https://github.com/wokwi/rp2040js) (MIT, Wokwi). 부트롬은 Raspberry Pi pico-bootrom B1 (BSD-3).
- rp2040js의 USB 시리얼은 보낼 데이터가 없어도 즉시 빈 응답을 돌려줘서 칩이 쉬지 못하고 약 4배 느려진다. `core.ts`에서 실제 USB 호스트처럼 응답을 미루도록 고쳐 `time.sleep`이 실시간으로 돈다.
- 펌웨어: MicroPython v1.29.0 (MIT), `ports/rp2`, `BOARD=RPI_PICO` 공식 소스 빌드.
- 에디터: CodeMirror 6 (MIT).
