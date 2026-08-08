import { create } from "zustand";
import type { SceneConfig, SceneKey } from "@/lib/scenes";

export interface TranscriptLine {
  id: string;
  ts: string;
  texto: string;
}

export type SessionStatus = "parada" | "ativa" | "reconectando";
export type SpotifyStatus = "desligado" | "ligado";

export interface SpotifyTrack {
  nome: string;
  artista: string;
  capa: string | null;
  aTocar: boolean;
}

interface SessionState {
  // sessão
  status: SessionStatus;
  sessionId: string | null;
  setStatus: (s: SessionStatus) => void;
  setSessionId: (id: string | null) => void;

  // cenas
  scenes: SceneConfig[];
  setScenes: (s: SceneConfig[]) => void;
  cenaAtual: SceneKey | null;
  confianca: number | null;
  origem: "auto" | "manual" | null;
  autoClassify: boolean;
  setAutoClassify: (v: boolean) => void;
  setCena: (
    cena: SceneKey,
    origem: "auto" | "manual",
    confianca?: number | null,
  ) => void;
  sfxSugeridos: string[];
  setSfxSugeridos: (s: string[]) => void;

  // transcrição
  linhas: TranscriptLine[];
  parcial: string;
  addLinha: (l: TranscriptLine) => void;
  setParcial: (t: string) => void;
  limparTranscricao: () => void;
  micMudo: boolean;
  setMicMudo: (v: boolean) => void;

  // spotify
  spotifyStatus: SpotifyStatus;
  setSpotifyStatus: (s: SpotifyStatus) => void;
  track: SpotifyTrack | null;
  setTrack: (t: SpotifyTrack | null) => void;
  devices: { id: string; name: string; type: string; is_active: boolean }[];
  setDevices: (d: SessionState["devices"]) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  status: "parada",
  sessionId: null,
  setStatus: (status) => set({ status }),
  setSessionId: (sessionId) => set({ sessionId }),

  scenes: [],
  setScenes: (scenes) => set({ scenes }),
  cenaAtual: null,
  confianca: null,
  origem: null,
  autoClassify: true,
  setAutoClassify: (autoClassify) => set({ autoClassify }),
  setCena: (cenaAtual, origem, confianca = null) =>
    set({ cenaAtual, origem, confianca }),
  sfxSugeridos: [],
  setSfxSugeridos: (sfxSugeridos) => set({ sfxSugeridos }),

  linhas: [],
  parcial: "",
  addLinha: (l) => set((s) => ({ linhas: [...s.linhas, l] })),
  setParcial: (parcial) => set({ parcial }),
  limparTranscricao: () => set({ linhas: [], parcial: "" }),

  spotifyStatus: "desligado",
  setSpotifyStatus: (spotifyStatus) => set({ spotifyStatus }),
  track: null,
  setTrack: (track) => set({ track }),
  devices: [],
  setDevices: (devices) => set({ devices }),
}));

export function sceneByKey(scenes: SceneConfig[], key: SceneKey | null) {
  return scenes.find((s) => s.key === key) ?? null;
}
