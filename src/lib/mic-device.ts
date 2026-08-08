const CHAVE = "gm-copilot:microfone";

export function obterMicrofoneGuardado(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(CHAVE);
}

export function guardarMicrofone(deviceId: string | null) {
  if (typeof window === "undefined") return;
  if (deviceId) window.localStorage.setItem(CHAVE, deviceId);
  else window.localStorage.removeItem(CHAVE);
}

export function restricoesAudio(deviceId?: string | null): MediaTrackConstraints {
  const id = deviceId ?? obterMicrofoneGuardado();
  return {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    ...(id ? { deviceId: { exact: id } } : {}),
  };
}
