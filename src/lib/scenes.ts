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
] as const;

export type SfxKey = (typeof SFX_KEYS)[number];

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
};
