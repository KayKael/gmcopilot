/** ID virtual do microfone com voz processada (só existe enquanto o Voice FX está activo). */
export const MICROFONE_VOZ_ALTERADA = "gmcp:voice-fx";

const CHAVE = "gm-copilot:microfone";
const CHAVE_FISICO = "gm-copilot:microfone-fisico";
const EVENTO_MIC = "gmcp:microfone-change";

export function ehMicrofoneVozAlterada(id: string | null | undefined): boolean {
  return id === MICROFONE_VOZ_ALTERADA;
}

export function obterMicrofoneGuardado(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(CHAVE);
}

/** Último microfone físico — usado como input do Voice FX (nunca o virtual). */
export function obterMicrofoneFisico(): string | null {
  if (typeof window === "undefined") return null;
  const fisico = window.localStorage.getItem(CHAVE_FISICO);
  if (fisico) return fisico;
  const actual = obterMicrofoneGuardado();
  return ehMicrofoneVozAlterada(actual) ? null : actual;
}

function emitirMudancaMic() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENTO_MIC));
}

export function onMicrofoneChange(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENTO_MIC, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENTO_MIC, listener);
    window.removeEventListener("storage", listener);
  };
}

export function guardarMicrofone(deviceId: string | null) {
  if (typeof window === "undefined") return;
  if (deviceId) window.localStorage.setItem(CHAVE, deviceId);
  else window.localStorage.removeItem(CHAVE);

  if (deviceId && !ehMicrofoneVozAlterada(deviceId)) {
    window.localStorage.setItem(CHAVE_FISICO, deviceId);
  } else if (deviceId === null) {
    window.localStorage.removeItem(CHAVE_FISICO);
  }
  emitirMudancaMic();
}

export function restricoesAudio(deviceId?: string | null): MediaTrackConstraints {
  const id = deviceId ?? obterMicrofoneGuardado();
  const fisico = ehMicrofoneVozAlterada(id) ? obterMicrofoneFisico() : id;
  return {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    ...(fisico ? { deviceId: { exact: fisico } } : {}),
  };
}

export type StreamMicrofone = {
  stream: MediaStream;
  /** Se true, o caller deve fazer stop() nas tracks ao libertar. */
  proprio: boolean;
  /** Label para UI. */
  label: string;
};

/**
 * Abre o microfone seleccionado. Se for a voz alterada (ou estiver activa e
 * seleccionada), devolve um clone do MediaStream processado.
 */
export async function abrirStreamMicrofone(
  deviceId?: string | null,
): Promise<StreamMicrofone> {
  const id = deviceId === undefined ? obterMicrofoneGuardado() : deviceId;

  if (ehMicrofoneVozAlterada(id)) {
    const { obterStreamVozAlterada, voiceFxEstaActivo } = await import(
      "@/lib/voice-fx-runtime"
    );
    if (!voiceFxEstaActivo()) {
      throw new Error("Activa a alteração de voz para usar este microfone.");
    }
    const origem = obterStreamVozAlterada();
    if (!origem) throw new Error("Microfone de voz alterada indisponível.");
    return {
      stream: origem.clone(),
      proprio: true,
      label: "Voz alterada (app)",
    };
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: restricoesAudio(id),
  });
  return {
    stream,
    proprio: true,
    label: stream.getAudioTracks()[0]?.label ?? "Microfone",
  };
}
