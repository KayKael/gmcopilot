import { SPOTIFY_CLIENT_ID, SPOTIFY_SCOPES } from "@/config/spotify";
import { normalizarPlaylistUri } from "@/lib/music-moods";
import {
  iniciarPonte,
  terminarPonte,
  pararPonte,
} from "@/lib/spotify-crossfade";

const TOKEN_KEY = "gmcp.spotify.token";
const VERIFIER_KEY = "gmcp.spotify.verifier";
const DEVICE_KEY = "gmcp.spotify.device";
const RESUME_LOGIN_KEY = "gmcp.spotify.resume_login";
const CROSSFADE_KEY = "gmcp.spotify.crossfade";
let resumeLoginDisparado = false;

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
  return tokenRequest({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
  });
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

export async function spotifyFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response | null> {
  const access = await accessTokenValido();
  if (!access) return null;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${access}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const url = path.startsWith("http") ? path : `https://api.spotify.com/v1${path}`;
  return fetch(url, { ...init, headers });
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

export async function definirVolume(percent: number) {
  await spotifyFetch(comDispositivo(`/me/player/volume?volume_percent=${Math.round(percent)}`), {
    method: "PUT",
  });
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

async function fadeVolume(
  de: number,
  para: number,
  signal: AbortSignal,
  duracaoMs: number,
  steps = 16,
) {
  const stepMs = Math.max(55, Math.round(duracaoMs / steps));
  let ultimo = Math.round(de);
  for (let i = 1; i <= steps; i++) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const v = Math.round(de + ((para - de) * i) / steps);
    if (v !== ultimo) {
      await definirVolume(Math.max(0, Math.min(100, v)));
      ultimo = v;
    }
    await sleep(stepMs, signal);
  }
  if (ultimo !== Math.round(para)) {
    await definirVolume(Math.max(0, Math.min(100, Math.round(para))));
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
 * Escolhe faixa aleatória da playlist.
 * Prefere faixas com preview_url (para a ponte de crossfade).
 */
export async function escolherFaixaAleatoria(
  playlistUri: string,
): Promise<FaixaEscolhida | null> {
  const id = playlistUri.replace(/^spotify:playlist:/, "");
  if (!id) return null;

  const meta = await spotifyFetch(`/playlists/${id}?fields=tracks.total`);
  let total = 0;
  if (meta?.ok) {
    const m = (await meta.json()) as { tracks?: { total?: number } };
    total = m.tracks?.total ?? 0;
  }

  const limit = 50;
  const maxOffset =
    total > limit ? Math.floor(Math.random() * Math.max(1, total - limit + 1)) : 0;

  const res = await spotifyFetch(
    `/playlists/${id}/tracks?fields=items(track(uri,preview_url,name))&limit=${limit}&offset=${maxOffset}`,
  );
  if (!res?.ok) return null;

  const data = (await res.json()) as {
    items?: { track?: { uri?: string; preview_url?: string | null; name?: string } | null }[];
  };

  const faixas: FaixaEscolhida[] = [];
  for (const item of data.items ?? []) {
    const t = item.track;
    if (!t?.uri?.startsWith("spotify:track:")) continue;
    faixas.push({
      uri: t.uri,
      preview_url: t.preview_url ?? null,
      nome: t.name ?? "—",
    });
  }
  if (!faixas.length) return null;

  const comPreview = faixas.filter((f) => f.preview_url);
  const pool = comPreview.length ? comPreview : faixas;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

/** Próxima faixa na fila do player (para skip com ponte). */
async function obterProximaDaFila(): Promise<FaixaEscolhida | null> {
  const res = await spotifyFetch("/me/player/queue");
  if (!res?.ok) return null;
  const data = (await res.json()) as {
    queue?: { uri?: string; preview_url?: string | null; name?: string }[];
  };
  const next = data.queue?.[0];
  if (!next?.uri?.startsWith("spotify:track:")) return null;
  return {
    uri: next.uri,
    preview_url: next.preview_url ?? null,
    nome: next.name ?? "—",
  };
}

/**
 * Dip + ponte de preview opcional → acção → sobe volume.
 * Sem preview / crossfade OFF → só dip (comportamento anterior).
 */
async function comCrossfade(
  acao: () => Promise<void>,
  previewUrl: string | null,
): Promise<boolean> {
  const { signal, aindaActiva } = iniciarTransicao();
  const usarPonte = getCrossfadeEnabled() && Boolean(previewUrl);

  try {
    const baseVol = await volumeAtual();
    const volMix = Math.max(32, Math.round(baseVol * 0.48));

    const fadeOutSpotify = fadeVolume(baseVol, volMix, signal, 1000, 16);
    const ponteIn = usarPonte
      ? iniciarPonte(previewUrl!, signal, 900)
      : Promise.resolve(false);

    const [, ponteOk] = await Promise.all([fadeOutSpotify, ponteIn]);
    if (!aindaActiva()) {
      pararPonte();
      return false;
    }

    await acao();
    if (!aindaActiva()) {
      pararPonte();
      return false;
    }

    await definirVolume(volMix);
    await sleep(120, signal);

    if (ponteOk && aindaActiva()) {
      await Promise.all([
        terminarPonte(signal, 700),
        fadeVolume(volMix, baseVol, signal, 1100, 16),
      ]);
    } else if (aindaActiva()) {
      pararPonte();
      await fadeVolume(volMix, baseVol, signal, 1100, 16);
    }

    return aindaActiva();
  } catch (e) {
    pararPonte();
    if (e instanceof DOMException && e.name === "AbortError") return false;
    console.error(e);
    return false;
  }
}

/** Segue para a próxima faixa com transição suave (+ ponte se houver preview na fila). */
export async function seguinte() {
  const proxima = getCrossfadeEnabled() ? await obterProximaDaFila() : null;
  await comCrossfade(
    async () => {
      await spotifyFetch(comDispositivo("/me/player/next"), { method: "POST" });
    },
    proxima?.preview_url ?? null,
  );
}

export type TocarPlaylistResult = "ok" | "premium" | "nodevice" | "fail" | "cancelled";

/**
 * Troca de playlist com crossfade (ponte preview) ou dip:
 * escolhe faixa aleatória → fade ↓ + preview ↑ → play → preview ↓ + fade ↑.
 */
export async function tocarPlaylist(
  uri: string,
  fade = true,
): Promise<TocarPlaylistResult> {
  const contextUri = normalizarPlaylistUri(uri);
  if (!contextUri.startsWith("spotify:playlist:")) return "fail";

  const faixa = await escolherFaixaAleatoria(contextUri);
  const offset = faixa
    ? { uri: faixa.uri }
    : { position: Math.floor(Math.random() * 20) };

  const body = JSON.stringify({
    context_uri: contextUri,
    offset,
  });

  if (!fade) {
    const res = await spotifyFetch(comDispositivo("/me/player/play"), {
      method: "PUT",
      body,
    });
    void spotifyFetch(comDispositivo("/me/player/shuffle?state=true"), {
      method: "PUT",
    });
    if (res?.status === 403) return "premium";
    if (res?.status === 404) return "nodevice";
    return res?.ok || res?.status === 204 ? "ok" : "fail";
  }

  let resultado: TocarPlaylistResult = "ok";
  let falhou: TocarPlaylistResult | null = null;

  const ok = await comCrossfade(
    async () => {
      void spotifyFetch(comDispositivo("/me/player/shuffle?state=true"), {
        method: "PUT",
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

      void spotifyFetch(comDispositivo("/me/player/shuffle?state=true"), {
        method: "PUT",
      });
    },
    faixa?.preview_url ?? null,
  );

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
