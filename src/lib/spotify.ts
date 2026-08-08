import { SPOTIFY_CLIENT_ID, SPOTIFY_SCOPES } from "@/config/spotify";
import { normalizarPlaylistUri } from "@/lib/music-moods";
import {
  iniciarPonteProxima,
  terminarPonte,
  pararPonte,
  tempoPonteMs,
  resolverPreviewInicio,
} from "@/lib/spotify-crossfade";

const TOKEN_KEY = "gmcp.spotify.token";
const VERIFIER_KEY = "gmcp.spotify.verifier";
const DEVICE_KEY = "gmcp.spotify.device";
const RESUME_LOGIN_KEY = "gmcp.spotify.resume_login";
const CROSSFADE_KEY = "gmcp.spotify.crossfade";
const VOLUME_KEY = "gmcp.spotify.volume";
/** Bump quando scopes mudam — força ecrã de consentimento no próximo login. */
const SCOPES_VER_KEY = "gmcp.spotify.scopes_ver";
const SCOPES_VER = "2"; // playlist-read-private + collaborative
let resumeLoginDisparado = false;
let avisoPlaylist403Feito = false;

export interface SpotifyToken {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface SpotifyDevice {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
}

export interface NowPlaying {
  nome: string;
  artista: string;
  capa: string | null;
  aTocar: boolean;
}

export interface FaixaEscolhida {
  uri: string;
  preview_url: string | null;
  nome: string;
  artista?: string;
  isrc?: string | null;
}

/**
 * Spotify rejeita "localhost" como redirect URI.
 * Em desenvolvimento usamos sempre o loopback literal 127.0.0.1.
 * @see https://developer.spotify.com/documentation/web-api/concepts/redirect_uri
 */
export function redirectUri(): string {
  const { protocol, hostname, port } = window.location;
  const host =
    hostname === "localhost" || hostname === "[::1]" ? "127.0.0.1" : hostname;
  const porta = port ? `:${port}` : "";
  return `${protocol}//${host}${porta}/callback`;
}

export function getToken(): SpotifyToken | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SpotifyToken;
  } catch {
    return null;
  }
}

function saveToken(t: SpotifyToken) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
}

export function logoutSpotify() {
  localStorage.removeItem(TOKEN_KEY);
  // Próximo login pede de novo os scopes (playlist-read, etc.)
  localStorage.removeItem(SCOPES_VER_KEY);
}

function avisarPlaylist403() {
  if (avisoPlaylist403Feito) return;
  avisoPlaylist403Feito = true;
  // Força ecrã de consentimento no próximo “Ligar Spotify”
  localStorage.removeItem(SCOPES_VER_KEY);
  void import("sonner").then(({ toast }) => {
    toast.message("Sem acesso às faixas da playlist", {
      description:
        "Desliga e volta a Ligar o Spotify para autorizar leitura de playlists (crossfade). A troca de mood continua com posição aleatória.",
      duration: 8000,
    });
  });
}

export function getDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(DEVICE_KEY);
}

export function setDeviceId(id: string | null) {
  if (id) localStorage.setItem(DEVICE_KEY, id);
  else localStorage.removeItem(DEVICE_KEY);
}

/** Crossfade por ponte de preview (default ON). */
export function getCrossfadeEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const raw = localStorage.getItem(CROSSFADE_KEY);
  if (raw === null) return true;
  return raw === "1";
}

export function setCrossfadeEnabled(on: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CROSSFADE_KEY, on ? "1" : "0");
}

function randomString(len: number) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join("");
}

async function challengeFrom(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function iniciarLoginSpotify() {
  if (!SPOTIFY_CLIENT_ID) throw new Error("Client ID do Spotify em falta");

  if (window.location.hostname === "localhost" || window.location.hostname === "[::1]") {
    const url = new URL(window.location.href);
    url.hostname = "127.0.0.1";
    sessionStorage.setItem(RESUME_LOGIN_KEY, "1");
    window.location.replace(url.toString());
    return;
  }

  const verifier = randomString(64);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri(),
    scope: SPOTIFY_SCOPES,
    code_challenge_method: "S256",
    code_challenge: await challengeFrom(verifier),
  });
  // Força re-consentimento se os scopes da app mudaram (ex.: playlist-read)
  if (localStorage.getItem(SCOPES_VER_KEY) !== SCOPES_VER) {
    params.set("show_dialog", "true");
  }
  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

/** Continua o OAuth depois do salto localhost → 127.0.0.1 (idempotente). */
export function maybeResumeSpotifyLogin(): void {
  if (resumeLoginDisparado) return;
  if (sessionStorage.getItem(RESUME_LOGIN_KEY) !== "1") return;
  resumeLoginDisparado = true;
  sessionStorage.removeItem(RESUME_LOGIN_KEY);
  void iniciarLoginSpotify();
}

async function tokenRequest(body: Record<string, string>): Promise<SpotifyToken> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description ?? "Falha na autenticação do Spotify");
  }
  const token: SpotifyToken = {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? getToken()?.refresh_token ?? "",
    expires_at: Date.now() + (json.expires_in ?? 3600) * 1000 - 60_000,
  };
  saveToken(token);
  return token;
}

export async function trocarCodigoPorToken(code: string) {
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error("Sessão de login expirada");
  sessionStorage.removeItem(VERIFIER_KEY);
  const token = await tokenRequest({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
  });
  localStorage.setItem(SCOPES_VER_KEY, SCOPES_VER);
  avisoPlaylist403Feito = false;
  return token;
}

async function accessTokenValido(): Promise<string | null> {
  const token = getToken();
  if (!token) return null;
  if (Date.now() < token.expires_at) return token.access_token;
  if (!token.refresh_token) return null;
  try {
    const novo = await tokenRequest({
      client_id: SPOTIFY_CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
    });
    return novo.access_token;
  } catch {
    logoutSpotify();
    return null;
  }
}

let rateLimitAte = 0;

export async function spotifyFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response | null> {
  const access = await accessTokenValido();
  if (!access) return null;

  // Respeita cooldown após 429
  const espera = rateLimitAte - Date.now();
  if (espera > 0) await sleep(Math.min(espera, 5000));

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${access}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const url = path.startsWith("http") ? path : `https://api.spotify.com/v1${path}`;

  let res = await fetch(url, { ...init, headers });

  if (res.status === 429) {
    const retry = Number(res.headers.get("Retry-After") || "2");
    const ms = Math.min(Math.max(retry, 1) * 1000, 8000);
    rateLimitAte = Date.now() + ms;
    await sleep(ms);
    res = await fetch(url, { ...init, headers });
  }

  return res;
}

function comDispositivo(path: string) {
  const id = getDeviceId();
  return id ? `${path}${path.includes("?") ? "&" : "?"}device_id=${id}` : path;
}

export async function obterAtual(): Promise<NowPlaying | null> {
  const res = await spotifyFetch("/me/player");
  if (!res || res.status === 204 || !res.ok) return null;
  const data = (await res.json()) as {
    is_playing?: boolean;
    item?: {
      name?: string;
      artists?: { name: string }[];
      album?: { images?: { url: string }[] };
    } | null;
  };
  if (!data.item) return null;
  return {
    nome: data.item.name ?? "—",
    artista: (data.item.artists ?? []).map((a) => a.name).join(", "),
    capa: data.item.album?.images?.[0]?.url ?? null,
    aTocar: Boolean(data.is_playing),
  };
}

export async function listarDispositivos(): Promise<SpotifyDevice[]> {
  const res = await spotifyFetch("/me/player/devices");
  if (!res || !res.ok) return [];
  const data = (await res.json()) as { devices?: SpotifyDevice[] };
  return data.devices ?? [];
}

export async function play() {
  await spotifyFetch(comDispositivo("/me/player/play"), { method: "PUT" });
}

export async function pause() {
  await spotifyFetch(comDispositivo("/me/player/pause"), { method: "PUT" });
}

export function obterVolumePreferido(fallback = 70): number {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(VOLUME_KEY);
  if (raw === null) return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : fallback;
}

export function guardarVolumePreferido(percent: number) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    VOLUME_KEY,
    String(Math.max(0, Math.min(100, Math.round(percent)))),
  );
}

export async function definirVolume(percent: number, { persistir = true } = {}) {
  const v = Math.max(0, Math.min(100, Math.round(percent)));
  if (persistir) guardarVolumePreferido(v);
  await spotifyFetch(comDispositivo(`/me/player/volume?volume_percent=${v}`), {
    method: "PUT",
  });
}

/** Volume alvo da app (preferido). Na 1ª vez, sincroniza com o device. */
export async function obterVolumeSpotify(): Promise<number> {
  if (typeof window !== "undefined" && localStorage.getItem(VOLUME_KEY) === null) {
    const actual = await volumeAtual();
    guardarVolumePreferido(actual);
    return actual;
  }
  return obterVolumePreferido();
}

export async function transferirPara(deviceId: string) {
  setDeviceId(deviceId);
  await spotifyFetch("/me/player", {
    method: "PUT",
    body: JSON.stringify({ device_ids: [deviceId], play: false }),
  });
}

let playlistTransitionGen = 0;
let playlistTransitionAbort: AbortController | null = null;

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(() => resolve(), ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

async function volumeAtual(): Promise<number> {
  const res = await spotifyFetch("/me/player");
  if (!res || res.status === 204 || !res.ok) return 70;
  const data = (await res.json()) as { device?: { volume_percent?: number | null } };
  const v = data.device?.volume_percent;
  return typeof v === "number" ? v : 70;
}

/** Fade suave do volume Spotify (poucos passos para evitar 429). */
async function fadeVolumeSpotify(
  de: number,
  para: number,
  signal: AbortSignal,
  duracaoMs: number,
) {
  const steps = 8;
  const stepMs = Math.max(280, Math.round(duracaoMs / steps));
  let ultimo = Math.round(de);
  for (let i = 1; i <= steps; i++) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const t = i / steps;
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const v = Math.round(de + (para - de) * eased);
    if (v !== ultimo) {
      await definirVolume(Math.max(0, Math.min(100, v)), { persistir: false });
      ultimo = v;
    }
    await sleep(stepMs, signal);
  }
  if (ultimo !== Math.round(para)) {
    await definirVolume(Math.max(0, Math.min(100, Math.round(para))), { persistir: false });
  }
}

function iniciarTransicao() {
  playlistTransitionAbort?.abort();
  pararPonte();
  const ac = new AbortController();
  playlistTransitionAbort = ac;
  const gen = ++playlistTransitionGen;
  return {
    signal: ac.signal,
    aindaActiva: () => gen === playlistTransitionGen && !ac.signal.aborted,
  };
}

async function activarDispositivo(): Promise<string | null> {
  const devices = await listarDispositivos();
  if (!devices.length) return null;
  const preferido =
    devices.find((d) => d.id === getDeviceId()) ??
    devices.find((d) => d.is_active) ??
    devices[0];
  if (!preferido?.id) return null;
  await transferirPara(preferido.id);
  await sleep(250);
  return preferido.id;
}

/**
 * Escolhe alvo aleatório na playlist.
 * Feb 2026: `/tracks` foi substituído por `/items` e só funciona em playlists
 * que o user possui/colabora. Se 403, usamos só posição aleatória (sem spam).
 */
export type AlvoPlaylist =
  | { mode: "track"; uri: string; preview_url: string | null; nome: string }
  | { mode: "position"; position: number };

/** Após 403, não voltamos a pedir items nesta sessão (evita spam + 429). */
let playlistItemsBloqueado = false;

async function totalFaixasPlaylist(id: string): Promise<number> {
  // Preferir campo novo `items.total`; fallback `tracks.total`
  const meta = await spotifyFetch(
    `/playlists/${id}?fields=items.total,tracks.total&market=from_token`,
  );
  if (!meta?.ok) return 0;
  const m = (await meta.json()) as {
    items?: { total?: number };
    tracks?: { total?: number };
  };
  return m.items?.total ?? m.tracks?.total ?? 0;
}

export async function escolherAlvoPlaylist(
  playlistUri: string,
): Promise<AlvoPlaylist> {
  const id = playlistUri.replace(/^spotify:playlist:/, "");
  const total = id && !playlistItemsBloqueado ? await totalFaixasPlaylist(id) : 0;
  const fallbackPosition =
    total > 1 ? Math.floor(Math.random() * total) : Math.floor(Math.random() * 40);

  if (!id || playlistItemsBloqueado) {
    return { mode: "position", position: fallbackPosition };
  }

  const limit = 50;
  const maxOffset =
    total > limit ? Math.floor(Math.random() * Math.max(1, total - limit + 1)) : 0;

  // Endpoint novo (tracks está deprecated / 403)
  const res = await spotifyFetch(
    `/playlists/${id}/items?market=from_token&limit=${limit}&offset=${maxOffset}`,
  );

  if (res?.status === 401 || res?.status === 403) {
    playlistItemsBloqueado = true;
    avisarPlaylist403();
    return { mode: "position", position: fallbackPosition };
  }

  if (!res?.ok) {
    return { mode: "position", position: fallbackPosition };
  }

  const data = (await res.json()) as {
    items?: {
      item?: {
        uri?: string;
        preview_url?: string | null;
        name?: string;
        type?: string;
        is_local?: boolean;
        artists?: { name: string }[];
      } | null;
      track?: {
        uri?: string;
        preview_url?: string | null;
        name?: string;
        is_local?: boolean;
        artists?: { name: string }[];
      } | null;
    }[];
  };

  const faixas: FaixaEscolhida[] = [];
  for (const row of data.items ?? []) {
    const t = row.item ?? row.track;
    if (!t?.uri?.startsWith("spotify:track:") || t.is_local) continue;
    faixas.push({
      uri: t.uri,
      preview_url: t.preview_url ?? null,
      nome: t.name ?? "—",
      artista: (t.artists ?? []).map((a) => a.name).join(" "),
    });
  }

  if (!faixas.length) {
    return { mode: "position", position: fallbackPosition };
  }

  // Qualquer faixa serve — o pedaço do início vem do Deezer/iTunes, não do preview Spotify
  const escolha = faixas[Math.floor(Math.random() * faixas.length)]!;
  const meta = await obterMetaFaixa(escolha);
  return {
    mode: "track",
    uri: meta.uri,
    preview_url: null, // nunca usar preview Spotify (meio da faixa)
    nome: meta.nome,
  };
}

export async function escolherFaixaAleatoria(
  playlistUri: string,
): Promise<FaixaEscolhida | null> {
  const alvo = await escolherAlvoPlaylist(playlistUri);
  if (alvo.mode !== "track") return null;
  return {
    uri: alvo.uri,
    preview_url: alvo.preview_url,
    nome: alvo.nome,
  };
}

/** Próxima faixa na fila, com nome/artista para resolver preview do início. */
async function obterProximaDaFila(): Promise<FaixaEscolhida | null> {
  const res = await spotifyFetch("/me/player/queue");
  if (!res?.ok) return null;
  const data = (await res.json()) as {
    queue?: {
      uri?: string;
      name?: string;
      artists?: { name: string }[];
    }[];
  };
  const next = data.queue?.[0];
  if (!next?.uri?.startsWith("spotify:track:")) return null;
  return obterMetaFaixa({
    uri: next.uri,
    preview_url: null,
    nome: next.name ?? "—",
    artista: (next.artists ?? []).map((a) => a.name).join(" "),
  });
}

/** Nome + artista + ISRC via Get Track (para preview do início fiável). */
async function obterMetaFaixa(faixa: FaixaEscolhida): Promise<FaixaEscolhida> {
  const id = faixa.uri.replace(/^spotify:track:/, "");
  if (!id) return faixa;
  const tr = await spotifyFetch(`/tracks/${id}?market=from_token`);
  if (!tr?.ok) return faixa;
  const t = (await tr.json()) as {
    name?: string;
    artists?: { name: string }[];
    external_ids?: { isrc?: string };
  };
  return {
    ...faixa,
    nome: t.name ?? faixa.nome,
    artista: (t.artists ?? []).map((a) => a.name).join(" ") || faixa.artista || "",
    isrc: t.external_ids?.isrc ?? faixa.isrc ?? null,
    preview_url: null,
  };
}

/**
 * Crossfade com volumes encaixados:
 * Spotify desce um pouco enquanto o preview (baixo) sobe → troca →
 * Spotify sobe e preview desce em espelho.
 */
async function comCrossfade(
  acao: (positionMs: number) => Promise<void>,
  previewInicio: string | null,
): Promise<boolean> {
  const { signal, aindaActiva } = iniciarTransicao();
  const crossfadeOn = getCrossfadeEnabled();

  try {
    const deviceVol = await volumeAtual();
    const baseVol = obterVolumePreferido(deviceVol);
    // Preview HTML soa mais alto que o Spotify — manter bem baixo
    const ponteVol = Math.min(0.14, Math.max(0.07, (baseVol / 100) * 0.16));
    // Dip suave da actual para o preview encaixar sem pico
    const volDip = Math.max(28, Math.round(baseVol * 0.62));
    const fadeInMs = 2800;
    const overlapMs = 900;
    const fadeOutMs = 3200;

    let ponteOk = false;
    let positionMs = 0;

    if (crossfadeOn && previewInicio) {
      // Actual desce + pedaço da próxima sobe (suave, em paralelo)
      const [, ok] = await Promise.all([
        fadeVolumeSpotify(baseVol, volDip, signal, fadeInMs),
        iniciarPonteProxima(previewInicio, signal, fadeInMs, ponteVol),
      ]);
      ponteOk = ok;
      if (ponteOk && aindaActiva()) {
        await sleep(overlapMs, signal);
      }
      positionMs = tempoPonteMs();
    }

    if (!aindaActiva()) {
      pararPonte();
      return false;
    }

    await acao(positionMs);
    if (!aindaActiva()) {
      pararPonte();
      return false;
    }

    // Nova faixa entra já no volDip; sobe em espelho com o fade-out do preview
    await definirVolume(volDip, { persistir: false });
    await sleep(120, signal);

    if (ponteOk && aindaActiva()) {
      await Promise.all([
        fadeVolumeSpotify(volDip, baseVol, signal, fadeOutMs),
        terminarPonte(signal, fadeOutMs),
      ]);
    } else {
      pararPonte();
      if (aindaActiva()) {
        await fadeVolumeSpotify(volDip, baseVol, signal, Math.min(fadeOutMs, 2000));
      }
    }

    if (aindaActiva()) {
      await definirVolume(baseVol, { persistir: false });
    }

    return aindaActiva();
  } catch (e) {
    pararPonte();
    if (e instanceof DOMException && e.name === "AbortError") return false;
    console.error(e);
    try {
      const base = obterVolumePreferido(70);
      await definirVolume(base, { persistir: false });
    } catch {
      // ignore
    }
    return false;
  }
}

async function seekPosicao(positionMs: number) {
  if (positionMs <= 0) return;
  await spotifyFetch(
    comDispositivo(`/me/player/seek?position_ms=${Math.round(positionMs)}`),
    { method: "PUT" },
  );
}

/** Skip: pedaço do início da próxima → play alinhado. */
export async function seguinte() {
  let previewInicio: string | null = null;
  let proxima: FaixaEscolhida | null = null;

  if (getCrossfadeEnabled()) {
    proxima = await obterProximaDaFila();
    if (proxima) {
      previewInicio = await resolverPreviewInicio(
        proxima.nome,
        proxima.artista ?? "",
        proxima.isrc,
      );
    }
  }

  await comCrossfade(async (positionMs) => {
    if (proxima?.uri) {
      const res = await spotifyFetch(comDispositivo("/me/player/play"), {
        method: "PUT",
        body: JSON.stringify({
          uris: [proxima.uri],
          position_ms: positionMs,
        }),
      });
      if (!res?.ok && res?.status !== 204) {
        await spotifyFetch(comDispositivo("/me/player/next"), { method: "POST" });
        await seekPosicao(positionMs);
      }
    } else {
      await spotifyFetch(comDispositivo("/me/player/next"), { method: "POST" });
      await seekPosicao(positionMs);
    }
  }, previewInicio);
}

export type TocarPlaylistResult = "ok" | "premium" | "nodevice" | "fail" | "cancelled";

/**
 * Troca de playlist com crossfade no início da faixa alvo.
 */
export async function tocarPlaylist(
  uri: string,
  fade = true,
): Promise<TocarPlaylistResult> {
  const contextUri = normalizarPlaylistUri(uri);
  if (!contextUri.startsWith("spotify:playlist:")) return "fail";

  const alvo = await escolherAlvoPlaylist(contextUri);
  const offset =
    alvo.mode === "track"
      ? { uri: alvo.uri }
      : { position: alvo.position };

  let previewInicio: string | null = null;
  if (fade && getCrossfadeEnabled() && alvo.mode === "track") {
    const meta = await obterMetaFaixa({
      uri: alvo.uri,
      preview_url: null,
      nome: alvo.nome,
    });
    previewInicio = await resolverPreviewInicio(
      meta.nome,
      meta.artista ?? "",
      meta.isrc,
    );
  }

  if (!fade) {
    const body = JSON.stringify({
      context_uri: contextUri,
      offset,
      position_ms: 0,
    });
    const res = await spotifyFetch(comDispositivo("/me/player/play"), {
      method: "PUT",
      body,
    });
    if (res?.ok || res?.status === 204) {
      await spotifyFetch(comDispositivo("/me/player/shuffle?state=true"), {
        method: "PUT",
      });
    }
    if (res?.status === 403) return "premium";
    if (res?.status === 404) return "nodevice";
    return res?.ok || res?.status === 204 ? "ok" : "fail";
  }

  let resultado: TocarPlaylistResult = "ok";
  let falhou: TocarPlaylistResult | null = null;

  const ok = await comCrossfade(async (positionMs) => {
    const body = JSON.stringify({
      context_uri: contextUri,
      offset,
      position_ms: positionMs,
    });

    let res = await spotifyFetch(comDispositivo("/me/player/play"), {
      method: "PUT",
      body,
    });

    if (res?.status === 404) {
      const deviceId = await activarDispositivo();
      if (!deviceId) {
        falhou = "nodevice";
        return;
      }
      res = await spotifyFetch(`/me/player/play?device_id=${deviceId}`, {
        method: "PUT",
        body,
      });
    }

    if (res?.status === 403) {
      falhou = "premium";
      return;
    }
    if (res?.status === 404) {
      falhou = "nodevice";
      return;
    }
    if (!res?.ok && res?.status !== 204) {
      falhou = "fail";
      return;
    }

    await spotifyFetch(comDispositivo("/me/player/shuffle?state=true"), {
      method: "PUT",
    });
  }, previewInicio);

  if (falhou) return falhou;
  return ok ? resultado : "cancelled";
}

/** Cancela fade/transição em curso (ex.: nova troca imediata). */
export function cancelarTransicaoPlaylist() {
  playlistTransitionAbort?.abort();
  playlistTransitionAbort = null;
  playlistTransitionGen += 1;
  pararPonte();
}
