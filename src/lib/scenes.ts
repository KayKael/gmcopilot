import {
  Swords,
  Compass,
  MessageCircle,
  Skull,
  Tent,
  Crown,
  Sparkles,
  DoorOpen,
  CloudLightning,
  Users,
  Wand2,
  Footprints,
  Wind,
  HeartPulse,
  Coins,
  Flame,
  Ear,
  Hexagon,
  Droplets,
  Link2,
  Hammer,
  Orbit,
  Megaphone,
  Clock,
  Radio,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type SceneKey =
  | "combate"
  | "exploracao"
  | "social"
  | "tensao"
  | "descanso"
  | "epico";

export const SCENE_KEYS: SceneKey[] = [
  "combate",
  "exploracao",
  "social",
  "tensao",
  "descanso",
  "epico",
];

export interface SceneConfig {
  id: string;
  key: SceneKey;
  nome: string;
  cor: string;
  icone: string;
  spotify_playlist_uri: string | null;
  sfx_sugeridos: string[];
  ordem: number;
}

const iconMap: Record<string, LucideIcon> = {
  swords: Swords,
  compass: Compass,
  "message-circle": MessageCircle,
  skull: Skull,
  tent: Tent,
  crown: Crown,
};

export function sceneIcon(name: string): LucideIcon {
  return iconMap[name] ?? Sparkles;
}

export const SCENE_ICON_OPTIONS = Object.keys(iconMap);

/** Catálogo completo de efeitos (ficheiros em public/sfx/{key}.mp3). */
export const SFX_KEYS = [
  "espada",
  "porta",
  "trovao",
  "multidao",
  "magia",
  "passos",
  "vento",
  "coracao",
  "moedas",
  "dragao",
  // Ordem Paranormal / sessão Odol Hiria
  "sussurro",
  "ritual",
  "gotas",
  "correntes",
  "forja",
  "portal",
  "grito",
  "relogio",
  "estatica",
  "impacto",
] as const;

export type SfxKey = (typeof SFX_KEYS)[number];

/** Alias explícito do catálogo partilhado (packs escolhem subsets). */
export const SFX_CATALOG = SFX_KEYS;

export const SFX_META: Record<SfxKey, { nome: string; icon: LucideIcon }> = {
  espada: { nome: "Espada", icon: Swords },
  porta: { nome: "Porta", icon: DoorOpen },
  trovao: { nome: "Trovão", icon: CloudLightning },
  multidao: { nome: "Multidão", icon: Users },
  magia: { nome: "Magia", icon: Wand2 },
  passos: { nome: "Passos", icon: Footprints },
  vento: { nome: "Vento", icon: Wind },
  coracao: { nome: "Coração", icon: HeartPulse },
  moedas: { nome: "Moedas", icon: Coins },
  dragao: { nome: "Dragão", icon: Flame },
  sussurro: { nome: "Sussurro", icon: Ear },
  ritual: { nome: "Ritual", icon: Hexagon },
  gotas: { nome: "Gotas", icon: Droplets },
  correntes: { nome: "Correntes", icon: Link2 },
  forja: { nome: "Forja", icon: Hammer },
  portal: { nome: "Portal", icon: Orbit },
  grito: { nome: "Grito", icon: Megaphone },
  relogio: { nome: "Relógio", icon: Clock },
  estatica: { nome: "Estática", icon: Radio },
  impacto: { nome: "Impacto", icon: Zap },
};

export function sfxMeta(key: string) {
  return SFX_META[key as SfxKey] ?? null;
}
