export type VoiceFxParams = {
  pitchSemitones: number;
  distortion: number;
  bassDb: number;
  reverb: number;
  wet: number;
  monitorGain: number;
};

export type VoicePreset = {
  key: string;
  nome: string;
  descricao: string;
  params: VoiceFxParams;
};

export const VOICE_PRESETS: VoicePreset[] = [
  {
    key: "etsai",
    nome: "Etsai",
    descricao: "Voz grossa, um pouco demoníaca",
    params: {
      pitchSemitones: -6,
      distortion: 0.45,
      bassDb: 8,
      reverb: 0.28,
      wet: 0.85,
      monitorGain: 0.7,
    },
  },
  {
    key: "abismo",
    nome: "Abismo",
    descricao: "Mais grave e cavernoso",
    params: {
      pitchSemitones: -8,
      distortion: 0.35,
      bassDb: 10,
      reverb: 0.55,
      wet: 0.9,
      monitorGain: 0.65,
    },
  },
  {
    key: "gigante",
    nome: "Gigante",
    descricao: "Pitch baixo, pouca distorção",
    params: {
      pitchSemitones: -5,
      distortion: 0.12,
      bassDb: 6,
      reverb: 0.18,
      wet: 0.7,
      monitorGain: 0.75,
    },
  },
  {
    key: "limpo",
    nome: "Limpo",
    descricao: "Só monitor, sem efeitos",
    params: {
      pitchSemitones: 0,
      distortion: 0,
      bassDb: 0,
      reverb: 0,
      wet: 0,
      monitorGain: 0.8,
    },
  },
];

export const VOICE_PARAMS_DEFAULT: VoiceFxParams = {
  pitchSemitones: -6,
  distortion: 0.45,
  bassDb: 8,
  reverb: 0.28,
  wet: 0.85,
  monitorGain: 0.7,
};

const LS_PRESET = "gmcp.voice.preset";
const LS_PARAMS = "gmcp.voice.params";
const LS_MONITOR = "gmcp.voice.monitor";
const LS_OUTPUT = "gmcp.voice.output";
const LS_EXPOR = "gmcp.voice.expor-sistema";

export function carregarPresetKey(): string {
  if (typeof window === "undefined") return "etsai";
  return window.localStorage.getItem(LS_PRESET) ?? "etsai";
}

export function guardarPresetKey(key: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_PRESET, key);
}

export function carregarParamsGuardados(): VoiceFxParams | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LS_PARAMS);
    if (!raw) return null;
    return { ...VOICE_PARAMS_DEFAULT, ...JSON.parse(raw) } as VoiceFxParams;
  } catch {
    return null;
  }
}

export function guardarParams(params: VoiceFxParams) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_PARAMS, JSON.stringify(params));
}

export function carregarMonitorLigado(): boolean {
  if (typeof window === "undefined") return true;
  const v = window.localStorage.getItem(LS_MONITOR);
  return v !== "0";
}

export function guardarMonitorLigado(ligado: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_MONITOR, ligado ? "1" : "0");
}

export function carregarOutputId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LS_OUTPUT);
}

export function guardarOutputId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) window.localStorage.setItem(LS_OUTPUT, id);
  else window.localStorage.removeItem(LS_OUTPUT);
}

export function carregarExporSistema(): boolean {
  if (typeof window === "undefined") return true;
  const v = window.localStorage.getItem(LS_EXPOR);
  // Por omissão ligado — é o que o utilizador espera para Discord/Windows
  return v !== "0";
}

export function guardarExporSistema(ligado: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_EXPOR, ligado ? "1" : "0");
}

export function presetByKey(key: string): VoicePreset | undefined {
  return VOICE_PRESETS.find((p) => p.key === key);
}
