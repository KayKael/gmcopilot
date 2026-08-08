import { SFX_KEYS, type SfxKey } from "@/lib/scenes";

export interface SfxPack {
  id?: string;
  key: string;
  nome: string;
  efeitos: string[];
  built_in?: boolean;
  ativo?: boolean;
  ordem: number;
}

const PACK_KEY_LS = "gmcp.sfx.pack";

export const SFX_PACKS_SEED: SfxPack[] = [
  {
    key: "dnd",
    nome: "DnD",
    efeitos: [
      "espada",
      "porta",
      "magia",
      "passos",
      "moedas",
      "dragao",
      "trovao",
      "multidao",
    ],
    built_in: true,
    ativo: true,
    ordem: 1,
  },
  {
    key: "ordem_paranormal",
    nome: "Ordem Paranormal",
    efeitos: [
      "porta",
      "passos",
      "vento",
      "coracao",
      "trovao",
      "magia",
      "multidao",
      "dragao",
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
    ],
    built_in: true,
    ativo: true,
    ordem: 2,
  },
];

/** Slug estável a partir do nome (para packs criados na UI). */
export function slugPackKey(nome: string): string {
  const base = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  return base || `pack_${Date.now().toString(36)}`;
}

/** Filtra keys do pack para as que existem no catálogo (ordem do pack). */
export function efeitosDoPack(pack: SfxPack | null | undefined): SfxKey[] {
  if (!pack?.efeitos?.length) return [...SFX_KEYS];
  const catalog = new Set<string>(SFX_KEYS);
  return pack.efeitos.filter((k): k is SfxKey => catalog.has(k));
}

export function packByKey(packs: SfxPack[], key: string | null) {
  if (!key) return null;
  return packs.find((p) => p.key === key) ?? null;
}

export function obterPackAtivoKey(): string {
  if (typeof window === "undefined") return "ordem_paranormal";
  return localStorage.getItem(PACK_KEY_LS) || "ordem_paranormal";
}

export function definirPackAtivoKey(key: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PACK_KEY_LS, key);
}

/** Resolve pack activo a partir da lista (fallback para o primeiro activo / seed). */
export function resolverPackAtivo(packs: SfxPack[], preferido?: string | null): SfxPack {
  const activos = packs.filter((p) => p.ativo !== false);
  const lista = activos.length ? activos : packs;
  const key = preferido || obterPackAtivoKey();
  return packByKey(lista, key) ?? lista[0] ?? SFX_PACKS_SEED[0]!;
}

/** Acrescenta efeitos novos do seed a packs built-in (não remove os já configurados). */
function enriquecerBuiltIns(packs: SfxPack[]): SfxPack[] {
  return packs.map((p) => {
    const seed = SFX_PACKS_SEED.find((s) => s.key === p.key);
    if (!seed) return p;
    const missing = seed.efeitos.filter((e) => !p.efeitos.includes(e));
    if (!missing.length) return p;
    return { ...p, efeitos: [...p.efeitos, ...missing] };
  });
}

/** Carrega packs da BD (inclui inactivos para a UI de definições). */
export async function carregarPacks(opts?: {
  soActivos?: boolean;
}): Promise<SfxPack[]> {
  const soActivos = opts?.soActivos ?? false;
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    let q = supabase.from("sfx_packs").select("*").order("ordem");
    if (soActivos) q = q.eq("ativo", true);
    const { data, error } = await q;
    if (!error && data && data.length > 0) {
      const packs = enriquecerBuiltIns(data as unknown as SfxPack[]);
      return soActivos ? packs.filter((p) => p.ativo !== false) : packs;
    }
    if (!error) {
      await supabase.from("sfx_packs").upsert(
        SFX_PACKS_SEED.map((p) => ({
          key: p.key,
          nome: p.nome,
          efeitos: p.efeitos,
          built_in: p.built_in ?? false,
          ativo: p.ativo ?? true,
          ordem: p.ordem,
        })),
        { onConflict: "key" },
      );
      let q2 = supabase.from("sfx_packs").select("*").order("ordem");
      if (soActivos) q2 = q2.eq("ativo", true);
      const { data: again } = await q2;
      if (again && again.length > 0) {
        return enriquecerBuiltIns(again as unknown as SfxPack[]);
      }
    }
  } catch {
    // fallback abaixo
  }
  const seed = SFX_PACKS_SEED.map((p) => ({ ...p }));
  return soActivos ? seed.filter((p) => p.ativo !== false) : seed;
}
