// 피코 핀 배치, 부품, 미션 정의 (새 미션은 MISSIONS 배열에 추가하면 된다)
import { Checkpoint } from './checkpoint';

export type PinDef = { phys: number; name: string; gp?: number; side: 'L' | 'R'; row: number };

// 실물 Raspberry Pi Pico 핀 배치 (USB가 위, 윗면 기준)
const LEFT = ['GP0', 'GP1', 'GND', 'GP2', 'GP3', 'GP4', 'GP5', 'GND', 'GP6', 'GP7', 'GP8', 'GP9', 'GND', 'GP10', 'GP11', 'GP12', 'GP13', 'GND', 'GP14', 'GP15'];
const RIGHT = ['VBUS', 'VSYS', 'GND', '3V3_EN', '3V3(OUT)', 'ADC_VREF', 'GP28', 'AGND', 'GP27', 'GP26', 'RUN', 'GP22', 'GND', 'GP21', 'GP20', 'GP19', 'GP18', 'GND', 'GP17', 'GP16'];

export const PINS: PinDef[] = [
  ...LEFT.map((name, i) => ({ phys: i + 1, name, side: 'L' as const, row: i, gp: name.startsWith('GP') ? +name.slice(2) : undefined })),
  ...RIGHT.map((name, i) => ({ phys: 40 - i, name, side: 'R' as const, row: i, gp: name.startsWith('GP') ? +name.slice(2) : undefined })),
];

export const pinByGp = (gp: number) => PINS.find((p) => p.gp === gp);

export function nearestPin(gp: number, names: string[]) {
  const from = pinByGp(gp)!;
  const cands = PINS.filter((p) => names.includes(p.name));
  cands.sort((a, b) => (a.side === from.side ? 0 : 100) + Math.abs(a.row - from.row) - ((b.side === from.side ? 0 : 100) + Math.abs(b.row - from.row)));
  return cands[0];
}

export type PartKind = 'led' | 'button' | 'pot' | 'buzzer' | 'servo';

export type Part = {
  id: string;
  kind: PartKind;
  gp: number;
  color?: string; // LED
  wiring?: 'gnd' | '3v3'; // 버튼: GND 쪽(PULL_UP) / 3V3 쪽(PULL_DOWN)
  value?: number; // 가변저항 0..1
  pressed?: boolean;
  locked?: boolean; // 교사가 고정한 부품 (옮기기·빼기 불가)
};

export const PART_INFO: Record<PartKind, { name: string; wire: string; hint: string; allowed?: number[] }> = {
  led: { name: 'LED', wire: '#E07A1F', hint: '디지털 출력 · PWM 밝기' },
  button: { name: '푸시버튼', wire: '#2F6FD0', hint: '디지털 입력' },
  pot: { name: '가변저항', wire: '#2C9A6A', hint: '아날로그 입력 (GP26~28만)', allowed: [26, 27, 28] },
  buzzer: { name: '수동 부저', wire: '#7A4FC4', hint: 'PWM 주파수 = 음 높이' },
  servo: { name: '서보모터', wire: '#9A6A3A', hint: 'PWM 50Hz · 각도' },
};

export const LED_COLORS: Record<string, string> = { red: '#FF3B3B', yellow: '#FFC83D', green: '#35D46A', blue: '#3D8BFF' };
export const LED_COLOR_NAMES: Record<string, string> = { red: '빨강', yellow: '노랑', green: '초록', blue: '파랑' };

export type Mission = {
  id: string;
  title: string;
  goal: string;
  needs: { kind: PartKind; gp: number }[];
  starter: string;
  blocks: { label: string; code: string }[];
  hint: string;
  // 활동 설정 기본값 (교사 설정 화면에서 바꿀 수 있다)
  allowed?: PartKind[]; // 쓸 수 있는 부품 (없으면 제한 없음)
  preset?: Omit<Part, 'id'>[]; // 미리 배치된 회로
  lockPreset?: boolean; // 미리 배치 부품 고정
  // 0-C1: checkAtEnd/checkLive의 판정 조건을 데이터로 표현한 것.
  // 아직 어떤 실행 경로에서도 읽지 않는다 — checkAtEnd/checkLive는 계속
  // 하드코딩된 자체 로직으로 판정한다.
  checkpoints?: Checkpoint[];
};

export const MISSIONS: Mission[] = [
  {
    id: 'm1',
    allowed: [],
    title: '내장 LED 켜고 끄기',
    goal: '보드의 내장 LED를 1초 동안 켰다가 끄세요.',
    needs: [],
    starter: `from machine import Pin\nimport time\n\nled = Pin("LED", Pin.OUT)   # 내장 LED (Pico는 GP25)\n\n# 여기에 코드를 완성하세요\n`,
    blocks: [
      { label: '불 켜기', code: 'led.on()' },
      { label: '불 끄기', code: 'led.off()' },
      { label: '1초 기다리기', code: 'time.sleep(1)' },
    ],
    hint: 'on() → sleep(1) → off() 순서예요.',
    checkpoints: [{ when: 'end', rule: { kind: 'edge-hold', pin: 25, minHoldMs: 800 } }],
  },
  {
    id: 'm2',
    allowed: ['led'],
    title: 'GP15 LED 3번 깜빡이기',
    goal: 'LED를 GP15에 연결하고 0.5초 간격으로 3번 깜빡이세요.',
    needs: [{ kind: 'led', gp: 15 }],
    starter: `from machine import Pin\nimport time\n\nled = Pin(15, Pin.OUT)\n\nfor i in range(3):\n    # 반복할 내용을 들여쓰기해서 쓰세요\n    pass\n`,
    blocks: [
      { label: '켜기', code: '    led.on()' },
      { label: '끄기', code: '    led.off()' },
      { label: '0.5초 쉬기', code: '    time.sleep(0.5)' },
    ],
    hint: 'for 안의 코드는 4칸 들여쓰기해야 반복돼요.',
    checkpoints: [{ when: 'end', rule: { kind: 'edge-count', pin: 15, edge: 'rise', min: 3 } }],
  },
  {
    id: 'm3',
    allowed: ['led', 'button'],
    title: '버튼으로 LED 켜기',
    goal: 'GP14 버튼을 누르는 동안만 GP15 LED가 켜지게 하세요.',
    needs: [
      { kind: 'button', gp: 14 },
      { kind: 'led', gp: 15 },
    ],
    starter: `from machine import Pin\nimport time\n\nbutton = Pin(14, Pin.IN, Pin.PULL_UP)  # 누르면 0, 떼면 1\nled = Pin(15, Pin.OUT)\n\nwhile True:\n    # 버튼 값을 읽어 LED를 켜고 끄세요\n    time.sleep(0.01)\n`,
    blocks: [
      { label: '버튼 눌림?', code: '    if button.value() == 0:' },
      { label: '켜기', code: '        led.on()' },
      { label: '아니면', code: '    else:' },
      { label: '끄기', code: '        led.off()' },
    ],
    hint: 'PULL_UP이면 눌렀을 때 value()가 0이에요. 끝낼 때는 ■ 정지.',
    checkpoints: [{ when: 'live', rule: { kind: 'press-toggle', inputGp: 14, outputGp: 15 } }],
  },
  {
    id: 'm4',
    allowed: ['pot', 'led'],
    title: '가변저항 값 읽기',
    goal: 'GP26의 가변저항 값을 0.2초마다 출력하고, 손잡이를 움직여 값이 바뀌는지 보세요.',
    needs: [{ kind: 'pot', gp: 26 }],
    starter: `from machine import ADC\nimport time\n\npot = ADC(26)\n\nwhile True:\n    # read_u16()은 0~65535 값을 돌려줘요\n    time.sleep(0.2)\n`,
    blocks: [
      { label: '값 출력', code: '    print(pot.read_u16())' },
      { label: '전압으로', code: '    print(pot.read_u16() * 3.3 / 65535)' },
    ],
    hint: '출력되는 동안 보드 옆 가변저항 손잡이를 끌어 보세요.',
    checkpoints: [
      { when: 'live', rule: { kind: 'stdout-range', minSamples: 2, bigValueThreshold: 10, bigSpanMin: 3000, smallSpanMin: 0.15 } },
    ],
  },
  {
    id: 'm5',
    allowed: ['buzzer', 'led'],
    title: '부저로 도레미',
    goal: 'GP16 수동 부저로 도(262Hz)·레(294Hz)·미(330Hz)를 0.3초씩 연주하세요.',
    needs: [{ kind: 'buzzer', gp: 16 }],
    starter: `from machine import Pin, PWM\nimport time\n\nbuzzer = PWM(Pin(16))\nbuzzer.duty_u16(32768)   # 소리 크기: 50%\n\nfor f in [262, 294, 330]:\n    # 주파수를 바꾸고 기다리세요\n    pass\n\nbuzzer.duty_u16(0)       # 소리 끄기\n`,
    blocks: [
      { label: '음 높이', code: '    buzzer.freq(f)' },
      { label: '0.3초', code: '    time.sleep(0.3)' },
    ],
    hint: '화면 위 스피커 버튼으로 소리를 켤 수 있어요.',
    checkpoints: [
      { when: 'both', rule: { kind: 'pwm-freq-set', pin: 16, targets: [262, 294, 330], tolerance: 0.03 } },
    ],
  },
  {
    id: 'm6',
    allowed: ['servo'],
    preset: [{ kind: 'servo', gp: 17 }],
    lockPreset: true,
    title: '서보 각도 바꾸기',
    goal: 'GP17 서보를 0도 → 90도 → 180도로 1초씩 움직이세요.',
    needs: [{ kind: 'servo', gp: 17 }],
    starter: `from machine import Pin, PWM\nimport time\n\nservo = PWM(Pin(17))\nservo.freq(50)   # 서보는 50Hz (20ms 주기)\n\ndef angle(a):\n    # 0도 = 0.5ms, 180도 = 2.5ms 펄스\n    pulse_ms = 0.5 + a / 180 * 2.0\n    servo.duty_u16(int(pulse_ms / 20 * 65535))\n\n# 각도를 바꿔 보세요\n`,
    blocks: [
      { label: '0도', code: 'angle(0)' },
      { label: '90도', code: 'angle(90)' },
      { label: '180도', code: 'angle(180)' },
      { label: '1초', code: 'time.sleep(1)' },
    ],
    hint: '실물 서보는 빨간 선을 VBUS(5V)에 연결해요.',
    checkpoints: [
      { when: 'both', rule: { kind: 'pwm-duty-angle-set', pin: 17, freqRange: [30, 70], targets: [0, 90, 180], tolerance: 10 } },
    ],
  },
];

// 오류 해설 (실물 Thonny에서도 똑같은 영어 메시지가 나온다)
export const ERROR_HELP: Record<string, string> = {
  SyntaxError: '문법 오류: 괄호, 따옴표, 콜론(:)이 빠졌는지 확인하세요.',
  IndentationError: '들여쓰기 오류: if/for/while/def 다음 줄은 4칸 들여써야 해요.',
  NameError: '이름 오류: 만들지 않은(또는 철자가 틀린) 이름을 썼어요. import와 변수 이름을 확인하세요.',
  TypeError: '자료형 오류: 함수에 넣은 값의 종류나 개수가 맞지 않아요.',
  ValueError: '값 오류: 허용되지 않는 값이에요. 핀 번호나 범위를 확인하세요.',
  ImportError: '불러오기 오류: 모듈 이름을 확인하세요. 피코에서는 machine, time을 써요.',
  AttributeError: '속성 오류: 그 객체에는 없는 기능이에요. 철자(on, off, value…)를 확인하세요.',
  ZeroDivisionError: '0으로 나눌 수 없어요.',
  KeyboardInterrupt: '■ 정지로 프로그램을 멈췄어요. (실물 Thonny의 Stop과 같아요)',
  OSError: '장치 오류: 연결이나 핀 설정을 확인하세요.',
};
