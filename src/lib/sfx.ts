/** Motor de efeitos sonoros com Web Audio API (latência ~0). */
import { SFX_KEYS, type SfxKey } from "@/lib/scenes";

const VOL_KEY = "gmcp.sfx.volume";
const LOOP_KEY = "gmcp.sfx.loop";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<string, AudioBuffer>();

/** Fontes em loop (MP3) — loop nativo; ficheiro deve ter silêncio nas pontas. */
const loopsBuffer = new Map<string, AudioBufferSourceNode>();
/** Timers para loop procedural. */
const loopsProcedural = new Map<string, number>();
/** One-shots activos (para poder parar todos). */
const oneshots = new Set<AudioBufferSourceNode>();

type LoopListener = (ativos: string[]) => void;
const loopListeners = new Set<LoopListener>();

function notificarLoops() {
  const ativos = listarSfxEmLoop();
  for (const fn of loopListeners) fn(ativos);
}

/** Perfis procedurais quando o MP3 está vazio ou em falta. */
const PERFIS: Record<
  string,
  { freqs: number[]; tipo: OscillatorType; dur: number; sweep?: number }
> = {
  espada: { freqs: [880, 1320], tipo: "sawtooth", dur: 0.25, sweep: 220 },
  porta: { freqs: [120, 90], tipo: "square", dur: 0.45 },
  trovao: { freqs: [60, 40], tipo: "sawtooth", dur: 0.9, sweep: 20 },
  multidao: { freqs: [220, 277, 330], tipo: "triangle", dur: 0.7 },
  magia: { freqs: [523, 784, 1046], tipo: "sine", dur: 0.55, sweep: 1200 },
  passos: { freqs: [90, 70], tipo: "square", dur: 0.18 },
  vento: { freqs: [300, 450], tipo: "triangle", dur: 0.8, sweep: 180 },
  coracao: { freqs: [45, 70], tipo: "sine", dur: 0.95 },
  moedas: { freqs: [1200, 1600, 2000], tipo: "square", dur: 0.3 },
  dragao: { freqs: [80, 110, 55], tipo: "sawtooth", dur: 1.0, sweep: 40 },
  sussurro: { freqs: [400, 380, 420], tipo: "triangle", dur: 0.7, sweep: 280 },
  ritual: { freqs: [110, 165, 220], tipo: "sine", dur: 1.1, sweep: 80 },
  gotas: { freqs: [900, 600], tipo: "sine", dur: 0.35, sweep: 200 },
  correntes: { freqs: [180, 240, 160], tipo: "square", dur: 0.55 },
  forja: { freqs: [90, 140], tipo: "sawtooth", dur: 0.4, sweep: 50 },
  portal: { freqs: [200, 600, 1200], tipo: "sawtooth", dur: 0.9, sweep: 80 },
  grito: { freqs: [700, 900, 500], tipo: "sawtooth", dur: 0.7, sweep: 300 },
  relogio: { freqs: [800, 200], tipo: "square", dur: 0.25 },
  estatica: { freqs: [1200, 1800, 900], tipo: "sawtooth", dur: 0.6 },
  impacto: { freqs: [50, 80], tipo: "sawtooth", dur: 0.45, sweep: 30 },
};

function contexto(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = obterVolumeSfx();
    master.connect(ctx.destination);
  }
  return ctx;
}

export function obterVolumeSfx(): number {
  if (typeof window === "undefined") return 0.8;
  const v = Number(localStorage.getItem(VOL_KEY));
  return Number.isFinite(v) && v > 0 ? v : 0.8;
}

export function definirVolumeSfx(v: number) {
  localStorage.setItem(VOL_KEY, String(v));
  if (master) master.gain.value = v;
}

export function obterModoLoopSfx(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(LOOP_KEY) === "1";
}

export function definirModoLoopSfx(on: boolean) {
  localStorage.setItem(LOOP_KEY, on ? "1" : "0");
  if (!on) pararTodosSfxEmLoop();
}

/** Pré-carrega e descodifica todos os sons (ignora ficheiros vazios). */
export async function precarregarSfx(force = false) {
  const c = contexto();
  if (!c) return;
  await Promise.all(
    SFX_KEYS.map(async (key) => {
      if (!force && buffers.has(key)) return;
      try {
        const res = await fetch(`/sfx/${key}.mp3?v=${force ? Date.now() : "1"}`);
        if (!res.ok) return;
        const raw = await res.arrayBuffer();
        if (raw.byteLength < 64) return;
        buffers.set(key, await c.decodeAudioData(raw.slice(0)));
      } catch {
        /* som indisponível — fallback procedural no play */
      }
    }),
  );
}

function tocarProcedural(key: string): number {
  const c = contexto();
  if (!c || !master) return 0;
  const perfil = PERFIS[key] ?? { freqs: [440], tipo: "sine" as OscillatorType, dur: 0.3 };
  const agora = c.currentTime;
  const ganho = c.createGain();
  ganho.gain.setValueAtTime(0.0001, agora);
  ganho.gain.exponentialRampToValueAtTime(0.35, agora + 0.02);
  ganho.gain.exponentialRampToValueAtTime(0.0001, agora + perfil.dur);
  ganho.connect(master);

  for (const f0 of perfil.freqs) {
    const osc = c.createOscillator();
    osc.type = perfil.tipo;
    osc.frequency.setValueAtTime(f0, agora);
    if (perfil.sweep) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, perfil.sweep),
        agora + perfil.dur,
      );
    }
    osc.connect(ganho);
    osc.start(agora);
    osc.stop(agora + perfil.dur + 0.02);
  }
  return perfil.dur;
}

export function listarSfxEmLoop(): string[] {
  return [...new Set([...loopsBuffer.keys(), ...loopsProcedural.keys()])];
}

export function sfxEmLoop(key: string): boolean {
  return loopsBuffer.has(key) || loopsProcedural.has(key);
}

export function onSfxLoopChange(fn: LoopListener): () => void {
  loopListeners.add(fn);
  fn(listarSfxEmLoop());
  return () => {
    loopListeners.delete(fn);
  };
}

export function pararSfx(key: string) {
  const src = loopsBuffer.get(key);
  if (src) {
    try {
      src.stop();
    } catch {
      /* já parado */
    }
    loopsBuffer.delete(key);
  }
  const timer = loopsProcedural.get(key);
  if (timer != null) {
    window.clearInterval(timer);
    loopsProcedural.delete(key);
  }
  notificarLoops();
}

export function pararTodosSfxEmLoop() {
  const keys = listarSfxEmLoop();
  for (const key of keys) {
    const src = loopsBuffer.get(key);
    if (src) {
      try {
        src.stop();
      } catch {
        /* já parado */
      }
      loopsBuffer.delete(key);
    }
    const timer = loopsProcedural.get(key);
    if (timer != null) {
      window.clearInterval(timer);
      loopsProcedural.delete(key);
    }
  }
  if (keys.length) notificarLoops();
}

/** Para loops, one-shots e procedurais a tocar. */
export function pararTodosSfx() {
  pararTodosSfxEmLoop();

  for (const src of oneshots) {
    try {
      src.stop();
    } catch {
      /* já parado */
    }
  }
  oneshots.clear();

  // Corta procedurais / nós ligados: substitui o master
  if (ctx) {
    try {
      master?.disconnect();
    } catch {
      /* ignore */
    }
    master = ctx.createGain();
    master.gain.value = obterVolumeSfx();
    master.connect(ctx.destination);
  }
}

function iniciarLoop(key: string): number {
  const c = contexto();
  if (!c || !master) return 0;
  void c.resume();

  const buffer = buffers.get(key);
  if (buffer) {
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(master);
    src.start();
    loopsBuffer.set(key, src);
    notificarLoops();
    return buffer.duration;
  }

  const dur = tocarProcedural(key);
  const intervaloMs = Math.max(80, Math.round((dur || 0.3) * 1000));
  const timer = window.setInterval(() => {
    tocarProcedural(key);
  }, intervaloMs);
  loopsProcedural.set(key, timer);
  notificarLoops();
  return dur;
}

/**
 * Toca um som.
 * Com `loop: true`, clique no mesmo efeito para / inicia o loop (toggle).
 * Devolve a duração em segundos (0 se falhar ou se parar um loop).
 */
export function tocarSfx(key: SfxKey | string, opts?: { loop?: boolean }): number {
  const c = contexto();
  if (!c || !master) return 0;
  void c.resume();

  if (opts?.loop) {
    if (sfxEmLoop(key)) {
      pararSfx(key);
      return 0;
    }
    return iniciarLoop(key);
  }

  const buffer = buffers.get(key);
  if (buffer) {
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.connect(master);
    oneshots.add(src);
    src.onended = () => oneshots.delete(src);
    src.start();
    return buffer.duration;
  }
  return tocarProcedural(key);
}
