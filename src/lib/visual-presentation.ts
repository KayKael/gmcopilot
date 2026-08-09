import { supabase } from "@/integrations/supabase/client";
import type { VisualAsset } from "@/lib/visual-assets";

export const PRESENTATION_ID = "default";
export const VISUAL_CHANNEL = "gmcp-visual";
export const VISUAL_STORAGE_KEY = "gmcp.visual.presentation";
export const VISUAL_EVENT = "gmcp-visual-state";
export const VISUAL_POST_TYPE = "gmcp-visual";

export interface PresentationState {
  active_asset_id: string | null;
  public_url: string | null;
  nome: string | null;
  overlay_asset_id: string | null;
  overlay_url: string | null;
  overlay_nome: string | null;
  fade_ms: number;
  updated_at: string;
  /** Monotonic local counter — used to dedupe BC+storage and ignore stale applies. */
  epoch: number;
}

export type PresentationMessage =
  | { type: "state"; state: PresentationState }
  | { type: "ping" };

export type PresentationPostMessage = {
  type: typeof VISUAL_POST_TYPE;
  state: PresentationState;
};

const DEFAULT_FADE = 200;
const PRELOAD_TIMEOUT_MS = 1500;

let channel: BroadcastChannel | null = null;
let channelFailed = false;
let presentationWindow: Window | null = null;
const preloadCache = new Map<string, Promise<void>>();

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  if (channelFailed) return null;
  if (channel) return channel;
  try {
    channel = new BroadcastChannel(VISUAL_CHANNEL);
    return channel;
  } catch {
    channelFailed = true;
    return null;
  }
}

export function parseUpdatedAtMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

export function isPresentationNewer(
  a: Pick<PresentationState, "epoch" | "updated_at">,
  b: Pick<PresentationState, "epoch" | "updated_at">,
): boolean {
  const epochA = a.epoch ?? 0;
  const epochB = b.epoch ?? 0;
  if (epochA !== epochB) return epochA > epochB;
  return parseUpdatedAtMs(a.updated_at) > parseUpdatedAtMs(b.updated_at);
}

function normalizeState(raw: unknown): PresentationState | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<PresentationState>;
  return {
    active_asset_id: s.active_asset_id ?? null,
    public_url: s.public_url ?? null,
    nome: s.nome ?? null,
    overlay_asset_id: s.overlay_asset_id ?? null,
    overlay_url: s.overlay_url ?? null,
    overlay_nome: s.overlay_nome ?? null,
    fade_ms: typeof s.fade_ms === "number" ? s.fade_ms : DEFAULT_FADE,
    updated_at:
      typeof s.updated_at === "string" ? s.updated_at : new Date().toISOString(),
    epoch: typeof s.epoch === "number" && Number.isFinite(s.epoch) ? s.epoch : 0,
  };
}

function nextEpoch(prev?: PresentationState | null): number {
  return (prev?.epoch ?? 0) + 1;
}

function emptyState(
  fade_ms = DEFAULT_FADE,
  prev?: PresentationState | null,
): PresentationState {
  return {
    active_asset_id: null,
    public_url: null,
    nome: null,
    overlay_asset_id: prev?.overlay_asset_id ?? null,
    overlay_url: prev?.overlay_url ?? null,
    overlay_nome: prev?.overlay_nome ?? null,
    fade_ms,
    updated_at: new Date().toISOString(),
    epoch: nextEpoch(prev),
  };
}

function buildBgState(
  asset: VisualAsset | null,
  fade_ms: number,
  prev?: PresentationState | null,
): PresentationState {
  return {
    active_asset_id: asset?.id ?? null,
    public_url: asset?.public_url ?? null,
    nome: asset?.nome ?? null,
    overlay_asset_id: prev?.overlay_asset_id ?? null,
    overlay_url: prev?.overlay_url ?? null,
    overlay_nome: prev?.overlay_nome ?? null,
    fade_ms,
    updated_at: new Date().toISOString(),
    epoch: nextEpoch(prev),
  };
}

function postToPresentationWindow(state: PresentationState) {
  if (typeof window === "undefined") return;
  const w = presentationWindow;
  if (!w || w.closed) {
    presentationWindow = null;
    return;
  }
  try {
    w.postMessage(
      { type: VISUAL_POST_TYPE, state } satisfies PresentationPostMessage,
      window.location.origin,
    );
  } catch {
    /* ignore */
  }
}

/** Publica já (postMessage direto + BC + localStorage + CustomEvent). */
export function publishPresentation(state: PresentationState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(VISUAL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  postToPresentationWindow(state);
  try {
    getChannel()?.postMessage({ type: "state", state } satisfies PresentationMessage);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(VISUAL_EVENT, { detail: state }));
  } catch {
    /* ignore */
  }
}

export function readLocalPresentation(): PresentationState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(VISUAL_STORAGE_KEY);
    if (!raw) return null;
    return normalizeState(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Warm-cache only — never gate the presentation swap on this. */
export function preloadImage(url: string | null | undefined): Promise<void> {
  if (!url || typeof window === "undefined") return Promise.resolve();
  const cached = preloadCache.get(url);
  if (cached) return cached;

  const promise = new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };

    const timer = window.setTimeout(finish, PRELOAD_TIMEOUT_MS);
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      window.clearTimeout(timer);
      if (typeof img.decode === "function") {
        void img.decode().then(finish).catch(finish);
      } else {
        finish();
      }
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      preloadCache.delete(url);
      finish();
    };
    img.src = url;
  });

  preloadCache.set(url, promise);
  return promise;
}

export function preloadImages(urls: (string | null | undefined)[]) {
  for (const url of urls) void preloadImage(url);
}

async function persistPresentation(state: PresentationState): Promise<void> {
  const { error } = await supabase.from("visual_presentation").upsert(
    {
      id: PRESENTATION_ID,
      active_asset_id: state.active_asset_id,
      overlay_asset_id: state.overlay_asset_id,
      fade_ms: state.fade_ms,
      updated_at: state.updated_at,
    },
    { onConflict: "id" },
  );
  if (error) throw error;
}

async function resolveAssetMeta(
  id: string | null,
): Promise<{ public_url: string | null; nome: string | null }> {
  if (!id) return { public_url: null, nome: null };
  const { data } = await supabase
    .from("visual_assets")
    .select("public_url, nome")
    .eq("id", id)
    .maybeSingle();
  return { public_url: data?.public_url ?? null, nome: data?.nome ?? null };
}

export async function carregarPresentation(): Promise<PresentationState> {
  const localBefore = readLocalPresentation();

  const { data, error } = await supabase
    .from("visual_presentation")
    .select("active_asset_id, overlay_asset_id, fade_ms, updated_at")
    .eq("id", PRESENTATION_ID)
    .maybeSingle();

  if (error) throw error;

  const local = readLocalPresentation() ?? localBefore;

  if (!data) {
    if (local) return local;
    return emptyState(DEFAULT_FADE, null);
  }

  if (local && parseUpdatedAtMs(local.updated_at) >= parseUpdatedAtMs(data.updated_at)) {
    return local;
  }

  let public_url: string | null = null;
  let nome: string | null = null;
  if (data.active_asset_id) {
    if (local?.active_asset_id === data.active_asset_id && local.public_url) {
      public_url = local.public_url;
      nome = local.nome;
    } else {
      const meta = await resolveAssetMeta(data.active_asset_id);
      const localAfter = readLocalPresentation();
      if (
        localAfter &&
        parseUpdatedAtMs(localAfter.updated_at) >= parseUpdatedAtMs(data.updated_at)
      ) {
        return localAfter;
      }
      public_url = meta.public_url;
      nome = meta.nome;
    }
  }

  let overlay_url: string | null = null;
  let overlay_nome: string | null = null;
  const overlayId = data.overlay_asset_id ?? null;
  if (overlayId) {
    if (local?.overlay_asset_id === overlayId && local.overlay_url) {
      overlay_url = local.overlay_url;
      overlay_nome = local.overlay_nome;
    } else {
      const meta = await resolveAssetMeta(overlayId);
      const localAfter = readLocalPresentation();
      if (
        localAfter &&
        parseUpdatedAtMs(localAfter.updated_at) >= parseUpdatedAtMs(data.updated_at)
      ) {
        return localAfter;
      }
      overlay_url = meta.public_url;
      overlay_nome = meta.nome;
    }
  }

  const localFinal = readLocalPresentation() ?? local;
  if (
    localFinal &&
    parseUpdatedAtMs(localFinal.updated_at) >= parseUpdatedAtMs(data.updated_at)
  ) {
    return localFinal;
  }

  return {
    active_asset_id: data.active_asset_id,
    public_url,
    nome,
    overlay_asset_id: overlayId,
    overlay_url,
    overlay_nome,
    fade_ms: data.fade_ms ?? DEFAULT_FADE,
    updated_at: data.updated_at,
    epoch: localFinal?.epoch ?? 0,
  };
}

export function definirFadeMs(fade_ms: number): PresentationState {
  const clamped = Math.max(0, Math.min(10000, Math.round(fade_ms)));
  const prev = readLocalPresentation();
  const state: PresentationState = {
    ...(prev ?? emptyState(clamped, null)),
    fade_ms: clamped,
    updated_at: new Date().toISOString(),
    epoch: prev?.epoch ?? 0,
  };
  try {
    localStorage.setItem(VISUAL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  void persistPresentation(state).catch((e) => console.error("persist fade:", e));
  return state;
}

/** Publica fundo de imediato — preserva overlay ativo. */
export function apresentarAsset(
  asset: VisualAsset | null,
  fade_ms?: number,
): PresentationState {
  const prev = readLocalPresentation();
  const fade = fade_ms ?? prev?.fade_ms ?? DEFAULT_FADE;
  const state = buildBgState(asset, fade, prev);

  publishPresentation(state);
  if (asset?.public_url) void preloadImage(asset.public_url);
  void persistPresentation(state).catch((e) => console.error("persist apresentação:", e));
  return state;
}

export function limparEcran(fade_ms?: number): PresentationState {
  return apresentarAsset(null, fade_ms);
}

/** Mostra/troca o overlay (preserva o fundo). */
export function mostrarOverlay(asset: VisualAsset | null): PresentationState {
  const prev = readLocalPresentation() ?? emptyState(DEFAULT_FADE, null);
  const state: PresentationState = {
    ...prev,
    overlay_asset_id: asset?.id ?? null,
    overlay_url: asset?.public_url ?? null,
    overlay_nome: asset?.nome ?? null,
    updated_at: new Date().toISOString(),
    epoch: nextEpoch(prev),
  };
  publishPresentation(state);
  if (asset?.public_url) void preloadImage(asset.public_url);
  void persistPresentation(state).catch((e) => console.error("persist overlay:", e));
  return state;
}

export function limparOverlay(): PresentationState {
  return mostrarOverlay(null);
}

export function isPresentationWindowOpen(): boolean {
  return !!(presentationWindow && !presentationWindow.closed);
}

/** Subscreve mudanças (postMessage + BroadcastChannel + storage + CustomEvent). */
export function subscribePresentation(
  onState: (state: PresentationState) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  let lastEpoch = -1;

  const deliver = (raw: unknown) => {
    const state = normalizeState(raw);
    if (!state) return;
    const epoch = state.epoch ?? 0;
    if (epoch <= lastEpoch) return;
    lastEpoch = epoch;
    onState(state);
  };

  const ch = getChannel();
  const onMessage = (ev: MessageEvent<PresentationMessage>) => {
    if (ev.data?.type === "state") deliver(ev.data.state);
  };
  ch?.addEventListener("message", onMessage);

  const onStorage = (e: StorageEvent) => {
    if (e.key !== VISUAL_STORAGE_KEY || !e.newValue) return;
    try {
      deliver(JSON.parse(e.newValue));
    } catch {
      /* ignore */
    }
  };
  window.addEventListener("storage", onStorage);

  const onLocal = (e: Event) => {
    deliver((e as CustomEvent).detail);
  };
  window.addEventListener(VISUAL_EVENT, onLocal);

  const onWindowMessage = (e: MessageEvent) => {
    if (e.origin !== window.location.origin) return;
    const data = e.data as PresentationPostMessage | undefined;
    if (!data || data.type !== VISUAL_POST_TYPE) return;
    deliver(data.state);
  };
  window.addEventListener("message", onWindowMessage);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(VISUAL_EVENT, onLocal);
    window.removeEventListener("message", onWindowMessage);
    ch?.removeEventListener("message", onMessage);
  };
}

export function abrirJanelaApresentacao(): Window | null {
  if (typeof window === "undefined") return null;

  if (presentationWindow && !presentationWindow.closed) {
    try {
      presentationWindow.focus();
    } catch {
      /* ignore */
    }
    return presentationWindow;
  }

  const w = window.open("/apresentar", "gmcp-apresentar");
  if (!w) {
    console.warn("Popup bloqueado — permite popups para abrir a apresentação.");
    presentationWindow = null;
    return null;
  }
  presentationWindow = w;
  try {
    w.focus();
  } catch {
    /* ignore */
  }
  return w;
}
