// 실물 피코 연결 (Web Serial). 가상 칩과 똑같은 raw REPL 방식으로 코드를 보낸다.
// 크롬·엣지·웨일 등 크로미움 계열 브라우저 + https 페이지에서만 동작한다.

const PICO_VENDOR = 0x2e8a; // Raspberry Pi

export type RealEvents = {
  onText: (text: string) => void;
  onState: (s: 'disconnected' | 'connected' | 'running') => void;
  onRunEnd: (ok: boolean, error: string) => void;
};

export class RealPico {
  private port: any = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private buf = '';
  private waiters: { pat: string; resolve: (s: string) => void }[] = [];
  private mode: 'idle' | 'await-ok' | 'stdout' | 'stderr' = 'idle';
  private stderr = '';

  constructor(private ev: RealEvents) {}

  static supported() {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  get connected() {
    return !!this.port;
  }

  async connect() {
    const serial = (navigator as any).serial;
    const port = await serial.requestPort({ filters: [{ usbVendorId: PICO_VENDOR }] });
    await port.open({ baudRate: 115200 });
    this.port = port;
    this.writer = port.writable.getWriter();
    this.reader = port.readable.getReader();
    this.ev.onState('connected');
    this.readLoop();
    port.addEventListener?.('disconnect', () => this.cleanup());
  }

  async disconnect() {
    try { await this.reader?.cancel(); } catch {}
    try { this.writer?.releaseLock(); } catch {}
    try { await this.port?.close(); } catch {}
    this.cleanup();
  }

  private cleanup() {
    this.port = null;
    this.writer = null;
    this.reader = null;
    this.mode = 'idle';
    this.ev.onState('disconnected');
  }

  private async readLoop() {
    const dec = new TextDecoder();
    try {
      while (this.reader) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) this.onData(dec.decode(value, { stream: true }));
      }
    } catch {
      /* 연결 끊김 */
    }
    this.cleanup();
  }

  private onData(text: string) {
    if (this.mode === 'await-ok') {
      this.buf += text;
      const i = this.buf.indexOf('OK');
      if (i < 0) return;
      const rest = this.buf.slice(i + 2);
      this.buf = '';
      this.mode = 'stdout';
      if (rest) this.onData(rest);
      return;
    }
    if (this.mode === 'stdout' || this.mode === 'stderr') {
      for (const ch of text) {
        if (ch === '\x04') {
          if (this.mode === 'stdout') this.mode = 'stderr';
          else {
            this.mode = 'idle';
            const err = this.stderr;
            this.stderr = '';
            this.ev.onRunEnd(err.trim() === '', err);
            this.ev.onState('connected');
            this.write('\x02');
          }
        } else if (this.mode === 'stdout') this.ev.onText(ch);
        else this.stderr += ch;
      }
      return;
    }
    this.buf += text;
    for (const w of [...this.waiters]) {
      const i = this.buf.indexOf(w.pat);
      if (i >= 0) {
        const got = this.buf.slice(0, i + w.pat.length);
        this.buf = this.buf.slice(i + w.pat.length);
        this.waiters.splice(this.waiters.indexOf(w), 1);
        w.resolve(got);
      }
    }
    if (this.buf.length > 4096) this.buf = this.buf.slice(-1024);
  }

  private wait(pat: string, ms = 3000) {
    return new Promise<string>((resolve, reject) => {
      const w = { pat, resolve };
      this.waiters.push(w);
      setTimeout(() => {
        const i = this.waiters.indexOf(w);
        if (i >= 0) {
          this.waiters.splice(i, 1);
          reject(new Error('피코가 응답하지 않습니다. USB 케이블과 펌웨어를 확인하세요.'));
        }
      }, ms);
    });
  }

  private async write(s: string) {
    const bytes = new TextEncoder().encode(s);
    // 큰 코드는 조금씩 나눠 보낸다 (실물 USB 버퍼 보호)
    for (let i = 0; i < bytes.length; i += 256) {
      await this.writer!.write(bytes.subarray(i, i + 256));
      if (bytes.length > 256) await new Promise((r) => setTimeout(r, 10));
    }
  }

  private async enterRaw() {
    this.buf = '';
    await this.write('\r\x03\x03');
    await new Promise((r) => setTimeout(r, 100));
    this.buf = '';
    const p = this.wait('raw REPL; CTRL-B to exit\r\n>');
    await this.write('\x01');
    await p;
  }

  /** 코드를 실물 피코에서 바로 실행 (저장하지 않음, Thonny의 ▶ 실행과 같음) */
  async run(code: string) {
    await this.enterRaw();
    this.mode = 'await-ok';
    this.ev.onState('running');
    await this.write(code.replace(/\r\n/g, '\n') + '\x04');
  }

  /** main.py로 저장: 전원만 연결해도 실행된다 */
  async saveMain(code: string) {
    await this.enterRaw();
    const esc = JSON.stringify(code.replace(/\r\n/g, '\n'));
    const script = `f=open('main.py','w')\nf.write(${esc})\nf.close()\nprint('main.py 저장 완료')\n`;
    this.mode = 'await-ok';
    await this.write(script + '\x04');
  }

  async stop() {
    await this.write('\x03');
  }
}
