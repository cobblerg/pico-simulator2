import { PicoClient } from '../engine/client';
import type { EngineEvent, PinReport } from '../engine/core';
import { RealPico } from '../real/serial';
import { BoardView } from './board';
import { createEditor } from './editor';
import { Mission, Part, PartKind, PART_INFO, PINS, pinByGp, nearestPin, LED_COLORS, LED_COLOR_NAMES, ERROR_HELP } from './data';
import { getSimulatorMissions, getMissionById, getMissionIndex, getDefaultMission } from './content-access';
import type { CheckpointEvaluationContext, CheckpointRuntimeState } from './checkpoint';
import { evaluateCheckpoint } from './checkpoint-evaluator';
import { selectCheckpoints } from './checkpoint-select';
import {
  Activity, activityFor, defaultActivity, isCustomized, saveActivity, resetActivity,
  loadWorkspace, saveWorkspace, startWorkspace, newId,
  listProjects, saveProject, deleteProject, makeProject, parseFile, encodeLink, decodeHash,
  ProjectFile, ActivityFile,
} from './project';
import { initStudentEntryGate } from './student-entry-ui';
import { isWorkspaceAutosaveEnabled } from './workspace-autosave';
import { initLearningEventSink } from './learning-event-sink';
import { getOrCreateCoachingSession, setHypothesisFocus, setObservation, setStuckReason, type StuckReason, type ObservationChoice, type HypothesisFocus } from './coaching-session';
import { COACHING_SCAFFOLDS, getCoachingScaffold } from './coaching-scaffold';
import { OBSERVATION_SCAFFOLDS, HYPOTHESIS_FOCUS_SCAFFOLDS, getObservationScaffold, getHypothesisFocusScaffold } from './coaching-observation';

declare const __UF2_B64__: string;
declare const __FW_VERSION__: string;
declare const __STANDALONE__: boolean;

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const store = {
  get(k: string) { try { return localStorage.getItem('picosim:' + k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem('picosim:' + k, v); } catch {} },
};

// 0-D8: 기존 초기화 흐름은 전혀 바꾸지 않는다 — dialog는 순수 오버레이이며
// 이 호출 한 번뿐, 아래 나머지 초기화는 지금과 동일하게 즉시 진행된다.
initStudentEntryGate();
// 0-D9-C: learning-event-sink.ts가 이미 존재하는 picosim:event를 구독할
// 뿐이다 — logEvent()/learningLog/picosim:event의 기존 동작은 아래에서
// activityId 필드 하나만 추가되는 것 외에는 전혀 바뀌지 않는다.
initLearningEventSink();

// ---------- 학습 기록 (대시보드 연동용 훅) ----------
// 모든 학습 행동을 이벤트로 남긴다. 플랫폼에 붙일 때 이 이벤트를 서버로 보내면 된다.
const learningLog: { t: number; type: string; data: any }[] = [];
function logEvent(type: string, data: any = {}) {
  // 0-D9-C: activityId를 호출 시점의 현재 mission.id로 함께 실어 보낸다 —
  // part-add/part-move/part-remove/reset/real-*처럼 data에 mission이 없는
  // 이벤트도 learning-event-sink.ts가 정확한 activityId를 얻을 수 있게
  // 하기 위한 최소 변경이다(app.ts 내부 상태에 sink가 직접 결합하지
  // 않고, 이 필드 하나로만 소통한다). data/learningLog/picosim:event의
  // 기존 shape·소비 방식은 이 필드가 추가된 것 외에는 그대로다.
  const ev = { t: Date.now(), type, data, activityId: mission.id };
  learningLog.push(ev);
  window.dispatchEvent(new CustomEvent('picosim:event', { detail: ev }));
}
(window as any).picosimLog = learningLog;
(window as any).picosimPins = () => Object.fromEntries(pins);

// ---------- 상태 ----------
let mission: Mission = getMissionById(store.get('mission') ?? '') ?? getDefaultMission();
let parts: Part[] = loadWorkspace(mission).parts;
let projectName = store.get('projectName:' + mission.id) || '새 프로젝트';
const passed = new Set<string>(JSON.parse(store.get('passed') || '[]'));
const pins = new Map<number, PinReport>();
let running = false;
let runEdges: [number, number, number][] = [];
let runStdout = '';
let runPins: { gp: number; freq: number; duty: number }[] = [];
let checkpointState: CheckpointRuntimeState = {};

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
const editor = createEditor($('#editor'), loadWorkspace(mission).code, (code, pasteLines) => {
  saveWsSoon();
  editor.markError(null);
  if (pasteLines >= 5) logEvent('paste', { lines: pasteLines, mission: mission.id });
});

// ---------- 작업 자동 저장 (SIM-18) ----------
let saveTimer: any = null;
function saveWsSoon() {
  if (!isWorkspaceAutosaveEnabled()) return; // 0-D8: 학생 교체 중에는 예약하지 않는다
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveWsNow, 400);
}
function saveWsNow() {
  clearTimeout(saveTimer);
  if (!isWorkspaceAutosaveEnabled()) return; // 0-D8: 학생 교체 중에는 어떤 경로로도 저장하지 않는다(디바운스 타이머가 이미 예약돼 있었거나 pagehide로 호출된 경우 포함)
  saveWorkspace(mission, { parts, code: editor.get() });
}
window.addEventListener('pagehide', saveWsNow);

// ---------- 보드 ----------
function placePart(kind: PartKind, gp: number, moveId?: string): string | null {
    const act = activityFor(mission);
    if (!moveId && act.allowed && !act.allowed.includes(kind)) {
      toast(`이 활동에서는 <b>${PART_INFO[kind].name}</b>를 쓰지 않아요.`, 'warn');
      return 'not-allowed';
    }
    const allowed = PART_INFO[kind].allowed;
    if (allowed && !allowed.includes(gp)) {
      toast(`<b>${PART_INFO[kind].name}</b>는 아날로그 입력이 되는 <b>GP26·GP27·GP28</b>에만 연결할 수 있어요. (실물도 같아요)`, 'warn');
      return 'bad';
    }
    const occupied = parts.find((p) => p.gp === gp && p.id !== moveId);
    if (occupied?.locked) {
      toast(`GP${gp}에는 선생님이 고정한 ${PART_INFO[occupied.kind].name}가 있어요.`, 'warn');
      return 'busy';
    }
    if (occupied) {
      toast(`GP${gp}에는 이미 ${PART_INFO[occupied.kind].name}가 연결돼 있어요. 다른 핀을 고르세요.`, 'warn');
      return 'busy';
    }
    if (moveId) {
      const p = parts.find((x) => x.id === moveId)!;
      logEvent('part-move', { kind, from: p.gp, to: gp });
      p.gp = gp;
    } else {
      const p: Part = { id: newId(), kind, gp };
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
  renderTeacher();
  renderPinStrip();
  saveWsSoon();
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
  if (p.locked) extra = extra.replace(/<select /g, '<select disabled ');
  box.innerHTML = `<div class="insp-head"><b>${PART_INFO[p.kind].name}</b><span class="chip">GP${p.gp} · ${pin.phys}번 핀</span></div>
    <p class="muted">${p.locked ? '선생님이 고정한 부품이에요. 옮기거나 뺄 수 없어요.' : PART_INFO[p.kind].hint}</p>${extra}
    ${p.locked ? '' : '<button class="btn ghost small" id="part-del" type="button">부품 빼기</button>'}`;
  $('#led-color')?.addEventListener('change', (e) => {
    p.color = (e.target as HTMLSelectElement).value;
    partsChanged();
  });
  $('#btn-wiring')?.addEventListener('change', (e) => {
    p.wiring = (e.target as HTMLSelectElement).value as any;
    partsChanged();
  });
  $('#part-del')?.addEventListener('click', () => {
    parts = parts.filter((x) => x.id !== p.id);
    logEvent('part-remove', { kind: p.kind, gp: p.gp });
    board.selected = null;
    partsChanged();
  });
}

// ---------- 팔레트 ----------
const palette = $('#palette');
function renderPalette() {
  const act = activityFor(mission);
  const kinds = (Object.keys(PART_INFO) as PartKind[]).filter((k) => !act.allowed || act.allowed.includes(k));
  palette.innerHTML = '';
  $('#palette-note').textContent = act.allowed ? '이 활동에서 쓰는 부품만 보여요' : '';
  if (!kinds.length) {
    palette.innerHTML = '<p class="palette-empty">이 활동은 부품 없이 보드의 내장 LED만 써요.</p>';
    return;
  }
  kinds.forEach(addPaletteItem);
}
function addPaletteItem(k: PartKind) {
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
}

// ---------- 미션 ----------
function renderMissionList() {
  $('#mission-list').innerHTML = getSimulatorMissions().map(
    (m, i) =>
      `<button type="button" class="m-item ${m.id === mission.id ? 'cur' : ''} ${passed.has(m.id) ? 'done' : ''}" data-m="${m.id}" aria-current="${m.id === mission.id}"><span class="m-no">${i + 1}</span><span class="m-name">${m.title}</span><span class="m-state" aria-label="${passed.has(m.id) ? '통과' : ''}"></span></button>`,
  ).join('');
  document.querySelectorAll<HTMLButtonElement>('.m-item').forEach((b) =>
    b.addEventListener('click', () => {
      const m = getMissionById(b.dataset.m!)!;
      if (m.id === mission.id) return;
      openMission(m);
      logEvent('mission-open', { mission: m.id });
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

function openMission(m: Mission, ws = loadWorkspace(m)) {
  saveWsNow();
  mission = m;
  store.set('mission', m.id);
  parts = ws.parts;
  board.selected = null;
  editor.set(ws.code);
  editor.markError(null);
  checkEl.hidden = true;
  setProjectName(store.get('projectName:' + m.id) || '새 프로젝트');
  renderMission();
  renderPalette();
  partsChanged();
  saveWsNow();
}

function setProjectName(n: string) {
  projectName = n;
  store.set('projectName:' + mission.id, n);
  $('#proj-name').textContent = `${n} · ${mission.title}`;
}

// ---------- 저장·불러오기·공유 (SIM-18) ----------
const dlg = $<HTMLDialogElement>('#proj-dialog');
function currentProject(name = projectName) {
  return makeProject(name, mission, { parts, code: editor.get() });
}
function renderProjectList() {
  const list = listProjects();
  $('#pd-list').innerHTML = list.length
    ? list
        .map((p, i) => {
          const m = getMissionById(p.mission);
          const when = new Date(p.savedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          return `<li><div class="pd-info"><b>${esc(p.name)}</b><small>${esc(m?.title || '')} · 부품 ${p.parts.length}개 · ${when}</small></div>
            <button class="btn ghost small" type="button" data-open="${i}">열기</button>
            <button class="btn ghost small danger" type="button" data-del="${i}" aria-label="${esc(p.name)} 지우기">지우기</button></li>`;
        })
        .join('')
    : '<li class="pd-empty">아직 저장한 프로젝트가 없어요.</li>';
  $('#pd-list').querySelectorAll<HTMLButtonElement>('[data-open]').forEach((b) =>
    b.addEventListener('click', () => {
      applyProject(list[+b.dataset.open!]);
      dlg.close();
    }),
  );
  $('#pd-list').querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) => {
    let armed = false;
    b.addEventListener('click', () => {
      // 확인 대화상자 대신 두 번 누르기
      if (!armed) {
        armed = true;
        b.textContent = '한 번 더';
        setTimeout(() => { armed = false; b.textContent = '지우기'; }, 2500);
        return;
      }
      deleteProject(list[+b.dataset.del!].name);
      renderProjectList();
    });
  });
}
function openDialog(focusName: boolean) {
  $<HTMLInputElement>('#pd-name').value = projectName === '새 프로젝트' ? '' : projectName;
  renderProjectList();
  try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); }
  if (focusName) $<HTMLInputElement>('#pd-name').focus();
}
$('#proj-save').addEventListener('click', () => openDialog(true));
$('#proj-open').addEventListener('click', () => openDialog(false));
$('#pd-close').addEventListener('click', () => dlg.close());
$('#pd-save').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $<HTMLInputElement>('#pd-name').value.trim();
  if (!name) {
    $<HTMLInputElement>('#pd-name').focus();
    toast('저장할 이름을 적어 주세요.', 'warn');
    return;
  }
  setProjectName(name);
  saveProject(currentProject(name));
  saveWsNow();
  logEvent('project-save', { name, mission: mission.id });
  renderProjectList();
  toast(`<b>${esc(name)}</b>(으)로 저장했어요.`);
});

function applyProject(p: ProjectFile) {
  saveWsNow();
  const m = getMissionById(p.mission) || mission;
  const act = activityFor(m);
  // 교사가 고정한 부품은 활동 설정을 따르고, 나머지는 프로젝트대로
  const locked = act.lockPreset ? startWorkspace(m).parts : [];
  const free = p.parts.filter(({ locked: l, ...x }) => !locked.some((q) => q.gp === x.gp)).map(({ locked: l, ...x }) => ({ ...x, id: newId() }));
  openMission(m, { parts: [...locked, ...free], code: p.code });
  setProjectName(p.name);
  logEvent('project-open', { name: p.name, mission: m.id });
  toast(`<b>${esc(p.name)}</b>을(를) 열었어요.`);
}

async function copyText(text: string, okMsg: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMsg);
  } catch {
    // 복사가 막히면 알림 안에 주소를 보여 준다
    toast(`복사가 막혀 있어요. 아래 주소를 직접 복사하세요.<br><input class="link-box" readonly value="${esc(text)}" aria-label="공유 주소">`, 'warn');
    setTimeout(() => (document.querySelector('.link-box') as HTMLInputElement)?.select(), 50);
  }
}

$('#proj-share').addEventListener('click', async () => {
  saveWsNow();
  const link = await encodeLink(currentProject());
  logEvent('project-share', { mission: mission.id, length: link.length });
  copyText(link, '공유 링크를 복사했어요. 이 링크를 열면 지금 회로와 코드가 그대로 열려요.');
});

let restartArmed = false;
$('#proj-restart').addEventListener('click', () => {
  if (!restartArmed) {
    restartArmed = true;
    $('#proj-restart').textContent = '정말 되돌릴까요?';
    setTimeout(() => { restartArmed = false; $('#proj-restart').textContent = '처음 상태로'; }, 3000);
    return;
  }
  restartArmed = false;
  $('#proj-restart').textContent = '처음 상태로';
  // 되돌리기 전에 지금 상태를 자동 백업
  if (parts.length || editor.get() !== activityFor(mission).starter) saveProject(currentProject(`자동 백업 ${new Date().toLocaleTimeString('ko-KR')}`));
  openMission(mission, startWorkspace(mission));
  setProjectName('새 프로젝트');
  logEvent('project-restart', { mission: mission.id });
  toast('처음 회로와 시작 코드로 되돌렸어요. 이전 상태는 <b>불러오기</b>에 자동 백업돼 있어요.');
});

function downloadJson(name: string, obj: unknown) {
  download(name, new TextEncoder().encode(JSON.stringify(obj, null, 2)), 'application/json');
}
if (__STANDALONE__) {
  $('#pd-export').hidden = false;
  $('#pd-export').addEventListener('click', () => {
    downloadJson(`${projectName.replace(/[\\/:*?"<>|]/g, '_')}.picosim.json`, currentProject());
    logEvent('project-export');
  });
}
$<HTMLInputElement>('#pd-file').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const f = parseFile(JSON.parse(await file.text()));
    if (!f) throw new Error('bad');
    dlg.close();
    if (f.kind === 'project') applyProject(f);
    else applyActivity(f, 'file');
  } catch {
    toast('PicoSim 프로젝트 파일이 아니에요. <b>.picosim.json</b> 파일을 골라 주세요.', 'warn');
  }
});

// ---------- 교사 설정 (SIM-06) ----------
const teacherEl = $('#teacher');
$('#teacher-toggle').addEventListener('click', () => {
  const open = teacherEl.hidden;
  teacherEl.hidden = !open;
  $('#teacher-toggle').setAttribute('aria-pressed', String(open));
  if (open) {
    renderTeacher();
    teacherEl.scrollIntoView({ block: 'nearest' });
  }
});

function describeParts(list: { kind: PartKind; gp: number }[]) {
  return list.map((p) => `${PART_INFO[p.kind].name} GP${p.gp}`).join(', ');
}

function renderTeacher() {
  if (teacherEl.hidden) return;
  const act = activityFor(mission);
  $('#t-mission').textContent = `${getMissionIndex(mission.id) + 1}. ${mission.title}`;
  $('#t-custom').textContent = isCustomized(mission) ? '바꾼 설정' : '';
  $('#t-allowed').innerHTML = (Object.keys(PART_INFO) as PartKind[])
    .map((k) => `<label><input type="checkbox" value="${k}" ${!act.allowed || act.allowed.includes(k) ? 'checked' : ''}> ${PART_INFO[k].name}</label>`)
    .join('');
  $('#t-allowed').querySelectorAll('input').forEach((i) =>
    i.addEventListener('change', () => {
      const chosen = [...$('#t-allowed').querySelectorAll<HTMLInputElement>('input:checked')].map((x) => x.value as PartKind);
      const all = chosen.length === Object.keys(PART_INFO).length;
      updateActivity({ allowed: all ? null : chosen });
    }),
  );
  $('#t-preset').textContent = act.preset.length ? `${describeParts(act.preset)}` : '없음 · 학생이 빈 보드에서 시작해요';
  $<HTMLInputElement>('#t-lock').checked = act.lockPreset;
  $<HTMLInputElement>('#t-lock').disabled = !act.preset.length;
}

function updateActivity(change: Partial<Activity>, msg?: string) {
  const next = { ...activityFor(mission), ...change };
  saveActivity(mission, next);
  logEvent('teacher-activity', { mission: mission.id, change: Object.keys(change) });
  // 고정 표시를 지금 보드에 반영
  if ('lockPreset' in change || 'preset' in change) {
    parts = parts.map((p) => ({ ...p, locked: next.lockPreset && next.preset.some((q) => q.gp === p.gp && q.kind === p.kind) ? true : undefined }));
  }
  renderPalette();
  partsChanged();
  if (msg) toast(msg);
}

$('#t-preset-save').addEventListener('click', () => {
  const preset = parts.map(({ id, pressed, locked, ...p }) => p);
  updateActivity({ preset }, preset.length ? `미리 배치 회로로 저장했어요: ${describeParts(preset)}` : '보드가 비어 있어 미리 배치 회로를 비웠어요.');
});
$('#t-preset-clear').addEventListener('click', () => updateActivity({ preset: [], lockPreset: false }, '미리 배치 회로를 비웠어요.'));
$<HTMLInputElement>('#t-lock').addEventListener('change', (e) => updateActivity({ lockPreset: (e.target as HTMLInputElement).checked }));
$('#t-starter-save').addEventListener('click', () => updateActivity({ starter: editor.get() }, '지금 코드를 시작 코드로 저장했어요.'));
$('#t-starter-reset').addEventListener('click', () => updateActivity({ starter: mission.starter }, '시작 코드를 기본값으로 되돌렸어요.'));
$('#t-reset').addEventListener('click', () => {
  resetActivity(mission);
  updateActivity(defaultActivity(mission), '이 미션의 설정을 기본값으로 되돌렸어요.');
  resetActivity(mission);
  renderTeacher();
});
function currentActivityFile(): ActivityFile {
  return { app: 'picosim', v: 1, kind: 'activity', mission: mission.id, activity: activityFor(mission) };
}
$('#t-link').addEventListener('click', async () => {
  const link = await encodeLink(currentActivityFile());
  logEvent('teacher-link', { mission: mission.id });
  copyText(link, '학생용 활동 링크를 복사했어요. 학생이 열면 이 설정과 미리 배치 회로로 시작해요.');
});
if (__STANDALONE__) {
  $('#t-export').hidden = false;
  $('#t-export').addEventListener('click', () => downloadJson(`활동-${mission.id}.picosim.json`, currentActivityFile()));
}

function applyActivity(f: ActivityFile, via: 'link' | 'file') {
  saveWsNow();
  const m = getMissionById(f.mission)!;
  // 학생이 하던 작업은 지우지 않고 백업해 둔다
  const prev = loadWorkspace(m);
  if (prev.parts.length || prev.code !== activityFor(m).starter) {
    saveProject(makeProject(`자동 백업 ${m.title} ${new Date().toLocaleTimeString('ko-KR')}`, m, prev));
  }
  saveActivity(m, f.activity);
  openMission(m, startWorkspace(m));
  setProjectName('새 프로젝트');
  logEvent('activity-open', { mission: m.id, via });
  toast(`선생님이 준비한 <b>${esc(m.title)}</b> 활동을 열었어요.`);
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

// ---------- 0-C3-A: checkpoint evaluator용 context adapter (아직 미사용) ----------
// checkAtEnd/checkLive에 흩어진 실제 상태(runEdges/runPins/runStdout/parts/pins)를
// checkpoint-evaluator.ts가 요구하는 최소 snapshot으로 변환한다. 원본 배열/Map은
// 하나도 mutate하지 않고 항상 새 배열/Set/Map을 만들어 반환한다.
// 이 함수는 아직 어디에서도 호출되지 않는다 — checkAtEnd/checkLive는 계속
// 자체 하드코딩 로직으로 판정한다(0-C3-A는 evaluator를 연결하지 않는다).
function buildCheckpointContext(): CheckpointEvaluationContext {
  return {
    edges: runEdges.map(([pin, level, atMs]) => ({ pin, level: level as 0 | 1, atMs })),
    // runPins는 { gp, freq, duty } 모양이지만 PwmSample은 { pin, freq, duty }다 —
    // gp -> pin으로 이름을 명시적으로 바꾼다 (구조적으로 우연히 맞는 필드가 아니므로 누락되기 쉬운 지점).
    pwmSamples: runPins.map(({ gp, freq, duty }) => ({ pin: gp, freq, duty })),
    stdout: runStdout,
    pressedInputs: new Set(parts.filter((p) => p.pressed).map((p) => p.gp)),
    pins: new Map([...pins].map(([gp, r]) => [gp, { mode: r.mode, level: r.level }])),
  };
}

function checkAtEnd(ok: boolean) {
  const miss = missingParts();
  if (miss.length) {
    showCheck(false, `회로를 확인하세요: ${miss.map((n) => `${PART_INFO[n.kind].name}를 GP${n.gp}에`).join(', ')} 연결해야 해요.`);
    return;
  }
  if (!ok) return;
  if (mission.id === 'm1') {
    // 성공/실패의 유일한 판정기는 evaluateCheckpoint다 (first-on/first-off, >=800ms
    // semantics는 checkpoint-evaluator.ts가 전담 — 여기서 다시 계산하지 않는다).
    const ctx = buildCheckpointContext();
    const cps1 = selectCheckpoints(mission, 'end');
    // checkpoint가 하나도 없으면(콘텐츠 데이터 오류 등) Array.every()가 공허하게
    // true가 되는 fail-open을 막기 위해 길이 검사를 명시적으로 함께 건다.
    const ok1 = cps1.length > 0 && cps1.every((cp) => evaluateCheckpoint(cp.rule, ctx).result.status === 'passed');
    // 아래 edge 조회는 판정에 쓰지 않는다 — 이미 확정된 결과에 어떤 기존 문장을
    // 붙일지 고르기 위한 조회일 뿐이다(기존 메시지 4종 그대로 보존).
    const e = runEdges.filter((x) => x[0] === 25);
    const on = e.find((x) => x[1] === 1);
    const off = on && e.find((x) => x[1] === 0 && x[2] > on[2]);
    if (ok1 && on && off) showCheck(true, `내장 LED가 ${((off[2] - on[2]) / 1000).toFixed(1)}초 동안 켜졌어요.`);
    else if (on && !off) showCheck(false, 'LED를 켰지만 끄지 않았어요.');
    else if (on && off) showCheck(false, `켜진 시간이 ${((off[2] - on[2]) / 1000).toFixed(2)}초예요. 1초 동안 켜 두세요.`);
    else showCheck(false, '내장 LED가 한 번도 켜지지 않았어요.');
  } else if (mission.id === 'm2') {
    // 성공/실패의 유일한 판정기는 evaluateCheckpoint다 (rises>=min semantics는
    // checkpoint-evaluator.ts가 전담 — 여기서 다시 계산하지 않는다).
    const ctx = buildCheckpointContext();
    const cps2 = selectCheckpoints(mission, 'end');
    // checkpoint가 하나도 없으면 Array.every()가 공허하게 true가 되는 fail-open을
    // 막기 위해 길이 검사를 명시적으로 함께 건다.
    const ok2 = cps2.length > 0 && cps2.every((cp) => evaluateCheckpoint(cp.rule, ctx).result.status === 'passed');
    // 메시지에 들어가는 횟수 표시만을 위한 조회 — 판정에는 쓰이지 않는다.
    const rises = runEdges.filter((x) => x[0] === 15 && x[1] === 1).length;
    if (ok2) showCheck(true, `GP15 LED가 ${rises}번 켜졌어요.`);
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
    // 성공 여부(press/on -> release/off 시퀀스)의 유일한 판정기는 evaluateCheckpoint의
    // press-toggle rule이다 — 여기서 button.pressed/led.level 조합을 다시 판단하지 않는다.
    const cps = selectCheckpoints(mission, 'live');
    if (!cps.length) return; // checkpoint 없음 = fail-closed(아무 UI 변화 없음), 새 실패 메시지 없음
    const ctx = buildCheckpointContext();
    for (const cp of cps) {
      const { result, nextState } = evaluateCheckpoint(cp.rule, ctx, checkpointState);
      checkpointState = nextState;
      if (result.status === 'passed') { showCheck(true, '버튼을 누르면 켜지고, 떼면 꺼져요.'); return; }
      // 'pending'이면 기존과 동일하게 UI를 바꾸지 않는다(새 pending UI를 만들지 않음).
    }
  } else if (mission.id === 'm4') {
    // 성공 여부(숫자 파싱/범위 판정)의 유일한 판정기는 evaluateCheckpoint의
    // stdout-range rule이다 — 여기서 정규식 파싱이나 범위 계산을 다시 하지 않는다.
    // 이 rule은 runtime state가 필요 없으므로 checkpointState를 쓰지 않는다.
    const cps = selectCheckpoints(mission, 'live');
    if (!cps.length) return; // checkpoint 없음 = fail-closed(아무 UI 변화 없음)
    const ctx = buildCheckpointContext();
    for (const cp of cps) {
      const { result } = evaluateCheckpoint(cp.rule, ctx);
      if (result.status === 'passed') {
        // 아래 조회는 판정에 쓰지 않는다 — 이미 확정된 결과를 기존 메시지에
        // 표시할 값(최소/최대)을 고르기 위한 조회일 뿐이다.
        const nums = (runStdout.match(/-?\d+(\.\d+)?/g) || []).map(Number);
        showCheck(true, `값이 ${Math.min(...nums)} ~ ${Math.max(...nums)} 사이에서 바뀌었어요.`);
        return;
      }
      // 'pending'이면 기존과 동일하게 UI를 바꾸지 않는다(새 pending UI 없음).
    }
  } else if (mission.id === 'm5') {
    // 성공 여부(주파수 3개 관측)의 유일한 판정기는 evaluateCheckpoint의
    // pwm-freq-set rule이다 — 여기서 duty/freq/tolerance 비교를 다시 하지 않는다.
    // 이 rule은 runtime state가 필요 없으므로 checkpointState를 쓰지 않는다.
    const cps = selectCheckpoints(mission, 'live');
    if (!cps.length) return; // checkpoint 없음 = fail-closed(아무 UI 변화 없음)
    const ctx = buildCheckpointContext();
    for (const cp of cps) {
      const { result } = evaluateCheckpoint(cp.rule, ctx);
      if (result.status === 'passed') { showCheck(true, '도·레·미를 모두 연주했어요.'); return; }
      // 'pending'이면 기존과 동일하게 UI를 바꾸지 않는다(새 pending UI 없음).
    }
  } else if (mission.id === 'm6') {
    // 성공 여부(각도 3개 관측)의 유일한 판정기는 evaluateCheckpoint의
    // pwm-duty-angle-set rule이다 — 여기서 freqRange/각도 환산/tolerance 비교를
    // 다시 하지 않는다. 이 rule은 runtime state가 필요 없으므로 checkpointState를 쓰지 않는다.
    const cps = selectCheckpoints(mission, 'live');
    if (!cps.length) return; // checkpoint 없음 = fail-closed(아무 UI 변화 없음)
    const ctx = buildCheckpointContext();
    for (const cp of cps) {
      const { result } = evaluateCheckpoint(cp.rule, ctx);
      if (result.status === 'passed') { showCheck(true, '0도 → 90도 → 180도로 움직였어요.'); return; }
      // 'pending'이면 기존과 동일하게 UI를 바꾸지 않는다(새 pending UI 없음).
    }
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
  checkpointState = {};
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

// ---------- AI 학습 코치 (막힌 지점 선택, 관찰, 가설 초점 UI) ----------
// mission은 이 파일 상단(58번째 줄 부근)에서 항상 유효한 Mission으로 초기화되고
// openMission()이 미션을 바꿀 때도 항상 유효한 값으로만 재할당한다 — 이 버튼이
// 클릭 가능한 시점에 mission이 없는 경우는 현재 구조상 존재하지 않는다. 그래서
// 여기서 별도의 "mission 없음" 방어 UI를 추가하지 않는다.
const aiCoachToggle = $('#ai-coach-toggle');
const aiCoachPanel = $('#ai-coach-panel');
const aiCoachQuestion = $('#ai-coach-question');
const aiCoachReasonList = $('#ai-coach-reason-list');
const aiCoachScaffold = $('#ai-coach-scaffold');
const aiCoachScaffoldMessage = $('#ai-coach-scaffold-message');
const aiCoachAction = $('#ai-coach-action');
const aiCoachBack = $('#ai-coach-back');
const aiCoachObservation = $('#ai-coach-observation');
const aiCoachObservationList = $('#ai-coach-observation-list');
const aiCoachObservationMessage = $('#ai-coach-observation-message');
const aiCoachObservationAction = $('#ai-coach-observation-action');
const aiCoachObservationBack = $('#ai-coach-observation-back');
const aiCoachHypothesis = $('#ai-coach-hypothesis');
const aiCoachHypothesisList = $('#ai-coach-hypothesis-list');
const aiCoachHypothesisMessage = $('#ai-coach-hypothesis-message');
const aiCoachHypothesisAction = $('#ai-coach-hypothesis-action');
const aiCoachHypothesisBack = $('#ai-coach-hypothesis-back');

// 화면 전환에만 쓰이는 local UI state다. CoachingSession에는 저장하지
// 않는다 — 패널을 닫았다 다시 열면 항상 질문 화면부터 다시 시작한다
// (setAiCoachPanel 참고).
let currentCoachReason: StuckReason | null = null;
let currentCoachObservation: ObservationChoice | null = null;
let currentCoachHypothesisFocus: HypothesisFocus | null = null;

// 관찰/가설 화면을 "선택지 목록만 보이는 초기 상태"로 되돌린다.
function resetCoachObservation() {
  currentCoachObservation = null;
  aiCoachObservationList.hidden = false;
  aiCoachObservationMessage.hidden = true;
  aiCoachObservationMessage.textContent = '';
  aiCoachObservationAction.hidden = true;
  aiCoachObservationAction.textContent = '';
}
function resetCoachHypothesis() {
  currentCoachHypothesisFocus = null;
  aiCoachHypothesisList.hidden = false;
  aiCoachHypothesisMessage.hidden = true;
  aiCoachHypothesisMessage.textContent = '';
  aiCoachHypothesisAction.hidden = true;
  aiCoachHypothesisAction.textContent = '';
}

function showCoachQuestion() {
  currentCoachReason = null;
  aiCoachScaffold.hidden = true;
  aiCoachObservation.hidden = true;
  aiCoachHypothesis.hidden = true;
  aiCoachQuestion.hidden = false;
  resetCoachObservation();
  resetCoachHypothesis();
}
function showCoachScaffold(reason: StuckReason) {
  currentCoachReason = reason;
  // 학생이 선택지를 클릭한 시점에만 저장한다 — 행동 버튼/다른 이유 고르기/
  // 패널 닫기/다시 열기에서는 호출하지 않는다. mission은 클릭 시점의 현재
  // 값을 그대로 읽으므로 별도 mission 전환 listener가 필요 없다.
  setStuckReason(mission.id, reason);
  const s = getCoachingScaffold(reason);
  aiCoachScaffoldMessage.textContent = s.scaffoldMessage;
  aiCoachAction.textContent = s.actionLabel;
  aiCoachQuestion.hidden = true;
  aiCoachScaffold.hidden = false;
}
function showCoachObservation() {
  aiCoachQuestion.hidden = true;
  aiCoachScaffold.hidden = true;
  aiCoachHypothesis.hidden = true;
  aiCoachObservation.hidden = false;
  resetCoachObservation();
}
function showCoachHypothesis() {
  aiCoachQuestion.hidden = true;
  aiCoachScaffold.hidden = true;
  aiCoachObservation.hidden = true;
  aiCoachHypothesis.hidden = false;
  resetCoachHypothesis();
}
// 선택지 버튼은 index.html에 하드코딩하지 않고 각 콘텐츠 모듈(source of
// truth)에서 한 번만 렌더링한다. 문자열 키 객체의 own enumerable key는
// 선언 순서를 그대로 보존하므로, 각 모듈에 적힌 순서 그대로 표시된다.
(Object.keys(COACHING_SCAFFOLDS) as StuckReason[]).forEach((reason) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn ghost small';
  b.textContent = COACHING_SCAFFOLDS[reason].label;
  b.addEventListener('click', () => showCoachScaffold(reason));
  aiCoachReasonList.appendChild(b);
});
(Object.keys(OBSERVATION_SCAFFOLDS) as ObservationChoice[]).forEach((choice) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn ghost small';
  b.textContent = OBSERVATION_SCAFFOLDS[choice].label;
  b.addEventListener('click', () => {
    currentCoachObservation = choice;
    setObservation(mission.id, choice);
    const s = getObservationScaffold(choice);
    aiCoachObservationMessage.textContent = s.guidanceMessage;
    aiCoachObservationMessage.hidden = false;
    aiCoachObservationAction.textContent = s.actionLabel;
    aiCoachObservationAction.hidden = false;
    aiCoachObservationList.hidden = true;
  });
  aiCoachObservationList.appendChild(b);
});
(Object.keys(HYPOTHESIS_FOCUS_SCAFFOLDS) as HypothesisFocus[]).forEach((focus) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn ghost small';
  b.textContent = HYPOTHESIS_FOCUS_SCAFFOLDS[focus].label;
  b.addEventListener('click', () => {
    currentCoachHypothesisFocus = focus;
    setHypothesisFocus(mission.id, focus);
    const s = getHypothesisFocusScaffold(focus);
    aiCoachHypothesisMessage.textContent = s.guidanceMessage;
    aiCoachHypothesisMessage.hidden = false;
    aiCoachHypothesisAction.textContent = s.actionLabel;
    aiCoachHypothesisAction.hidden = false;
    aiCoachHypothesisList.hidden = true;
  });
  aiCoachHypothesisList.appendChild(b);
});
// 행동 버튼(actionLabel)은 stuckReason에 따라 다음 화면으로 이어진다 —
// tried-not-working/result-unclear는 관찰 화면으로, 그 외에는 질문
// 화면으로 돌아간다. "다른 이유 고르기"는 어느 화면에서든 항상 질문
// 화면으로 돌아간다.
aiCoachAction.addEventListener('click', () => {
  if (currentCoachReason === 'tried-not-working' || currentCoachReason === 'result-unclear') showCoachObservation();
  else showCoachQuestion();
});
aiCoachBack.addEventListener('click', () => showCoachQuestion());
aiCoachObservationAction.addEventListener('click', () => showCoachHypothesis());
aiCoachObservationBack.addEventListener('click', () => showCoachQuestion());
aiCoachHypothesisAction.addEventListener('click', () => showCoachQuestion());
aiCoachHypothesisBack.addEventListener('click', () => showCoachQuestion());

function setAiCoachPanel(open: boolean) {
  aiCoachPanel.hidden = !open;
  aiCoachToggle.setAttribute('aria-expanded', String(open));
  if (open) showCoachQuestion(); // 다시 열면 항상 질문 화면부터 시작
}
aiCoachToggle.addEventListener('click', () => {
  // hidden은 boolean | "until-found"로 잡힐 수 있으므로 명시적으로 boolean화한다.
  const opening = Boolean(aiCoachPanel.hidden);
  // 패널을 열 때만 session을 확보한다 — 닫을 때는 세션을 만들거나 건드리지 않는다.
  // mission은 클릭 시점의 현재 값을 그대로 읽으므로, 별도의 mission 전환
  // listener 없이도 미션이 바뀐 뒤 다시 열면 그 미션의 session을 얻는다.
  if (opening) getOrCreateCoachingSession(mission.id);
  setAiCoachPanel(opening);
});
$('#ai-coach-close').addEventListener('click', () => setAiCoachPanel(false));

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
renderPalette();
setProjectName(projectName);
board.render(parts);
renderNeeds();
renderBridge();
// 공유 링크로 열었으면 적용하고 주소를 정리한다 (새로고침해도 다시 덮어쓰지 않게)
function openFromHash() {
  if (!/^#[pa]=/.test(location.hash)) return;
  decodeHash(location.hash).then((f) => {
    history.replaceState(null, '', location.pathname + location.search);
    if (!f) return toast('링크가 잘렸거나 올바르지 않아요. 링크를 다시 받아 주세요.', 'warn');
    if (f.kind === 'project') applyProject(f);
    else applyActivity(f, 'link');
  });
}
openFromHash();
window.addEventListener('hashchange', openFromHash); // 열려 있는 창에 링크를 붙여 넣은 경우
renderInspector(null);
renderPinStrip();
setStatus('boot', '켜는 중');
client.start().then(() => {
  syncInputs();
  logEvent('open');
});
