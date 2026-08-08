import type { SceneKey } from "@/lib/scenes";

export interface MusicMood {
  id?: string;
  key: string;
  nome: string;
  descricao: string;
  spotify_playlist_uri: string;
  ativo?: boolean;
  ordem: number;
}

/** Catálogo seed (fallback se a tabela ainda não existir / estiver vazia). */
export const MOODS_SEED: MusicMood[] = [
  {
    key: "investigacao",
    nome: "Investigação",
    descricao: "pistas, pesquisa, arquivo, exploração calma, descoberta de factos",
    spotify_playlist_uri: "spotify:playlist:4Tnfm2lnySIpwdv5cJGwrJ",
    ordem: 1,
  },
  {
    key: "realidade",
    nome: "Realidade",
    descricao: "momentos mundanos, conversa normal, dia-a-dia, base Ordo Realitas",
    spotify_playlist_uri: "spotify:playlist:6g5dlFncuxhr26BoGRHatU",
    ordem: 2,
  },
  {
    key: "visoes",
    nome: "Visões",
    descricao: "visões, pesadelos, arte paranormal, alucinações, tinta e faces",
    spotify_playlist_uri: "spotify:playlist:2HD9epxHFVpKyFdsvJ4rda",
    ordem: 3,
  },
  {
    key: "combate_normal",
    nome: "Combate Normal",
    descricao: "luta, iniciativa, tiroteio, combate padrão, emboscada",
    spotify_playlist_uri: "spotify:playlist:79wHTIFLSG72gvYhxvWH3f",
    ordem: 4,
  },
  {
    key: "combate_epico",
    nome: "Combate Épico",
    descricao: "boss fight, combate decisivo, criatura grande, clímax de luta",
    spotify_playlist_uri: "spotify:playlist:2PXMbDFI89ZONYEntxXmUM",
    ordem: 5,
  },
  {
    key: "festival",
    nome: "Festival",
    descricao: "festa, celebração, taberna, folclore, momento social alegre",
    spotify_playlist_uri: "spotify:playlist:5ojohl7rMdzzCASMB6r7v8",
    ordem: 6,
  },
  {
    key: "outro_lado",
    nome: "Outro Lado",
    descricao: "outro lado, exposição paranormal, entidades, transcendência",
    spotify_playlist_uri: "spotify:playlist:2xTsdjnDgzhbAo9VhfbjGU",
    ordem: 7,
  },
  {
    key: "insanidade",
    nome: "Insanidade",
    descricao: "loucura, sanity loss, dilema mental, máscaras, portal",
    spotify_playlist_uri: "spotify:playlist:26XPsU6zSR7brIMpDqVjxo",
    ordem: 8,
  },
  {
    key: "tecnologia",
    nome: "Tecnologia",
    descricao: "tecnologia, transmissão, energia, laboratório, sinais electrónicos",
    spotify_playlist_uri: "spotify:playlist:38P5G4Q7SsWj8ueucXaKWc",
    ordem: 9,
  },
  {
    key: "realizacao_fim",
    nome: "Realização do fim",
    descricao: "revelação final, segredo desvendado, fim da linha, descoberta crítica",
    spotify_playlist_uri: "spotify:playlist:0FfUJ0mfg8bKiya3lrnksz",
    ordem: 10,
  },
  {
    key: "base",
    nome: "Base",
    descricao: "base segura, quartel, planeamento, Ordo, pausa estratégica",
    spotify_playlist_uri: "spotify:playlist:6ZDTOYfTcOvo3Ha2Qr8Yj4",
    ordem: 11,
  },
  {
    key: "tensao",
    nome: "Tensão",
    descricao: "tensão crescente, perigo iminente, suspense, ansiedade, espreita",
    spotify_playlist_uri: "spotify:playlist:72a1fvBTY88Soj1zWg63Mq",
    ordem: 12,
  },
  {
    key: "batalha_sagrada",
    nome: "Batalha Sagrada",
    descricao: "combate ritual, sagrado vs profano, entidade maior, marca de Kian",
    spotify_playlist_uri: "spotify:playlist:0zDth6aEGtmIeFMDZwMCOl",
    ordem: 13,
  },
  {
    key: "perseguicao",
    nome: "Perseguição",
    descricao: "fuga, perseguição, corre, chase, emboscada em movimento",
    spotify_playlist_uri: "spotify:playlist:4tZDyaZ7YFfWXgNiyqxR4l",
    ordem: 14,
  },
  {
    key: "sagrado",
    nome: "Sagrado",
    descricao: "atmosfera sagrada, ritual, templos, espiritual, ominoso calmo",
    spotify_playlist_uri: "spotify:playlist:1E0aKFnknjIdpOaCj1OY6Y",
    ordem: 15,
  },
  {
    key: "felicidade",
    nome: "Felicidade",
    descricao: "alegria, família, alívio, momentos quentes, esperança",
    spotify_playlist_uri: "spotify:playlist:3mYDyikde3nHNZJaKjVEHE",
    ordem: 16,
  },
  {
    key: "tristeza",
    nome: "Tristeza",
    descricao: "luto, perda, adeus, melancolia, sacrifício",
    spotify_playlist_uri: "spotify:playlist:6fUg16vTTO0oXBIdaLC9hR",
    ordem: 17,
  },
  {
    key: "suspense",
    nome: "Suspense",
    descricao: "terror, horror, suspense cinematográfico, clima opressivo",
    spotify_playlist_uri: "spotify:playlist:4es5RmVnaacqXQa4tfVgD3",
    ordem: 18,
  },
];

export const CENA_PARA_MOOD: Record<SceneKey, string> = {
  combate: "combate_normal",
  exploracao: "investigacao",
  social: "festival",
  tensao: "tensao",
  descanso: "base",
  epico: "combate_epico",
};

/** Converte URL open.spotify.com ou URI em spotify:playlist:ID. */
export function normalizarPlaylistUri(input: string): string {
  const raw = input.trim();
  if (!raw) return "";
  if (raw.startsWith("spotify:playlist:")) {
    const [uri] = raw.split("?");
    return uri ?? raw;
  }
  const m = raw.match(/open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/);
  if (m?.[1]) return `spotify:playlist:${m[1]}`;
  if (/^[a-zA-Z0-9]{22}$/.test(raw)) return `spotify:playlist:${raw}`;
  return raw;
}

export function moodByKey(moods: MusicMood[], key: string | null) {
  if (!key) return null;
  return moods.find((m) => m.key === key) ?? null;
}

/** Carrega moods da BD; se a tabela estiver vazia ou falhar, usa o seed. */
export async function carregarMoods(): Promise<MusicMood[]> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase
      .from("music_moods")
      .select("*")
      .eq("ativo", true)
      .order("ordem");
    if (!error && data && data.length > 0) {
      return data as unknown as MusicMood[];
    }
    // Tabela vazia ou inexistente: tenta seed e devolve fallback local
    if (!error) {
      await supabase.from("music_moods").upsert(
        MOODS_SEED.map((m) => ({
          key: m.key,
          nome: m.nome,
          descricao: m.descricao,
          spotify_playlist_uri: m.spotify_playlist_uri,
          ordem: m.ordem,
          ativo: true,
        })),
        { onConflict: "key" },
      );
      const { data: again } = await supabase
        .from("music_moods")
        .select("*")
        .eq("ativo", true)
        .order("ordem");
      if (again && again.length > 0) return again as unknown as MusicMood[];
    }
  } catch {
    // ignore — fallback abaixo
  }
  return MOODS_SEED.map((m) => ({ ...m, ativo: true }));
}
