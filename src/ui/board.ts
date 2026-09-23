// 가상 피코 보드 + 부품 (SVG). 부품을 핀으로 끌어다 놓으면 자동으로 연결된다.
import { PINS, PinDef, Part, PartKind, PART_INFO, LED_COLORS } from './data';
import type { PinReport } from '../engine/core';

const NS = 'http://www.w3.org/2000/svg';
const W = 640;
const BX = 235; // 보드 왼쪽
const BW = 170;
const BY = 30;
const BH = 450;
const PIN_Y0 = BY + 38;
const PITCH = 20.4;
const PART_NEAR = 72;
const PART_FAR = 168;

const el = (tag: string, attrs: Record<string, any> = {}, parent?: Element) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  parent?.appendChild(e);
  return e as SVGElement;
};

export function pinXY(p: PinDef) {
  return { x: p.side === 'L' ? BX + 12 : BX + BW - 12, y: PIN_Y0 + p.row * PITCH };
}

type Handlers = {
  onPlace: (kind: PartKind, gp: number, moveId?: string) => string | null; // 오류 메시지 또는 null
  onSelect: (id: string | null) => void;
  onPress: (id: string, pressed: boolean) => void;
  onPot: (id: string, v: number) => void;
};

export class BoardView {
  svg: SVGSVGElement;
  private partsLayer: SVGElement;
  private labelsLayer: SVGElement;
  private pinEls = new Map<number, SVGElement>();
  private onboard!: SVGElement;
  private partEls = new Map<string, SVGElement>();
  private dropHi: SVGElement;
  selected: string | null = null;
  lastDragEnd = 0;

  constructor(host: HTMLElement, private h: Handlers) {
    const svg = el('svg', { viewBox: `0 0 ${W} ${BY + BH + 30}`, class: 'board-svg', role: 'img', 'aria-label': '가상 라즈베리파이 피코 보드' }) as SVGSVGElement;
    host.appendChild(svg);
    this.svg = svg;
    this.drawBoard();
    this.dropHi = el('rect', { class: 'drop-hi', rx: 6, width: 0, height: 0 }, svg);
    this.partsLayer = el('g', {}, svg);
    this.labelsLayer = el('g', {}, svg); // 글씨는 전선 위에
    svg.addEventListener('pointerdown', (e) => {
      if (e.target === svg || (e.target as Element).closest('.pcb')) this.select(null);
    });
  }

  private drawBoard() {
    const g = el('g', { class: 'pcb' }, this.svg);
    el('rect', { x: BX, y: BY, width: BW, height: BH, rx: 10, class: 'pcb-body' }, g);
    // 모서리 구멍
    for (const [x, y] of [[BX + 18, BY + 14], [BX + BW - 18, BY + 14], [BX + 18, BY + BH - 14], [BX + BW - 18, BY + BH - 14]]) {
      el('circle', { cx: x, cy: y, r: 5, class: 'pcb-hole' }, g);
    }
    // USB
    el('rect', { x: BX + BW / 2 - 24, y: BY - 12, width: 48, height: 26, rx: 3, class: 'usb' }, g);
    el('text', { x: BX + BW / 2, y: BY + 5, class: 'usb-t', 'text-anchor': 'middle' }, g).textContent = 'USB';
    // BOOTSEL
    el('rect', { x: BX + BW / 2 + 20, y: BY + 44, width: 20, height: 16, rx: 3, class: 'bootsel' }, g);
    el('text', { x: BX + BW / 2 + 30, y: BY + 72, class: 'silk', 'text-anchor': 'middle' }, g).textContent = 'BOOTSEL';
    // 내장 LED (GP25)
    this.onboard = el('rect', { x: BX + BW / 2 - 44, y: BY + 46, width: 12, height: 8, rx: 2, class: 'onboard-led' }, g);
    el('text', { x: BX + BW / 2 - 38, y: BY + 72, class: 'silk', 'text-anchor': 'middle' }, g).textContent = 'LED';
    // RP2040
    el('rect', { x: BX + BW / 2 - 30, y: BY + 190, width: 60, height: 60, rx: 4, class: 'chip' }, g);
    el('text', { x: BX + BW / 2, y: BY + 218, class: 'chip-t', 'text-anchor': 'middle' }, g).textContent = 'RP2040';
    el('text', { x: BX + BW / 2, y: BY + 232, class: 'chip-t2', 'text-anchor': 'middle' }, g).textContent = '가상 칩';
    el('rect', { x: BX + BW / 2 - 18, y: BY + 290, width: 36, height: 22, rx: 2, class: 'chip' }, g);
    el('text', { x: BX + BW / 2, y: BY + BH - 30, class: 'silk big', 'text-anchor': 'middle' }, g).textContent = 'Raspberry Pi Pico';

    for (const p of PINS) {
      const { x, y } = pinXY(p);
      const pg = el('g', { class: `pin ${p.gp !== undefined ? 'gp' : 'pwr'} ${p.name.includes('GND') ? 'gnd' : ''}`, 'data-phys': p.phys }, g);
      el('circle', { cx: x, cy: y, r: 7, class: 'pad' }, pg);
      el('circle', { cx: x, cy: y, r: 3, class: 'pad-hole' }, pg);
      const t = el('text', { x: p.side === 'L' ? x + 12 : x - 12, y: y + 3.5, class: 'pin-t', 'text-anchor': p.side === 'L' ? 'start' : 'end' }, pg);
      t.textContent = p.name;
      const n = el('text', { x: p.side === 'L' ? BX - 6 : BX + BW + 6, y: y + 3, class: 'phys-t', 'text-anchor': p.side === 'L' ? 'end' : 'start' }, pg);
      n.textContent = String(p.phys);
      el('title', {}, pg).textContent = `${p.name} · ${p.phys}번 핀`;
      if (p.gp !== undefined) this.pinEls.set(p.gp, pg);
    }
  }

  /** 화면 좌표 → SVG 좌표 */
  toSvg(cx: number, cy: number) {
    const pt = this.svg.createSVGPoint();
    pt.x = cx;
    pt.y = cy;
    const m = this.svg.getScreenCTM();
    return m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 };
  }

  /** 끌고 있는 위치에서 가장 가까운 GP 핀 */
  pinAt(cx: number, cy: number): PinDef | null {
    const { x, y } = this.toSvg(cx, cy);
    if (y < BY - 20 || y > BY + BH + 20 || x < -20 || x > W + 20) return null;
    const side = x < BX + BW / 2 ? 'L' : 'R';
    let best: PinDef | null = null;
    let bd = 1e9;
    for (const p of PINS) {
      if (p.side !== side || p.gp === undefined) continue;
      const d = Math.abs(pinXY(p).y - y);
      if (d < bd) { bd = d; best = p; }
    }
    return bd < 16 ? best : null;
  }

  showDrop(p: PinDef | null, ok = true) {
    if (!p) {
      this.dropHi.setAttribute('width', '0');
      return;
    }
    const { y } = pinXY(p);
    const x = p.side === 'L' ? 4 : BX + BW / 2;
    this.dropHi.setAttribute('x', String(x));
    this.dropHi.setAttribute('y', String(y - 11));
    this.dropHi.setAttribute('width', String(p.side === 'L' ? BX + BW / 2 - 4 : W - BX - BW / 2 - 4));
    this.dropHi.setAttribute('height', '22');
    this.dropHi.setAttribute('class', `drop-hi ${ok ? 'ok' : 'bad'}`);
  }

  select(id: string | null) {
    this.selected = id;
    this.partEls.forEach((g, pid) => g.classList.toggle('sel', pid === id));
    this.h.onSelect(id);
  }

  render(parts: Part[]) {
    this.partsLayer.innerHTML = '';
    this.labelsLayer.innerHTML = '';
    this.partEls.clear();
    for (const part of parts) this.drawPart(part);
    if (this.selected && !parts.find((p) => p.id === this.selected)) this.select(null);
    else this.select(this.selected);
  }

  private drawPart(part: Part) {
    const pin = PINS.find((p) => p.gp === part.gp)!;
    const { x: px, y } = pinXY(pin);
    const left = pin.side === 'L';
    const dx = pin.row % 2 ? PART_FAR : PART_NEAR; // 이웃 핀 부품이 겹치지 않게 두 줄로
    const cx = left ? BX - dx : BX + BW + dx;
    const info = PART_INFO[part.kind];
    const g = el('g', { class: `part part-${part.kind}`, 'data-id': part.id, tabindex: 0, role: 'button', 'aria-label': `${info.name} GP${part.gp}` }, this.partsLayer);
    // 전선
    const edge = left ? cx + 26 : cx - 26;
    el('path', { d: `M${px} ${y} L${left ? BX - 2 : BX + BW + 2} ${y} L${edge} ${y}`, class: 'wire', stroke: info.wire }, g);
    const body = el('g', { class: 'part-body', transform: `translate(${cx} ${y})` }, g);
    const label = (txt: string, dy = 25) => {
      const t = el('text', { x: cx, y: y + dy, class: 'part-t', 'text-anchor': 'middle', 'data-for': part.id }, this.labelsLayer);
      t.textContent = txt;
      return t;
    };

    switch (part.kind) {
      case 'led': {
        const c = LED_COLORS[part.color || 'red'];
        el('circle', { r: 17, class: 'led-glow', fill: c, opacity: 0 }, body);
        el('path', { d: 'M-10 6 L-10 -4 A10 10 0 0 1 10 -4 L10 6 Z', class: 'led-lens', fill: c }, body);
        el('rect', { x: -12, y: 6, width: 24, height: 3, rx: 1, class: 'led-rim', fill: c }, body);
        label('LED → GND');
        break;
      }
      case 'button': {
        el('rect', { x: -14, y: -14, width: 28, height: 28, rx: 4, class: 'btn-base' }, body);
        const cap = el('circle', { r: 9, class: 'btn-cap' }, body);
        cap.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          (e.target as Element).setPointerCapture((e as PointerEvent).pointerId);
          this.h.onPress(part.id, true);
        });
        const up = () => this.h.onPress(part.id, false);
        cap.addEventListener('pointerup', up);
        cap.addEventListener('pointercancel', up);
        label(part.wiring === '3v3' ? '누름 → 3V3' : '누름 → GND', 26);
        break;
      }
      case 'pot': {
        el('rect', { x: -38, y: -5, width: 76, height: 10, rx: 5, class: 'pot-track' }, body);
        const fill = el('rect', { x: -38, y: -5, width: 76 * (part.value ?? 0.5), height: 10, rx: 5, class: 'pot-fill' }, body);
        const knob = el('circle', { cx: -38 + 76 * (part.value ?? 0.5), cy: 0, r: 10, class: 'pot-knob' }, body);
        const val = label('', 22);
        const set = (v: number) => {
          knob.setAttribute('cx', String(-38 + 76 * v));
          fill.setAttribute('width', String(76 * v));
          val.textContent = `${(v * 3.3).toFixed(2)} V`;
        };
        set(part.value ?? 0.5);
        knob.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          const pe = e as PointerEvent;
          (knob as Element).setPointerCapture(pe.pointerId);
          const move = (ev: PointerEvent) => {
            const { x } = this.toSvg(ev.clientX, ev.clientY);
            const v = Math.max(0, Math.min(1, (x - cx + 38) / 76));
            set(v);
            this.h.onPot(part.id, v);
          };
          const stop = () => {
            knob.removeEventListener('pointermove', move as any);
            knob.removeEventListener('pointerup', stop);
          };
          knob.addEventListener('pointermove', move as any);
          knob.addEventListener('pointerup', stop);
        });
        break;
      }
      case 'buzzer': {
                el('circle', { r: 3, class: 'buzz-hole' }, body);
        el('circle', { r: 13, class: 'buzz-body' }, body);
        el('path', { d: 'M18 -8 Q24 0 18 8 M23 -12 Q31 0 23 12', class: 'buzz-wave', opacity: 0 }, body);
        label('', 25);
        break;
      }
      case 'servo': {
        el('rect', { x: -22, y: -12, width: 44, height: 24, rx: 3, class: 'servo-body' }, body);
        el('circle', { cx: 8, cy: 0, r: 5, class: 'servo-hub' }, body);
        el('rect', { x: 6, y: -2.5, width: 18, height: 5, rx: 2.5, class: 'servo-arm', transform: 'rotate(-90 8 0)' }, body);
        label('', 25);
        break;
      }
    }

    // 선택·이동
    g.addEventListener('pointerdown', (e) => {
      const pe = e as PointerEvent;
      if (pe.button !== 0) return;
      this.startDrag(pe, part.kind, part.id);
    });
    g.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') this.select(part.id);
    });
    this.partEls.set(part.id, g);
  }

  /** 팔레트나 배치된 부품에서 끌기 시작 */
  startDrag(e: PointerEvent, kind: PartKind, moveId?: string) {
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    const ghost = document.createElement('div');
    ghost.className = `drag-ghost k-${kind}`;
    ghost.textContent = PART_INFO[kind].name;
    const place = (cx: number, cy: number) => {
      ghost.style.transform = `translate(${cx + 10}px, ${cy + 10}px)`;
    };
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
      if (!moved) {
        moved = true;
        document.body.appendChild(ghost);
        document.body.classList.add('dragging');
      }
      place(ev.clientX, ev.clientY);
      const p = this.pinAt(ev.clientX, ev.clientY);
      const allowed = PART_INFO[kind].allowed;
      this.showDrop(p, !!p && (!allowed || allowed.includes(p.gp!)));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      ghost.remove();
      document.body.classList.remove('dragging');
      this.showDrop(null);
      if (!moved) {
        if (moveId) this.select(moveId);
        return;
      }
      this.lastDragEnd = performance.now();
      const p = this.pinAt(ev.clientX, ev.clientY);
      if (p) this.h.onPlace(kind, p.gp!, moveId);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /** 가상 칩의 핀 상태를 부품 모양에 반영 */
  update(parts: Part[], pins: Map<number, PinReport>) {
    const ob = pins.get(25);
    const obOn = ob && (ob.mode === 'out' ? ob.level : ob.mode === 'pwm' ? ob.duty! : 0);
    this.onboard.style.setProperty('--on', String(obOn || 0));
    this.onboard.classList.toggle('on', !!obOn);
    for (const part of parts) {
      const g = this.partEls.get(part.id);
      if (!g) continue;
      const r = pins.get(part.gp);
      const pinEl = this.pinEls.get(part.gp);
      const high = r && (r.mode === 'out' || r.mode === 'in') && r.level === 1;
      pinEl?.classList.toggle('high', !!high);
      switch (part.kind) {
        case 'led': {
          let b = 0;
          if (r?.mode === 'out') b = r.level;
          else if (r?.mode === 'pwm') b = r.duty!;
          (g.querySelector('.led-glow') as SVGElement).setAttribute('opacity', String(b * 0.75));
          g.classList.toggle('lit', b > 0.02);
          (g.querySelector('.led-lens') as SVGElement).style.filter = `brightness(${0.55 + b * 0.9})`;
          break;
        }
        case 'button':
          g.classList.toggle('pressed', !!part.pressed);
          break;
        case 'buzzer': {
          const on = r?.mode === 'pwm' && r.freq! > 20 && r.duty! > 0;
          (g.querySelector('.buzz-wave') as SVGElement).setAttribute('opacity', on ? '1' : '0');
          (this.labelsLayer.querySelector(`[data-for="${part.id}"]`) as SVGElement).textContent = on ? `${Math.round(r!.freq!)} Hz` : '조용함';
          break;
        }
        case 'servo': {
          const t = this.labelsLayer.querySelector(`[data-for="${part.id}"]`) as SVGElement;
          if (r?.mode === 'pwm' && r.freq! > 30 && r.freq! < 70) {
            const pulse = (r.duty! / r.freq!) * 1000; // ms
            const a = Math.max(0, Math.min(180, ((pulse - 0.5) / 2.0) * 180));
            (g.querySelector('.servo-arm') as SVGElement).setAttribute('transform', `rotate(${a - 180} 8 0)`);
            t.textContent = `${Math.round(a)}° (${pulse.toFixed(2)}ms)`;
          } else t.textContent = r?.mode === 'pwm' ? `${Math.round(r.freq!)}Hz → 50Hz 필요` : '신호 없음';
          break;
        }
      }
    }
  }
}
