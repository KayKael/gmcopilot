/** Motor de efeitos sonoros com Web Audio API (latência ~0). */
import { SFX_KEYS, type SfxKey } from "@/lib/scenes";

const VOL_KEY = "gmcp.sfx.volume";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<string, AudioBuffer>();

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
  coracao: { freqs: [70, 55], tipo: "sine", dur: 0.35 },
  moedas: { freqs: [1200, 1600, 2000], tipo: "square", dur: 0.3 },
  dragao: { freqs: [80, 110, 55], tipo: "sawtooth", dur: 1.0, sweep: 40 },
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

/** Pré-carrega e descodifica todos os sons (ignora ficheiros vazios). */
export async function precarregarSfx() {
  const c = contexto();
  if (!c) return;
  await Promise.all(
    SFX_KEYS.map(async (key) => {
      if (buffers.has(key)) return;
      try {
        const res = await fetch(`/sfx/${key}.mp3`);
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

/** Toca um som. Devolve a duração em segundos (0 se falhar). */
export function tocarSfx(key: SfxKey | string): number {
  const c = contexto();
  if (!c || !master) return 0;
  void c.resume();
  const buffer = buffers.get(key);
  if (buffer) {
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.connect(master);
    src.start();
    return buffer.duration;
  }
  return tocarProcedural(key);
}
