// 가상 RP2040 칩 엔진
// - rp2040js(가상 Cortex-M0+ RP2040) 위에서 실물과 같은 MicroPython 펌웨어(UF2)를 실행한다.
// - 학생 코드는 USB 시리얼의 raw REPL로 전달한다 (Thonny, mpremote와 같은 방식).
// - 실제 시간과 맞춰 실행 속도를 조절해 time.sleep(1)이 실제 1초가 되도록 한다.
import { Simulator, USBCDC, ConsoleLogger, LogLevel, GPIOPinState } from 'rp2040js';
import { bootromB1 } from './bootrom';

export type PinReport = {
  pin: number;
  mode: 'out' | 'in' | 'pwm' | 'off';
  level: 0 | 1;
  pull: 'up' | 'down' | 'none';
  duty?: number; // 0..1 (PWM)
  freq?: number; // Hz (PWM)
};

export type EngineEvent =
  | { t: 'ready'; version: string }
  | { t: 'serial'; text: string } // 친근한 REPL 출력
  | { t: 'stdout'; text: string } // 실행 중 프로그램 출력
  | { t: 'run-start' }
  | { t: 'run-end'; ok: boolean; error: string; simMs: number }
  | { t: 'pins'; pins: PinReport[] }
  | { t: 'edges'; edges: [number, number, number][] } // [pin, level, simMs]
  | { t: 'float'; pin: number }
  | { t: 'speed'; ratio: number };

export type InputPart = { pin: number; kind: 'button'; activeLevel: 0 | 1; pressed: boolean };

const FLASH_START = 0x10000000;
const WATCHED_PINS = [...Array(29).keys()]; // GP0..GP28 (GP25 = 내장 LED)

export class PicoEngine {
  private sim!: Simulator;
  private cdc!: USBCDC;
  private txQueue: number[] = [];
  private pendingRead = -1;
  private wallStart = 0;
  private simStart = 0;
  private timer: any = null;
  private running = false;
  private rxMode: 'boot' | 'friendly' | 'enter-raw' | 'await-ok' | 'stdout' | 'stderr' | 'exit-raw' = 'boot';
  private rxBuf = '';
  private stderr = '';
  private runStartNs = 0;
  private queuedCode: string | null = null;
  private lastPins = new Map<number, string>();
  private edges: [number, number, number][] = [];
  private inputs: InputPart[] = [];
  private adc = [0, 0, 0];
  private floatWarned = new Set<number>();
  private disposers: (() => void)[] = [];
  private version = '';
  private busyMs = 0;
  private windowMs = 0;

  constructor(
    private bootUf2: Uint8Array,
    private emit: (e: EngineEvent) => void,
  ) {}

  // ---------- 부팅 ----------
  boot() {
    this.stop();
    const sim = new Simulator();
    const mcu = sim.rp2040;
    mcu.loadBootrom(bootromB1);
    mcu.logger = new ConsoleLogger(LogLevel.Error);
    const u = this.bootUf2;
    for (let i = 0; i + 512 <= u.length; i += 512) {
      const dv = new DataView(u.buffer, u.byteOffset + i, 512);
      if (dv.getUint32(0, true) !== 0x0a324655 || dv.getUint32(4, true) !== 0x9e5d5157) continue;
      const addr = dv.getUint32(12, true);
      const size = dv.getUint32(16, true);
      mcu.flash.set(u.subarray(i + 32, i + 32 + size), addr - FLASH_START);
    }
    const cdc = new USBCDC(mcu.usbCtrl);
    const anyCdc = cdc as any;
    // 실제 USB 호스트처럼: 보낼 데이터가 없으면 응답을 미룬다 (없으면 칩이 쉬지 못하고 계속 깨어남)
    mcu.usbCtrl.onEndpointRead = (ep: number, size: number) => {
      if (ep !== anyCdc.outEndpoint) return;
      if (this.txQueue.length === 0) {
        this.pendingRead = size;
        return;
      }
      this.flushTx(size);
    };
    cdc.onDeviceConnected = () => this.send('\r');
    cdc.onSerialData = (d: Uint8Array) => this.onRx(d);
    this.sim = sim;
    this.cdc = cdc;
    this.txQueue = [];
    this.pendingRead = -1;
    this.rxMode = 'boot';
    this.rxBuf = '';
    this.lastPins.clear();
    this.edges = [];
    this.floatWarned.clear();
    this.disposers.forEach((d) => d());
    this.disposers = WATCHED_PINS.map((p) =>
      mcu.gpio[p].addListener((s: GPIOPinState) => {
        if (mcu.gpio[p].functionSelect !== 5) return; // SIO(일반 입출력)만 기록
        if (s === GPIOPinState.High || s === GPIOPinState.Low) {
          if (this.edges.length < 400) this.edges.push([p, s === GPIOPinState.High ? 1 : 0, this.simMs()]);
        }
      }),
    );
    mcu.core.PC = FLASH_START;
    this.applyAdc();
    this.start();
  }

  private flushTx(size: number) {
    const n = Math.min(size, this.txQueue.length);
    const b = new Uint8Array(this.txQueue.splice(0, n));
    this.sim.rp2040.usbCtrl.endpointReadDone((this.cdc as any).outEndpoint, b);
  }

  private send(s: string) {
    for (const c of new TextEncoder().encode(s)) this.txQueue.push(c);
    if (this.pendingRead >= 0 && this.txQueue.length) {
      const p = this.pendingRead;
      this.pendingRead = -1;
      this.flushTx(p);
    }
  }

  simMs() {
    return this.sim ? this.sim.clock.nanos / 1e6 : 0;
  }

  // ---------- 실시간 맞춤 실행 루프 ----------
  private start() {
    this.running = true;
    this.wallStart = performance.now();
    this.simStart = this.sim.clock.nanos;
    this.loop();
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private loop = () => {
    if (!this.running) return;
    const { sim } = this;
    const mcu = sim.rp2040;
    const clock = sim.clock;
    const t0 = performance.now();
    // 너무 뒤처지면 따라잡기를 포기 (무거운 코드일 때 화면이 멈추지 않게)
    let target = this.simStart + (t0 - this.wallStart) * 1e6;
    if (target - clock.nanos > 100e6) {
      this.simStart = clock.nanos - (t0 - this.wallStart) * 1e6 + 20e6;
      target = clock.nanos + 20e6;
    }
    const budgetEnd = t0 + 14;
    let n = 0;
    while (clock.nanos < target) {
      if (mcu.core.waiting) {
        const next = clock.nanosToNextAlarm;
        const room = target - clock.nanos;
        if (next <= 0 || next > room) {
          clock.tick(room);
          break;
        }
        clock.tick(next);
      } else {
        const cycles = mcu.core.executeInstruction();
        clock.tick(cycles * 8); // 125MHz
      }
      if (++n >= 4000) {
        n = 0;
        if (performance.now() > budgetEnd) break;
      }
    }
    const used = performance.now() - t0;
    this.busyMs += used;
    this.resolveInputs();
    this.report();
    this.timer = setTimeout(this.loop, 8);
    this.windowMs += 1;
  };

  // ---------- 입력 부품 (버튼, 가변저항) ----------
  setInputs(parts: InputPart[]) {
    this.inputs = parts;
    this.resolveInputs();
  }

  setAdc(channel: number, value01: number) {
    this.adc[channel] = Math.max(0, Math.min(1, value01));
    this.applyAdc();
  }

  private applyAdc() {
    if (!this.sim) return;
    const a = this.sim.rp2040.adc;
    for (let c = 0; c < 3; c++) a.channelValues[c] = Math.round(this.adc[c] * 4095);
  }

  private resolveInputs() {
    if (!this.sim) return;
    const gpio = this.sim.rp2040.gpio;
    const used = new Set<number>();
    for (const p of this.inputs) {
      used.add(p.pin);
      const g = gpio[p.pin];
      let level: boolean;
      if (p.pressed) level = p.activeLevel === 1;
      else if (g.pullupEnabled) level = true;
      else if (g.pulldownEnabled) level = false;
      else {
        // 실물처럼: 풀업/풀다운 없이 떠 있는 핀은 값이 흔들린다
        level = Math.random() < 0.5;
        if (!this.floatWarned.has(p.pin) && g.inputEnable && !g.outputEnable) {
          this.floatWarned.add(p.pin);
          this.emit({ t: 'float', pin: p.pin });
        }
      }
      if (g.inputValue !== level) g.setInputValue(level);
    }
    // 아무것도 연결되지 않은 입력 핀은 풀업/풀다운 설정을 따른다
    for (const p of WATCHED_PINS) {
      if (used.has(p) || p === 25) continue;
      const g = gpio[p];
      if (g.outputEnable || !g.inputEnable) continue;
      if (g.pullupEnabled && !g.pulldownEnabled && !g.inputValue) g.setInputValue(true);
      else if (g.pulldownEnabled && !g.pullupEnabled && g.inputValue) g.setInputValue(false);
    }
  }

  // ---------- 핀 상태 보고 ----------
  private report() {
    const mcu = this.sim.rp2040;
    const changed: PinReport[] = [];
    for (const p of WATCHED_PINS) {
      const g = mcu.gpio[p];
      const fn = g.functionSelect;
      let r: PinReport;
      const pull = g.pullupEnabled ? 'up' : g.pulldownEnabled ? 'down' : 'none';
      if (fn === 4) {
        const { duty, freq } = this.pwmOf(p);
        r = { pin: p, mode: 'pwm', level: duty > 0.5 ? 1 : 0, pull, duty, freq };
      } else if (fn === 5) {
        r = g.outputEnable
          ? { pin: p, mode: 'out', level: g.outputValue ? 1 : 0, pull }
          : { pin: p, mode: 'in', level: g.inputValue ? 1 : 0, pull };
      } else r = { pin: p, mode: 'off', level: 0, pull };
      const key = `${r.mode}|${r.level}|${r.pull}|${r.duty?.toFixed(3)}|${r.freq?.toFixed(0)}`;
      if (this.lastPins.get(p) !== key) {
        this.lastPins.set(p, key);
        changed.push(r);
      }
    }
    if (changed.length) this.emit({ t: 'pins', pins: changed });
    if (this.edges.length) {
      this.emit({ t: 'edges', edges: this.edges });
      this.edges = [];
    }
  }

  private pwmOf(pin: number) {
    const pwm = this.sim.rp2040.pwm as any;
    const ch = pwm.channels[(pin >> 1) & 7];
    const enabled = ch.csr & 1;
    const top = ch.top + 1;
    const level = pin & 1 ? ch.cc >>> 16 : ch.cc & 0xffff;
    const intDiv = (ch.div >> 4) & 0xff || 256;
    const div = intDiv + (ch.div & 0xf) / 16;
    const phaseCorrect = ch.csr & 2 ? 2 : 1;
    const clk = pwm.clockFreq || 125e6;
    if (!enabled) return { duty: 0, freq: 0 };
    return { duty: Math.min(level, top) / top, freq: clk / (div * top * phaseCorrect) };
  }

  // ---------- 코드 실행 (raw REPL) ----------
  run(code: string) {
    if (this.rxMode === 'boot') {
      this.queuedCode = code;
      return;
    }
    this.queuedCode = code;
    // 실행 중이면 먼저 멈춘다
    this.send('\r\x03\x03');
    this.rxMode = 'enter-raw';
    this.rxBuf = '';
    setTimeout(() => this.send('\x01'), 60);
  }

  interrupt() {
    this.send('\x03');
  }

  /** 콘솔에서 입력한 한 줄 (REPL 또는 input()) */
  typeLine(line: string) {
    this.send(line + '\r');
  }

  private onRx(d: Uint8Array) {
    const text = new TextDecoder().decode(d);
    switch (this.rxMode) {
      case 'boot': {
        this.rxBuf += text;
        const m = this.rxBuf.match(/MicroPython (v[\d.]+[^;]*);/);
        if (m) this.version = m[1];
        if (this.rxBuf.includes('>>> ')) {
          this.rxMode = 'friendly';
          this.emit({ t: 'ready', version: this.version });
          this.emit({ t: 'serial', text: this.rxBuf.replace(/^\s+/, '') });
          this.rxBuf = '';
          if (this.queuedCode != null) this.run(this.queuedCode);
        }
        break;
      }
      case 'friendly':
        this.emit({ t: 'serial', text });
        break;
      case 'enter-raw':
        this.rxBuf += text;
        if (this.rxBuf.includes('raw REPL; CTRL-B to exit\r\n>')) {
          this.rxBuf = '';
          this.rxMode = 'await-ok';
          const code = this.queuedCode ?? '';
          this.queuedCode = null;
          this.send(code.replace(/\r\n/g, '\n') + '\x04');
        }
        break;
      case 'await-ok':
        this.rxBuf += text;
        if (this.rxBuf.startsWith('OK')) {
          const rest = this.rxBuf.slice(2);
          this.rxBuf = '';
          this.rxMode = 'stdout';
          this.stderr = '';
          this.runStartNs = this.sim.clock.nanos;
          this.emit({ t: 'run-start' });
          if (rest) this.onRx(new TextEncoder().encode(rest));
        }
        break;
      case 'stdout': {
        const i = text.indexOf('\x04');
        if (i < 0) {
          this.emit({ t: 'stdout', text });
        } else {
          if (i > 0) this.emit({ t: 'stdout', text: text.slice(0, i) });
          this.rxMode = 'stderr';
          const rest = text.slice(i + 1);
          if (rest) this.onRx(new TextEncoder().encode(rest));
        }
        break;
      }
      case 'stderr': {
        const i = text.indexOf('\x04');
        if (i < 0) this.stderr += text;
        else {
          this.stderr += text.slice(0, i);
          this.rxMode = 'exit-raw';
          this.rxBuf = '';
          const err = this.stderr;
          this.report(); // 마지막 핀 변화를 먼저 보낸다
          this.emit({ t: 'run-end', ok: err.trim() === '', error: err, simMs: (this.sim.clock.nanos - this.runStartNs) / 1e6 });
          this.send('\x02'); // 친근한 REPL로 복귀
        }
        break;
      }
      case 'exit-raw':
        this.rxBuf += text;
        if (this.rxBuf.includes('>>> ')) {
          this.rxMode = 'friendly';
          this.rxBuf = '';
          this.emit({ t: 'serial', text: '>>> ' });
        }
        break;
    }
  }

  get isRunningCode() {
    return this.rxMode === 'stdout' || this.rxMode === 'stderr' || this.rxMode === 'await-ok' || this.rxMode === 'enter-raw';
  }
}
