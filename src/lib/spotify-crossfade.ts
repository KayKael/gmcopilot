/**
 * Ponte de preview para crossfade.
 * Usa fontes com excerto do INÍCIO (Deezer → iTunes).
 * Nunca o preview_url do Spotify (é do meio da faixa).
 */

let audio: HTMLAudioElement | null = null;
let fadeGen = 0;

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(() => resolve(), ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

async function fadeAudioVolume(
  el: HTMLAudioElement,
  de: number,
  para: number,
  duracaoMs: number,
  signal: AbortSignal,
  steps = 40,
) {
  const stepMs = Math.max(35, Math.round(duracaoMs / steps));
  const gen = fadeGen;
  for (let i = 1; i <= steps; i++) {
    if (signal.aborted || gen !== fadeGen) {
      throw new DOMException("Aborted", "AbortError");
    }
    const t = i / steps;
    // ease-in-out cúbico — encaixa sem pico
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    el.volume = Math.max(0, Math.min(1, de + (para - de) * eased));
    await sleep(stepMs, signal);
  }
  el.volume = Math.max(0, Math.min(1, para));
}

/** Para e limpa qualquer ponte activa. */
export function pararPonte() {
  fadeGen += 1;
  if (audio) {
    try {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    } catch {
      // ignore
    }
    audio = null;
  }
}

export function ponteActiva(): boolean {
  return Boolean(audio && !audio.paused);
}

/** Posição actual do pedaço da próxima (ms) — para alinhar o Spotify. */
export function tempoPonteMs(): number {
  if (!audio) return 0;
  const t = audio.currentTime;
  return Number.isFinite(t) ? Math.max(0, Math.round(t * 1000)) : 0;
}

async function criarAudio(previewUrl: string): Promise<HTMLAudioElement | null> {
  const el = new Audio();
  el.preload = "auto";
  // Sem crossOrigin: alguns CDNs de preview bloqueiam CORS e o play falha
  el.src = previewUrl;

  await new Promise<void>((resolve) => {
    const ok = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      el.removeEventListener("canplaythrough", ok);
      el.removeEventListener("canplay", ok);
      el.removeEventListener("error", fail);
    };
    el.addEventListener("canplaythrough", ok, { once: true });
    el.addEventListener("canplay", ok, { once: true });
    el.addEventListener("error", fail, { once: true });
    el.load();
    setTimeout(() => {
      cleanup();
      resolve();
    }, 3500);
  });

  return el;
}

/**
 * Pedaço do INÍCIO da próxima faixa no browser (simultâneo com a actual).
 * Volume baixo por defeito — previews HTML soam mais altos que o Spotify.
 */
export async function iniciarPonteProxima(
  previewUrl: string,
  signal: AbortSignal,
  fadeInMs = 2800,
  volumeAlvo = 0.12,
): Promise<boolean> {
  pararPonte();
  if (!previewUrl || signal.aborted) return false;

  try {
    const el = await criarAudio(previewUrl);
    if (!el || signal.aborted) return false;
    el.currentTime = 0;
    el.volume = 0;
    audio = el;
    await el.play();
    await fadeAudioVolume(el, 0, volumeAlvo, fadeInMs, signal, 40);
    return !signal.aborted && audio === el && !el.paused;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      pararPonte();
      return false;
    }
    pararPonte();
    return false;
  }
}

/** @deprecated */
export async function iniciarPonte(
  previewUrl: string,
  signal: AbortSignal,
  fadeInMs = 2800,
  volumeAlvo = 0.12,
): Promise<boolean> {
  return iniciarPonteProxima(previewUrl, signal, fadeInMs, volumeAlvo);
}

/** @deprecated */
export async function iniciarPonteHold(
  previewUrl: string,
  signal: AbortSignal,
  volumeInicial = 0.1,
): Promise<boolean> {
  return iniciarPonteProxima(previewUrl, signal, 600, volumeInicial);
}

/** Fade-out do pedaço e stop. */
export async function terminarPonte(signal?: AbortSignal, fadeOutMs = 3200): Promise<void> {
  const el = audio;
  if (!el) return;
  const localSignal = signal ?? new AbortController().signal;
  try {
    await fadeAudioVolume(el, el.volume, 0, fadeOutMs, localSignal, 40);
  } catch {
    // ignore
  }
  if (audio === el) pararPonte();
}

/**
 * Preview do INÍCIO da faixa via server (ISRC → Deezer → iTunes, match estrito).
 * Sem match fiável = null (não toca música aleatória).
 */
export async function resolverPreviewInicio(
  nome: string,
  artista: string,
  isrc?: string | null,
): Promise<string | null> {
  try {
    const { buscarPreviewInicio } = await import("@/lib/preview.functions");
    return await buscarPreviewInicio({
      data: { nome, artista, isrc: isrc ?? null },
    });
  } catch (e) {
    console.warn("[crossfade] falha a resolver preview início", e);
    return null;
  }
}
