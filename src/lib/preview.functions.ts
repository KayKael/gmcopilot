import { createServerFn } from "@tanstack/react-start";

type DeezerTrack = {
  title?: string;
  title_short?: string;
  preview?: string;
  artist?: { name?: string };
};

type ItunesTrack = {
  previewUrl?: string;
  trackName?: string;
  artistName?: string;
};

/** Normaliza para comparação: minúsculas, sem acentos, sem pontuação extra. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s*[\(\[\{].*?[\)\]\}]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titulosCompativeis(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // um contém o outro (ex.: "Pegadas" vs "Pegadas - Ordem Paranormal")
  if (na.includes(nb) || nb.includes(na)) {
    const shorter = na.length <= nb.length ? na : nb;
    return shorter.length >= 4;
  }
  return false;
}

function artistasCompativeis(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // "Saint Juvi" vs "Saint Juvi, Feat. X"
  const partsA = na.split(/\s*(?:,|&|feat|ft|with)\s*/).filter(Boolean);
  const partsB = nb.split(/\s*(?:,|&|feat|ft|with)\s*/).filter(Boolean);
  return partsA.some((pa) => partsB.some((pb) => pa.includes(pb) || pb.includes(pa)));
}

/**
 * Só aceita hit se título E artista baterem.
 * Nunca devolve o "primeiro resultado" — isso tocava música aleatória.
 */
function escolherHitEstrito<T>(
  results: T[],
  nome: string,
  artista: string,
  getTitle: (r: T) => string,
  getArtist: (r: T) => string,
  getPreview: (r: T) => string | undefined,
): string | null {
  for (const r of results) {
    const preview = getPreview(r);
    if (!preview) continue;
    if (!titulosCompativeis(getTitle(r), nome)) continue;
    if (!artistasCompativeis(getArtist(r), artista)) continue;
    return preview;
  }
  return null;
}

async function deezerPorIsrc(isrc: string): Promise<string | null> {
  const code = isrc.trim().toUpperCase();
  if (code.length < 8) return null;
  const res = await fetch(`https://api.deezer.com/track/isrc:${encodeURIComponent(code)}`);
  if (!res.ok) return null;
  const t = (await res.json()) as { preview?: string; error?: unknown };
  if (t.error || !t.preview) return null;
  return t.preview;
}

async function searchDeezer(q: string): Promise<DeezerTrack[]> {
  const url = `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=10`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as { data?: DeezerTrack[] };
  return data.data ?? [];
}

async function searchItunes(term: string): Promise<ItunesTrack[]> {
  const url =
    `https://itunes.apple.com/search?term=${encodeURIComponent(term)}` +
    `&entity=song&limit=10`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: ItunesTrack[] };
  return data.results ?? [];
}

/**
 * Proxy server-side: ISRC → Deezer estrito → iTunes estrito.
 * Sem match fiável = null (sem música aleatória na transição).
 */
export const buscarPreviewInicio = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { nome: string; artista: string; isrc?: string | null }) => input,
  )
  .handler(async ({ data }): Promise<string | null> => {
    const nomeLimpo = data.nome.trim();
    const artistaLimpo = data.artista.trim();
    if (nomeLimpo.length < 2) return null;

    // 1) Mesma gravação via ISRC (melhor)
    if (data.isrc) {
      try {
        const byIsrc = await deezerPorIsrc(data.isrc);
        if (byIsrc) return byIsrc;
      } catch {
        // segue para match por nome
      }
    }

    // 2) Deezer: só queries com artista+título; match estrito
    if (artistaLimpo) {
      const deezerQueries = [
        `artist:"${artistaLimpo}" track:"${nomeLimpo}"`,
        `${artistaLimpo} ${nomeLimpo}`,
      ];
      for (const q of deezerQueries) {
        try {
          const results = await searchDeezer(q);
          const preview = escolherHitEstrito(
            results,
            nomeLimpo,
            artistaLimpo,
            (r) => r.title_short ?? r.title ?? "",
            (r) => r.artist?.name ?? "",
            (r) => r.preview,
          );
          if (preview) return preview;
        } catch {
          // query seguinte
        }
      }
    }

    // 3) iTunes: idem, estrito
    if (artistaLimpo) {
      try {
        const results = await searchItunes(`${artistaLimpo} ${nomeLimpo}`);
        const preview = escolherHitEstrito(
          results,
          nomeLimpo,
          artistaLimpo,
          (r) => r.trackName ?? "",
          (r) => r.artistName ?? "",
          (r) => r.previewUrl,
        );
        if (preview) return preview;
      } catch {
        // sem preview
      }
    }

    return null;
  });
