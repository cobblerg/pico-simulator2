// 화면 쪽에서 가상 칩을 다루는 창구. Worker를 쓸 수 없으면 같은 스레드에서 실행한다.
import type { EngineEvent, InputPart } from './core';

declare const __WORKER_SRC__: string;

export class PicoClient {
  private worker: Worker | null = null;
  private local: any = null;

  constructor(
    private uf2: Uint8Array,
    private onEvent: (e: EngineEvent) => void,
  ) {}

  async start() {
    try {
      const url = URL.createObjectURL(new Blob([__WORKER_SRC__], { type: 'text/javascript' }));
      const w = new Worker(url);
      w.onmessage = (ev) => this.onEvent(ev.data);
      await new Promise<void>((resolve, reject) => {
        w.onerror = (e) => reject(e);
        setTimeout(resolve, 50);
        w.postMessage({ cmd: 'init', uf2: this.uf2.slice().buffer });
      });
      w.onerror = null;
      this.worker = w;
    } catch {
      // Worker를 막는 환경: 메인 스레드에서 실행
      const { PicoEngine } = await import('./core');
      this.local = new PicoEngine(this.uf2, (e) => this.onEvent(e));
      this.local.boot();
    }
  }

  private cmd(m: any) {
    if (this.worker) this.worker.postMessage(m);
    else if (this.local) {
      const l = this.local;
      if (m.cmd === 'reset') l.boot();
      else if (m.cmd === 'run') l.run(m.code);
      else if (m.cmd === 'interrupt') l.interrupt();
      else if (m.cmd === 'line') l.typeLine(m.line);
      else if (m.cmd === 'inputs') l.setInputs(m.parts);
      else if (m.cmd === 'adc') l.setAdc(m.channel, m.value);
    }
  }

  reset() { this.cmd({ cmd: 'reset' }); }
  run(code: string) { this.cmd({ cmd: 'run', code }); }
  interrupt() { this.cmd({ cmd: 'interrupt' }); }
  line(line: string) { this.cmd({ cmd: 'line', line }); }
  inputs(parts: InputPart[]) { this.cmd({ cmd: 'inputs', parts }); }
  adc(channel: number, value: number) { this.cmd({ cmd: 'adc', channel, value }); }
}
