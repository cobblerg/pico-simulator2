// Web Worker: 가상 칩을 화면과 다른 스레드에서 실행해 화면이 멈추지 않게 한다.
import { PicoEngine } from './core';

let engine: PicoEngine | null = null;
const post = (e: any) => (self as any).postMessage(e);

self.onmessage = (ev: MessageEvent) => {
  const m = ev.data;
  switch (m.cmd) {
    case 'init':
      engine = new PicoEngine(new Uint8Array(m.uf2), post);
      engine.boot();
      break;
    case 'reset':
      engine?.boot();
      break;
    case 'run':
      engine?.run(m.code);
      break;
    case 'interrupt':
      engine?.interrupt();
      break;
    case 'line':
      engine?.typeLine(m.line);
      break;
    case 'inputs':
      engine?.setInputs(m.parts);
      break;
    case 'adc':
      engine?.setAdc(m.channel, m.value);
      break;
  }
};
