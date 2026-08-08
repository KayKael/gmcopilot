/** Motor de efeitos sonoros com Web Audio API (latência ~0). */
import { SFX_KEYS, type SfxKey } from "@/lib/scenes";

const VOL_KEY = "gmcp.sfx.volume";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<string, AudioBuffer>();

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

/** Pré-carrega e descodifica todos os sons. */
export async function precarregarSfx() {
  const c = contexto();
  if (!c) return;
  await Promise.all(
    SFX_KEYS.map(async (key) => {
      if (buffers.has(key)) return;
      try {
        const res = await fetch(`/sfx/${key}.mp3`);
        if (!res.ok) return;
        buffers.set(key, await c.decodeAudioData(await res.arrayBuffer()));
      } catch {
        /* som indisponível — ignorar */
      }
    }),
  );
}

/** Toca um som. Devolve a duração em segundos (0 se falhar). */
export function tocarSfx(key: SfxKey | string): number {
  const c = contexto();
  if (!c || !master) return 0;
  void c.resume();
  const buffer = buffers.get(key);
  if (!buffer) return 0;
  const src = c.createBufferSource();
  src.buffer = buffer;
  src.connect(master);
  src.start();
  return buffer.duration;
}
