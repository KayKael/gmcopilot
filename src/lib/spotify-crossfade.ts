/**
 * Ponte de preview para crossfade perceptível.
 * Usa <audio> + volume (evita CORS de fetch no CDN do Spotify).
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
  steps = 16,
) {
  const stepMs = Math.max(40, Math.round(duracaoMs / steps));
  const gen = fadeGen;
  for (let i = 1; i <= steps; i++) {
    if (signal.aborted || gen !== fadeGen) {
      throw new DOMException("Aborted", "AbortError");
    }
    el.volume = Math.max(0, Math.min(1, de + ((para - de) * i) / steps));
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

/**
 * Começa o preview a volume 0 e faz fade-in.
 * Falhas (404, autoplay, etc.) resolvem sem lançar — caller faz fallback.
 */
export async function iniciarPonte(
  previewUrl: string,
  signal: AbortSignal,
  fadeInMs = 900,
): Promise<boolean> {
  pararPonte();
  if (!previewUrl || signal.aborted) return false;

  const el = new Audio();
  el.preload = "auto";
  el.crossOrigin = "anonymous";
  el.volume = 0;
  el.src = previewUrl;
  audio = el;

  try {
    await el.play();
  } catch {
    pararPonte();
    return false;
  }

  try {
    await fadeAudioVolume(el, 0, 0.85, fadeInMs, signal);
    return !signal.aborted && audio === el;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      pararPonte();
      return false;
    }
    pararPonte();
    return false;
  }
}

/** Fade-out do preview e stop. */
export async function terminarPonte(signal?: AbortSignal, fadeOutMs = 700): Promise<void> {
  const el = audio;
  if (!el) return;
  const localSignal = signal ?? new AbortController().signal;
  try {
    await fadeAudioVolume(el, el.volume, 0, fadeOutMs, localSignal, 12);
  } catch {
    // ignore abort / errors — still stop
  }
  if (audio === el) pararPonte();
}
