import { PicoClient } from '../engine/client';
import type { EngineEvent, PinReport } from '../engine/core';
import { RealPico } from '../real/serial';
import { BoardView } from './board';
import { createEditor } from './editor';
import { MISSIONS, Mission, Part, PartKind, PART_INFO, PINS, pinByGp, nearestPin, LED_COLORS, LED_COLOR_NAMES, ERROR_HELP } from './data';

declare const __UF2_B64__: string;
declare const __FW_VERSION__: string;
declare const __STANDALONE__: boolean;

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const store = {
  get(k: string) { try { return localStorage.getItem('picosim:' + k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem('picosim:' + k, v); } catch {} },
};

// ---------- 학습 기록 (대시보드 연동용 훅) ----------
// 모든 학습 행동을 이벤트로 남긴다. 플랫폼에 붙일 때 이 이벤트를 서버로 보내면 된다.
const learningLog: { t: number; type: string; data: any }[] = [];
function logEvent(type: string, data: any = {}) {
  const ev = { t: Date.now(), type, data };
  learningLog.push(ev);
  window.dispatchEvent(new CustomEvent('picosim:event', { detail: ev }));
}
(window as any).picosimLog = learningLog;
(window as any).picosimPins = () => Object.fromEntries(pins);

// ---------- 상태 ----------
let parts: Part[] = [{ id: 'p1', kind: 'led', gp: 15, color: 'red' }];
let mission: Mission = MISSIONS[0];
const passed = new Set<string>(JSON.parse(store.get('passed') || '[]'));
const pins = new Map<number, PinReport>();
let running = false;
let runEdges: [number, number, number][] = [];
let runStdout = '';
let runPins: { gp: number; freq: number; duty: number }[] = [];
let m3Seen = false;
let partSeq = 2;

// ---------- 화면 요소 ----------
const consoleEl = $('#console');
const statusEl = $('#engine-status');
const checkEl = $('#check');

function out(text: string, cls = '') {
  const span = document.createElement('span');
  if (cls) span.className = cls;
  span.textContent = text.replace(/\r/g, '');
  consoleEl.appendChild(span);
  while (consoleEl.childNodes.length > 1500) consoleEl.firstChild!.remove();
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

function toast(html: string, kind: 'warn' | 'info' = 'info') {
  const t = $('#toast');
  t.innerHTML = html;
  t.className = `toast ${kind}`;
  t.hidden = false;
  clearTimeout((t as any)._h);
  (t as any)._h = setTimeout(() => (t.hidden = true), 7000);
}

// ---------- 에디터 ----------
const editor = createEditor($('#editor'), store.get('code:' + mission.id) || mission.starter, (code, pasteLines) => {
  store.set('code:' + mission.id, code);
  editor.markError(null);
  if (pasteLines >= 5) logEvent('paste', { lines: pasteLines, mission: mission.id });
});

// ---------- 보드 ----------
function placePart(kind: PartKind, gp: number, moveId?: string): string | null {
    const allowed = PART_INFO[kind].allowed;
    if (allowed && !allowed.includes(gp)) {
      toast(`<b>${PART_INFO[kind].name}</b>는 아날로그 입력이 되는 <b>GP26·GP27·GP28</b>에만 연결할 수 있어요. (실물도 같아요)`, 'warn');
      return 'bad';
    }
    const occupied = parts.find((p) => p.gp === gp && p.id !== moveId);
    if (occupied) {
      toast(`GP${gp}에는 이미 ${PART_INFO[occupied.kind].name}가 연결돼 있어요. 다른 핀을 고르세요.`, 'warn');
      return 'busy';
    }
    if (moveId) {
      const p = parts.find((x) => x.id === moveId)!;
      logEvent('part-move', { kind, from: p.gp, to: gp });
      p.gp = gp;
    } else {
      const p: Part = { id: 'p' + partSeq++, kind, gp };
      if (kind === 'led') p.color = 'red';
      if (kind === 'button') p.wiring = 'gnd';
      if (kind === 'pot') p.value = 0.5;
      parts.push(p);
      logEvent('part-add', { kind, gp });
      board.selected = p.id;
    }
    partsChanged();
    return null;
}

const board = new BoardView($('#board'), {
  onPlace: placePart,
  onSelect(id) {
    renderInspector(id);
  },
  onPress(id, pressed) {
    const p = parts.find((x) => x.id === id);
    if (!p) return;
    p.pressed = pressed;
    syncInputs();
    board.update(parts, pins);
  },
  onPot(id, v) {
    const p = parts.find((x) => x.id === id);
    if (!p) return;
    p.value = v;
    client.adc(p.gp - 26, v);
  },
});

function partsChanged() {
  board.render(parts);
  board.update(parts, pins);
  syncInputs();
  for (const p of parts) if (p.kind === 'pot') client.adc(p.gp - 26, p.value ?? 0.5);
  renderNeeds();
  renderBridge();
}

function syncInputs() {
  client.inputs(
    parts
      .filter((p) => p.kind === 'button')
      .map((p) => ({ pin: p.gp, kind: 'button' as const, activeLevel: p.wiring === '3v3' ? (1 as const) : (0 as const), pressed: !!p.pressed })),
  );
}

function renderInspector(id: string | null) {
  const box = $('#inspector');
  const p = parts.find((x) => x.id === id);
  if (!p) {
    box.innerHTML = `<p class="muted">부품을 누르면 설정을 바꿀 수 있어요. 끌어서 다른 핀으로 옮길 수도 있어요.</p>`;
    return;
  }
  const pin = pinByGp(p.gp)!;
  let extra = '';
  if (p.kind === 'led') {
    extra = `<label class="field">색<select id="led-color">${Object.keys(LED_COLORS)
      .map((c) => `<option value="${c}" ${p.color === c ? 'selected' : ''}>${LED_COLOR_NAMES[c]}</option>`)
      .join('')}</select></label>`;
  } else if (p.kind === 'button') {
    extra = `<label class="field">다른 쪽 다리<select id="btn-wiring"><option value="gnd" ${p.wiring !== '3v3' ? 'selected' : ''}>GND (코드: Pin.PULL_UP)</option><option value="3v3" ${p.wiring === '3v3' ? 'selected' : ''}>3V3 (코드: Pin.PULL_DOWN)</option></select></label>`;
  }
  box.innerHTML = `<div class="insp-head"><b>${PART_INFO[p.kind].name}</b><span class="chip">GP${p.gp} · ${pin.phys}번 핀</span></div>
    <p class="muted">${PART_INFO[p.kind].hint}</p>${extra}
    <button class="btn ghost small" id="part-del" type="button">부품 빼기</button>`;
  $('#led-color')?.addEventListener('change', (e) => {
    p.color = (e.target as HTMLSelectElement).value;
    partsChanged();
  });
  $('#btn-wiring')?.addEventListener('change', (e) => {
    p.wiring = (e.target as HTMLSelectElement).value as any;
    partsChanged();
  });
  $('#part-del').addEventListener('click', () => {
    parts = parts.filter((x) => x.id !== p.id);
    logEvent('part-remove', { kind: p.kind, gp: p.gp });
    board.selected = null;
    partsChanged();
  });
}

// ---------- 팔레트 ----------
const palette = $('#palette');
(Object.keys(PART_INFO) as PartKind[]).forEach((k) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `pal-item k-${k}`;
  b.innerHTML = `<span class="pal-ico" aria-hidden="true"></span><span><b>${PART_INFO[k].name}</b><small>${PART_INFO[k].hint}</small></span>`;
  b.addEventListener('pointerdown', (e) => board.startDrag(e, k));
  // 누르기만 하면(끌지 않으면) 비어 있는 첫 핀에 연결 — 키보드로도 쓸 수 있다
  b.addEventListener('click', () => {
    if (performance.now() - board.lastDragEnd < 400) return;
    const allowed = PART_INFO[k].allowed ?? PINS.filter((p) => p.gp !== undefined).map((p) => p.gp!);
    const freePins = allowed.filter((gp) => !parts.some((p) => p.gp === gp));
    // 이웃 핀에 부품이 없는 자리를 먼저 고른다 (화면에서 겹치지 않게)
    const roomy = freePins.find((gp) => {
      const a = pinByGp(gp)!;
      return !parts.some((p) => {
        const b = pinByGp(p.gp)!;
        return b.side === a.side && Math.abs(b.row - a.row) <= 2;
      });
    });
    const free = roomy ?? freePins[0];
    if (free === undefined) toast('비어 있는 핀이 없어요.', 'warn');
    else placePart(k, free);
  });
  palette.appendChild(b);
});

// ---------- 미션 ----------
function renderMissionList() {
  $('#mission-list').innerHTML = MISSIONS.map(
    (m, i) =>
      `<button type="button" class="m-item ${m.id === mission.id ? 'cur' : ''} ${passed.has(m.id) ? 'done' : ''}" data-m="${m.id}" aria-current="${m.id === mission.id}"><span class="m-no">${i + 1}</span><span class="m-name">${m.title}</span><span class="m-state" aria-label="${passed.has(m.id) ? '통과' : ''}"></span></button>`,
  ).join('');
  document.querySelectorAll<HTMLButtonElement>('.m-item').forEach((b) =>
    b.addEventListener('click', () => {
      const m = MISSIONS.find((x) => x.id === b.dataset.m)!;
      if (m.id === mission.id) return;
      mission = m;
      editor.set(store.get('code:' + m.id) || m.starter);
      editor.markError(null);
      checkEl.hidden = true;
      logEvent('mission-open', { mission: m.id });
      renderMission();
    }),
  );
}

function renderNeeds() {
  const box = $('#needs');
  if (!mission.needs.length) {
    box.innerHTML = `<span class="need ok">부품 필요 없음 · 내장 LED 사용</span>`;
    return;
  }
  box.innerHTML = mission.needs
    .map((n) => {
      const ok = parts.some((p) => p.kind === n.kind && p.gp === n.gp);
      return `<span class="need ${ok ? 'ok' : ''}">${PART_INFO[n.kind].name} → GP${n.gp}</span>`;
    })
    .join('');
}

function renderMission() {
  renderMissionList();
  $('#m-title').textContent = mission.title;
  $('#m-goal').textContent = mission.goal;
  $('#m-hint').textContent = mission.hint;
  renderNeeds();
  const bl = $('#blocks');
  bl.innerHTML = '';
  for (const b of mission.blocks) {
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'code-block';
    d.draggable = true;
    d.innerHTML = `<span>${esc(b.label)}</span><code>${esc(b.code.trim())}</code>`;
    d.addEventListener('dragstart', (e) => e.dataTransfer?.setData('text/plain', b.code + '\n'));
    d.addEventListener('click', () => editor.insertLine(b.code));
    bl.appendChild(d);
  }
}

// ---------- 오류 해설 ----------
function explainError(err: string) {
  const lines = err.trim().split('\n');
  const last = lines[lines.length - 1].trim();
  const type = (last.match(/^(\w+(?:Error|Interrupt))/) || [])[1] || '';
  const lm = [...err.matchAll(/line (\d+)/g)].pop();
  const line = lm ? +lm[1] : null;
  return { type, line, last };
}

// ---------- 미션 점검 ----------
function showCheck(ok: boolean, msg: string) {
  checkEl.hidden = false;
  checkEl.className = `check ${ok ? 'pass' : 'fail'}`;
  checkEl.innerHTML = `<b>${ok ? '통과' : '아직이에요'}</b><span>${msg}</span>`;
  if (ok && !passed.has(mission.id)) {
    passed.add(mission.id);
    store.set('passed', JSON.stringify([...passed]));
    renderMissionList();
  }
  logEvent('checkpoint', { mission: mission.id, ok, msg });
}

function missingParts() {
  return mission.needs.filter((n) => !parts.some((p) => p.kind === n.kind && p.gp === n.gp));
}

function checkAtEnd(ok: boolean) {
  const miss = missingParts();
  if (miss.length) {
    showCheck(false, `회로를 확인하세요: ${miss.map((n) => `${PART_INFO[n.kind].name}를 GP${n.gp}에`).join(', ')} 연결해야 해요.`);
    return;
  }
  if (!ok) return;
  if (mission.id === 'm1') {
    const e = runEdges.filter((x) => x[0] === 25);
    const on = e.find((x) => x[1] === 1);
    const off = on && e.find((x) => x[1] === 0 && x[2] > on[2]);
    if (on && off && off[2] - on[2] >= 800) showCheck(true, `내장 LED가 ${((off[2] - on[2]) / 1000).toFixed(1)}초 동안 켜졌어요.`);
    else if (on && !off) showCheck(false, 'LED를 켰지만 끄지 않았어요.');
    else if (on && off) showCheck(false, `켜진 시간이 ${((off[2] - on[2]) / 1000).toFixed(2)}초예요. 1초 동안 켜 두세요.`);
    else showCheck(false, '내장 LED가 한 번도 켜지지 않았어요.');
  } else if (mission.id === 'm2') {
    const rises = runEdges.filter((x) => x[0] === 15 && x[1] === 1).length;
    if (rises >= 3) showCheck(true, `GP15 LED가 ${rises}번 켜졌어요.`);
    else showCheck(false, `GP15 LED가 ${rises}번 켜졌어요. 3번 깜빡여야 해요.`);
  } else if (mission.id === 'm5') {
    checkLive();
    if (checkEl.classList.contains('pass')) return;
    const fs = [...new Set(runPins.filter((x) => x.gp === 16 && x.duty > 0).map((x) => Math.round(x.freq)))];
    showCheck(false, fs.length ? `들린 음: ${fs.join(', ')}Hz. 262·294·330Hz가 모두 나와야 해요.` : 'GP16 부저에서 소리가 나지 않았어요.');
  } else if (mission.id === 'm6') {
    checkLive();
    if (!checkEl.classList.contains('pass')) showCheck(false, '0도, 90도, 180도를 모두 거쳐야 해요.');
  }
}

function checkLive() {
  if (!running && mission.id !== 'm5' && mission.id !== 'm6') return;
  if (checkEl.classList.contains('pass') && !checkEl.hidden) return;
  if (missingParts().length) return;
  if (mission.id === 'm3') {
    const btn = parts.find((p) => p.kind === 'button' && p.gp === 14);
    const led = pins.get(15);
    const ledOn = led?.mode === 'out' && led.level === 1;
    if (btn?.pressed && ledOn) m3Seen = true;
    if (m3Seen && !btn?.pressed && led?.mode === 'out' && led.level === 0) showCheck(true, '버튼을 누르면 켜지고, 떼면 꺼져요.');
  } else if (mission.id === 'm4') {
    const nums = (runStdout.match(/-?\d+(\.\d+)?/g) || []).map(Number);
    if (nums.length >= 2) {
      const span = Math.max(...nums) - Math.min(...nums);
      const big = Math.max(...nums) > 10 ? 3000 : 0.15;
      if (span >= big) showCheck(true, `값이 ${Math.min(...nums)} ~ ${Math.max(...nums)} 사이에서 바뀌었어요.`);
    }
  } else if (mission.id === 'm5') {
    const fs = runPins.filter((x) => x.gp === 16 && x.duty > 0).map((x) => x.freq);
    const has = (f: number) => fs.some((x) => Math.abs(x - f) / f < 0.03);
    if (has(262) && has(294) && has(330)) showCheck(true, '도·레·미를 모두 연주했어요.');
  } else if (mission.id === 'm6') {
    const angs = runPins.filter((x) => x.gp === 17 && x.freq > 30 && x.freq < 70).map((x) => ((x.duty / x.freq) * 1000 - 0.5) / 2 * 180);
    const has = (a: number) => angs.some((x) => Math.abs(x - a) < 10);
    if (has(0) && has(90) && has(180)) showCheck(true, '0도 → 90도 → 180도로 움직였어요.');
  }
}

// ---------- 소리 (수동 부저) ----------
let audio: AudioContext | null = null;
let osc: OscillatorNode | null = null;
let gain: GainNode | null = null;
let soundOn = false;
$('#sound').addEventListener('click', () => {
  soundOn = !soundOn;
  $('#sound').setAttribute('aria-pressed', String(soundOn));
  $('#sound').querySelector('span')!.textContent = soundOn ? '소리 켬' : '소리 끔';
  if (soundOn && !audio) {
    try {
      audio = new AudioContext();
      osc = audio.createOscillator();
      gain = audio.createGain();
      osc.type = 'square';
      gain.gain.value = 0;
      osc.connect(gain).connect(audio.destination);
      osc.start();
    } catch {}
  }
  updateSound();
});
function updateSound() {
  if (!audio || !osc || !gain) return;
  const bz = parts.find((p) => p.kind === 'buzzer');
  const r = bz && pins.get(bz.gp);
  const on = soundOn && r?.mode === 'pwm' && r.duty! > 0 && r.freq! > 20 && r.freq! < 20000;
  if (on) osc.frequency.setTargetAtTime(r!.freq!, audio.currentTime, 0.005);
  gain.gain.setTargetAtTime(on ? 0.04 : 0, audio.currentTime, 0.01);
}

// ---------- 가상 칩 ----------
function b64ToBytes(b64: string) {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
const uf2 = b64ToBytes(__UF2_B64__);

function setStatus(s: 'boot' | 'idle' | 'run', text: string) {
  statusEl.className = `status ${s}`;
  statusEl.querySelector('span')!.textContent = text;
  $('#run').toggleAttribute('disabled', s === 'boot');
  $('#stop').toggleAttribute('disabled', s !== 'run');
}

let rafPending = false;
function scheduleDraw() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    board.update(parts, pins);
    updateSound();
    renderPinStrip();
    checkLive();
  });
}

const client = new PicoClient(uf2, (e: EngineEvent) => {
  switch (e.t) {
    case 'ready':
      setStatus('idle', '대기 중');
      $('#fw-ver').textContent = `MicroPython ${e.version.split(' ')[0]}`;
      break;
    case 'serial':
      out(e.text, 'repl');
      break;
    case 'stdout':
      out(e.text);
      runStdout += e.text;
      checkLive();
      break;
    case 'run-start':
      running = true;
      setStatus('run', '실행 중');
      break;
    case 'run-end': {
      running = false;
      setStatus('idle', '대기 중');
      if (e.ok) {
        out(`\n— 실행 끝 (${(e.simMs / 1000).toFixed(2)}초)\n`, 'sys');
        logEvent('run-end', { ok: true, mission: mission.id, ms: Math.round(e.simMs) });
      } else {
        const { type, line, last } = explainError(e.error);
        out(e.error, type === 'KeyboardInterrupt' ? 'sys' : 'err');
        if (type !== 'KeyboardInterrupt') {
          editor.markError(line);
          const help = ERROR_HELP[type] || '오류 메시지의 마지막 줄과 줄 번호를 먼저 읽어 보세요.';
          out(`↳ ${line ? line + '번째 줄 · ' : ''}${help}\n`, 'help');
          logEvent('error', { mission: mission.id, type, line, msg: last });
        } else logEvent('stop', { mission: mission.id });
      }
      checkAtEnd(e.ok || /KeyboardInterrupt/.test(e.error));
      break;
    }
    case 'pins':
      for (const p of e.pins) {
        pins.set(p.pin, p);
        if (running && p.mode === 'pwm') runPins.push({ gp: p.pin, freq: p.freq!, duty: p.duty! });
        if (p.mode === 'in') warnPullMismatch(p);
      }
      scheduleDraw();
      break;
    case 'edges':
      if (running) runEdges.push(...e.edges);
      break;
    case 'float':
      if (parts.some((p) => p.gp === e.pin))
        toast(`<b>GP${e.pin}</b> 입력 핀이 떠 있어요. 실물에서도 값이 제멋대로 바뀌어요. <code>Pin.PULL_UP</code>이나 <code>Pin.PULL_DOWN</code>을 넣으세요.`, 'warn');
      break;
  }
});

const warned = new Set<string>();
function warnPullMismatch(p: PinReport) {
  const b = parts.find((x) => x.kind === 'button' && x.gp === p.pin);
  if (!b) return;
  const bad = (b.wiring !== '3v3' && p.pull === 'down') || (b.wiring === '3v3' && p.pull === 'up');
  const key = `${p.pin}:${p.pull}:${b.wiring}`;
  if (bad && !warned.has(key)) {
    warned.add(key);
    toast(
      b.wiring === '3v3'
        ? `버튼이 <b>3V3</b>에 연결됐는데 <code>PULL_UP</code>이에요. 눌러도 값이 바뀌지 않아요. <code>PULL_DOWN</code>으로 바꾸세요.`
        : `버튼이 <b>GND</b>에 연결됐는데 <code>PULL_DOWN</code>이에요. 눌러도 값이 바뀌지 않아요. <code>PULL_UP</code>으로 바꾸세요.`,
      'warn',
    );
  }
}

function renderPinStrip() {
  const used = [25, ...parts.map((p) => p.gp)];
  $('#pinstrip').innerHTML = used
    .map((gp) => {
      const r = pins.get(gp);
      let v = '—';
      let cls = 'off';
      if (r?.mode === 'out') { v = r.level ? 'HIGH' : 'LOW'; cls = r.level ? 'hi' : 'lo'; }
      else if (r?.mode === 'in') { v = `입력 ${r.level}`; cls = r.level ? 'hi' : 'lo'; }
      else if (r?.mode === 'pwm') { v = `PWM ${Math.round(r.freq!)}Hz ${Math.round(r.duty! * 100)}%`; cls = 'pwm'; }
      return `<span class="ps ${cls}"><b>GP${gp}</b>${v}</span>`;
    })
    .join('');
}

// ---------- 실행 버튼 ----------
$('#run').addEventListener('click', () => {
  const code = editor.get();
  editor.markError(null);
  checkEl.hidden = true;
  checkEl.className = 'check';
  runEdges = [];
  runStdout = '';
  runPins = [];
  m3Seen = false;
  out(`\n▶ 가상 피코에서 실행\n`, 'sys');
  logEvent('run', { mission: mission.id, code, parts: parts.map((p) => `${p.kind}@GP${p.gp}`) });
  client.run(code);
});
$('#stop').addEventListener('click', () => client.interrupt());
$('#reset').addEventListener('click', () => {
  pins.clear();
  running = false;
  setStatus('boot', '재부팅 중');
  out('\n↺ 가상 피코를 다시 켭니다 (전원 뽑았다 꽂기와 같아요)\n', 'sys');
  client.reset();
  syncInputs();
  logEvent('reset');
});
$('#clear').addEventListener('click', () => (consoleEl.innerHTML = ''));
$('#repl-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const inp = $<HTMLInputElement>('#repl-in');
  out(inp.value + '\n', 'you');
  client.line(inp.value);
  logEvent('repl', { line: inp.value });
  inp.value = '';
});

// ---------- 탭 ----------
function setTab(t: 'sim' | 'bridge') {
  $('#view-sim').hidden = t !== 'sim';
  $('#view-bridge').hidden = t !== 'bridge';
  document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String((b as HTMLElement).dataset.tab === t)));
  if (t === 'bridge') renderBridge();
  logEvent('tab', { tab: t });
}
document.querySelectorAll<HTMLButtonElement>('.tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab as any)));
if (location.hash === '#bridge') setTab('bridge');

// ---------- 실물로 옮기기 ----------
const CHECKS: Record<PartKind | 'common', string[]> = {
  common: [
    '충전 전용이 아닌 <b>데이터용</b> USB 케이블인가요?',
    '배선을 바꿀 때는 USB를 먼저 뽑았나요?',
    '피코 핀이 브레드보드 가운데 홈을 사이에 두고 양쪽에 꽂혔나요?',
  ],
  led: ['LED의 <b>긴 다리(+)</b>가 GP 핀 쪽, 짧은 다리가 GND 쪽인가요?', '220Ω(또는 330Ω) 저항을 LED와 <b>직렬</b>로 넣었나요? 가상 보드에서는 자동으로 들어가 있어요.'],
  button: ['버튼이 브레드보드 가운데 홈을 <b>가로질러</b> 꽂혔나요?', '같은 줄에 있는 두 다리는 원래 연결돼 있어요. <b>대각선</b> 다리를 쓰면 안전해요.', '다른 쪽 다리 연결(GND/3V3)과 코드의 PULL_UP/PULL_DOWN이 맞나요?'],
  pot: ['가운데 다리가 GP26~28(ADC)에, 양쪽 끝이 3V3와 GND에 연결됐나요?', '값이 거꾸로 움직이면 양쪽 끝 다리를 바꿔 꽂으면 돼요.'],
  buzzer: ['키트의 부저가 <b>수동형</b>인가요? 능동형은 켜기만 해도 한 가지 음만 나요.', '부저의 + 표시가 GP 핀 쪽인가요?'],
  servo: ['갈색=GND, 빨강=<b>VBUS(5V, 40번 핀)</b>, 주황=신호(GP) 순서로 연결했나요?', '서보는 전류를 많이 써요. 움직일 때 피코가 재부팅되면 외부 전원을 쓰세요.'],
};

function wiringRows() {
  return parts.map((p) => {
    const pin = pinByGp(p.gp)!;
    const gnd = nearestPin(p.gp, ['GND']);
    const v33 = PINS.find((x) => x.name === '3V3(OUT)')!;
    const vbus = PINS.find((x) => x.name === 'VBUS')!;
    let other = '';
    let extra = '';
    switch (p.kind) {
      case 'led': other = `GND (${gnd.phys}번)`; extra = `220Ω 저항 · ${LED_COLOR_NAMES[p.color || 'red']} LED 긴 다리 → GP`; break;
      case 'button': other = p.wiring === '3v3' ? `3V3 (${v33.phys}번)` : `GND (${gnd.phys}번)`; extra = p.wiring === '3v3' ? '코드: Pin.PULL_DOWN' : '코드: Pin.PULL_UP'; break;
      case 'pot': other = `3V3 (${v33.phys}번) · AGND (33번)`; extra = '가운데 다리 → GP'; break;
      case 'buzzer': other = `GND (${gnd.phys}번)`; extra = '+ 표시 → GP'; break;
      case 'servo': other = `VBUS 5V (${vbus.phys}번) · GND (${gnd.phys}번)`; extra = '주황 선 → GP'; break;
    }
    return `<tr><td>${PART_INFO[p.kind].name}</td><td><b>GP${p.gp}</b> <span class="muted">(${pin.phys}번 핀)</span></td><td>${other}</td><td>${extra}</td></tr>`;
  });
}

function renderBridge() {
  const rows = wiringRows();
  $('#wiring').innerHTML = rows.length
    ? `<div class="table-wrap"><table><thead><tr><th>부품</th><th>피코 핀</th><th>다른 쪽 연결</th><th>주의</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`
    : `<p class="muted">가상 보드에 부품이 없어요. 내장 LED만 쓰는 코드라면 배선 없이 바로 실행할 수 있어요.</p>`;
  const kinds = [...new Set(parts.map((p) => p.kind))];
  $('#checklist').innerHTML = [
    ...CHECKS.common.map((c) => ['공통', c]),
    ...kinds.flatMap((k) => CHECKS[k].map((c) => [PART_INFO[k].name, c])),
  ]
    .map(([k, c], i) => `<li><input type="checkbox" id="ck${i}"><label for="ck${i}"><span class="ck-k">${k}</span>${c}</label></li>`)
    .join('');
}

// 펌웨어 안내
$('#fw-note').innerHTML = `가상 피코는 <b>MicroPython ${__FW_VERSION__}</b> (Raspberry Pi Pico용) 펌웨어를 그대로 실행합니다. 실물 피코에도 <b>같은 버전</b>을 설치하면 오류 메시지와 동작이 똑같아요.`;
if (__STANDALONE__) {
  $('#fw-dl').hidden = false;
  $('#fw-dl').addEventListener('click', () => download(`micropython-${__FW_VERSION__}-RPI_PICO.uf2`, uf2, 'application/octet-stream'));
  $('#main-dl').hidden = false;
  $('#main-dl').addEventListener('click', () => {
    download('main.py', new TextEncoder().encode(editor.get()), 'text/x-python');
    logEvent('download-main');
  });
}
function download(name: string, data: Uint8Array, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

$('#copy-code').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(editor.get());
    toast('코드를 복사했어요. Thonny에 붙여 넣고 <b>main.py</b>로 저장하세요.');
  } catch {
    const ta = $<HTMLTextAreaElement>('#copy-fallback');
    ta.hidden = false;
    ta.value = editor.get();
    ta.select();
    toast('복사가 막혀 있어요. 아래 칸의 코드를 직접 복사하세요 (Ctrl+C).', 'warn');
  }
  logEvent('copy-code');
});

// 실물 피코 (Web Serial)
const real = new RealPico({
  onText: (t) => out(t, 'real'),
  onState: (s) => {
    $('#real-state').textContent = s === 'disconnected' ? '연결 안 됨' : s === 'running' ? '실물에서 실행 중' : '연결됨';
    $('#real-state').className = `chip ${s}`;
    $('#real-connect').textContent = s === 'disconnected' ? '피코 연결' : '연결 끊기';
    for (const id of ['#real-run', '#real-save']) $(id).toggleAttribute('disabled', s !== 'connected');
    $('#real-stop').toggleAttribute('disabled', s !== 'running');
  },
  onRunEnd: (ok, err) => {
    if (ok) out('\n— [실물] 실행 끝\n', 'sys');
    else {
      out(err, 'err real');
      const { type, line } = explainError(err);
      if (type && type !== 'KeyboardInterrupt') out(`↳ [실물] ${line ? line + '번째 줄 · ' : ''}${ERROR_HELP[type] || ''}\n`, 'help');
    }
    logEvent('real-run-end', { ok, error: err.trim().split('\n').pop() });
  },
});
$('#real-connect').addEventListener('click', async () => {
  if (real.connected) return real.disconnect();
  if (!RealPico.supported()) {
    $('#real-msg').innerHTML = '이 브라우저는 USB 시리얼(Web Serial)을 지원하지 않아요. <b>크롬, 엣지, 웨일</b>에서 열어 주세요.';
    return;
  }
  try {
    await real.connect();
    $('#real-msg').textContent = '';
    logEvent('real-connect');
  } catch (err: any) {
    const blocked = /policy|Security|not allowed|disallowed/i.test(String(err?.message || err));
    $('#real-msg').innerHTML = blocked
      ? '이 화면에서는 USB 연결이 막혀 있어요. 학교 배포 주소(설치 버전)에서 열거나, 아래 <b>코드 복사</b> 후 Thonny를 쓰세요.'
      : err?.name === 'NotFoundError'
        ? '피코를 고르지 않았어요. USB를 꽂고 목록에서 <b>Board in FS mode</b>(또는 Pico)를 고르세요.'
        : `연결하지 못했어요: ${esc(String(err?.message || err))}. Thonny가 열려 있다면 닫고 다시 시도하세요.`;
  }
});
$('#real-run').addEventListener('click', async () => {
  out('\n▶ [실물] 피코에서 실행\n', 'sys');
  logEvent('real-run', { code: editor.get() });
  try { await real.run(editor.get()); } catch (err: any) { out(String(err.message) + '\n', 'err'); }
});
$('#real-save').addEventListener('click', async () => {
  try { await real.saveMain(editor.get()); logEvent('real-save'); } catch (err: any) { out(String(err.message) + '\n', 'err'); }
});
$('#real-stop').addEventListener('click', () => real.stop());

// ---------- 시작 ----------
renderMission();
board.render(parts);
renderInspector(null);
renderPinStrip();
setStatus('boot', '켜는 중');
client.start().then(() => {
  syncInputs();
  logEvent('open');
});
