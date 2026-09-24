// 프로젝트(회로+코드) 저장·공유와 교사 활동 설정
import { MISSIONS, Mission, Part, PartKind, PART_INFO } from './data';

export type Activity = {
  allowed: PartKind[] | null; // null = 제한 없음
  preset: Omit<Part, 'id'>[]; // 미리 배치할 부품
  lockPreset: boolean; // 미리 배치 부품을 학생이 옮기거나 뺄 수 없게
  starter: string; // 시작 코드
};

export type ProjectFile = {
  app: 'picosim';
  v: 1;
  kind: 'project';
  name: string;
  mission: string;
  parts: Omit<Part, 'id' | 'pressed'>[];
  code: string;
  savedAt: number;
};

export type ActivityFile = {
  app: 'picosim';
  v: 1;
  kind: 'activity';
  mission: string;
  activity: Activity;
};

export type Workspace = { parts: Part[]; code: string };

const KINDS = Object.keys(PART_INFO) as PartKind[];

// ---------- 저장소 ----------
const LS = 'picosim:';
export const store = {
  get<T>(k: string): T | null {
    try {
      const v = localStorage.getItem(LS + k);
      return v == null ? null : (JSON.parse(v) as T);
    } catch {
      return null;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(LS + k, JSON.stringify(v));
    } catch {}
  },
  del(k: string) {
    try {
      localStorage.removeItem(LS + k);
    } catch {}
  },
};

// ---------- 활동 설정 (미션 기본값 + 교사 덮어쓰기) ----------
export function defaultActivity(m: Mission): Activity {
  return {
    allowed: m.allowed ?? null,
    preset: (m.preset ?? []).map((p) => ({ ...p })),
    lockPreset: !!m.lockPreset,
    starter: m.starter,
  };
}

export function activityFor(m: Mission): Activity {
  const o = store.get<Partial<Activity>>('act:' + m.id);
  return { ...defaultActivity(m), ...(o || {}) };
}

export function isCustomized(m: Mission) {
  return !!store.get('act:' + m.id);
}

export function saveActivity(m: Mission, a: Activity) {
  store.set('act:' + m.id, a);
}

export function resetActivity(m: Mission) {
  store.del('act:' + m.id);
}

// ---------- 작업 공간 (미션별 자동 저장) ----------
let seq = 1;
export const newId = () => 'p' + Date.now().toString(36) + (seq++).toString(36);

export function startWorkspace(m: Mission): Workspace {
  const a = activityFor(m);
  return {
    parts: a.preset.map((p) => ({ ...p, id: newId(), locked: a.lockPreset || undefined })),
    code: a.starter,
  };
}

export function loadWorkspace(m: Mission): Workspace {
  const ws = store.get<Workspace>('ws:' + m.id);
  if (ws && Array.isArray(ws.parts) && typeof ws.code === 'string') {
    // 교사가 고정한 부품은 저장본이 있어도 활동 설정을 따른다
    const a = activityFor(m);
    if (a.lockPreset && a.preset.length) {
      const free = ws.parts.filter((p) => !p.locked && !a.preset.some((q) => q.gp === p.gp));
      return { parts: [...startWorkspace(m).parts, ...free], code: ws.code };
    }
    return { parts: ws.parts.map((p) => ({ ...p, pressed: false })), code: ws.code };
  }
  // 예전 버전에서 저장한 코드
  try {
    const old = localStorage.getItem(LS + 'code:' + m.id);
    if (old) return { ...startWorkspace(m), code: old };
  } catch {}
  return startWorkspace(m);
}

export function saveWorkspace(m: Mission, ws: Workspace) {
  store.set('ws:' + m.id, { parts: ws.parts.map(({ pressed, ...p }) => p), code: ws.code });
}

// ---------- 이름 붙여 저장한 프로젝트 ----------
export function listProjects(): ProjectFile[] {
  return (store.get<ProjectFile[]>('projects') || []).sort((a, b) => b.savedAt - a.savedAt);
}

export function saveProject(p: ProjectFile) {
  const list = listProjects().filter((x) => x.name !== p.name);
  list.unshift(p);
  store.set('projects', list.slice(0, 50));
}

export function deleteProject(name: string) {
  store.set('projects', listProjects().filter((x) => x.name !== name));
}

export function makeProject(name: string, m: Mission, ws: Workspace): ProjectFile {
  return {
    app: 'picosim',
    v: 1,
    kind: 'project',
    name,
    mission: m.id,
    parts: ws.parts.map(({ id, pressed, ...p }) => p),
    code: ws.code,
    savedAt: Date.now(),
  };
}

// ---------- 검증 (링크·파일은 누가 만들었는지 모르므로 꼼꼼히) ----------
const VALID_GP = new Set([...Array(23).keys(), 26, 27, 28]);

function cleanPart(x: any): Omit<Part, 'id'> | null {
  if (!x || !KINDS.includes(x.kind) || !VALID_GP.has(x.gp)) return null;
  const allowed = PART_INFO[x.kind as PartKind].allowed;
  if (allowed && !allowed.includes(x.gp)) return null;
  const p: Omit<Part, 'id'> = { kind: x.kind, gp: x.gp };
  if (x.kind === 'led') p.color = ['red', 'yellow', 'green', 'blue'].includes(x.color) ? x.color : 'red';
  if (x.kind === 'button') p.wiring = x.wiring === '3v3' ? '3v3' : 'gnd';
  if (x.kind === 'pot') p.value = typeof x.value === 'number' ? Math.max(0, Math.min(1, x.value)) : 0.5;
  if (x.locked) p.locked = true;
  return p;
}

function cleanParts(arr: any): Omit<Part, 'id'>[] {
  if (!Array.isArray(arr)) return [];
  const seen = new Set<number>();
  const out: Omit<Part, 'id'>[] = [];
  for (const x of arr.slice(0, 26)) {
    const p = cleanPart(x);
    if (p && !seen.has(p.gp)) {
      seen.add(p.gp);
      out.push(p);
    }
  }
  return out;
}

export function parseFile(data: any): ProjectFile | ActivityFile | null {
  if (!data || data.app !== 'picosim' || data.v !== 1) return null;
  const mission = MISSIONS.find((m) => m.id === data.mission)?.id;
  if (!mission) return null;
  if (data.kind === 'project') {
    return {
      app: 'picosim',
      v: 1,
      kind: 'project',
      name: String(data.name || '공유받은 프로젝트').slice(0, 60),
      mission,
      parts: cleanParts(data.parts),
      code: String(data.code ?? '').slice(0, 50000),
      savedAt: Number(data.savedAt) || Date.now(),
    };
  }
  if (data.kind === 'activity' && data.activity) {
    const a = data.activity;
    return {
      app: 'picosim',
      v: 1,
      kind: 'activity',
      mission,
      activity: {
        allowed: Array.isArray(a.allowed) ? a.allowed.filter((k: any) => KINDS.includes(k)) : null,
        preset: cleanParts(a.preset).map(({ locked, ...p }) => p),
        lockPreset: !!a.lockPreset,
        starter: String(a.starter ?? '').slice(0, 50000),
      },
    };
  }
  return null;
}

// ---------- 링크 인코딩 (압축 + base64url) ----------
function b64url(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s: string) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const u = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return u;
}
async function pipe(bytes: Uint8Array, stream: any) {
  const res = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

export async function encodeLink(obj: ProjectFile | ActivityFile) {
  const json = new TextEncoder().encode(JSON.stringify(obj));
  let payload: string;
  if (typeof (globalThis as any).CompressionStream === 'function') {
    payload = 'z' + b64url(await pipe(json, new (globalThis as any).CompressionStream('deflate-raw')));
  } else payload = 'j' + b64url(json);
  const key = obj.kind === 'project' ? 'p' : 'a';
  return `${location.origin}${location.pathname}#${key}=${payload}`;
}

export async function decodeHash(hash: string): Promise<ProjectFile | ActivityFile | null> {
  const m = hash.match(/^#([pa])=([zj])([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  try {
    let bytes = unb64url(m[3]);
    if (m[2] === 'z') bytes = await pipe(bytes, new (globalThis as any).DecompressionStream('deflate-raw'));
    const f = parseFile(JSON.parse(new TextDecoder().decode(bytes)));
    if (!f || (m[1] === 'p') !== (f.kind === 'project')) return null;
    return f;
  } catch {
    return null;
  }
}
