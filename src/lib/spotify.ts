import { SPOTIFY_CLIENT_ID, SPOTIFY_SCOPES } from "@/config/spotify";

const TOKEN_KEY = "gmcp.spotify.token";
const VERIFIER_KEY = "gmcp.spotify.verifier";
const DEVICE_KEY = "gmcp.spotify.device";
const RESUME_LOGIN_KEY = "gmcp.spotify.resume_login";
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

  // Garante que o browser está em 127.0.0.1 (não localhost) antes do OAuth,
  // para o redirect de volta bater na mesma origem do token exchange.
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

/** Executa um comando de player; se não houver dispositivo ativo (404), escolhe um e repete. */
async function comando(path: string, init: RequestInit = {}): Promise<Response | null> {
  let res = await spotifyFetch(comDispositivo(path), init);
  if (res && res.status === 404) {
    const dispositivos = await listarDispositivos();
    const alvo = dispositivos.find((d) => d.is_active) ?? dispositivos[0];
    if (!alvo) {
      toast.error("Sem dispositivo Spotify ativo — abre o Spotify e toca algo primeiro");
      return res;
    }
    await transferirPara(alvo.id);
    res = await spotifyFetch(comDispositivo(path), init);
  }
  return res;
}

export async function play() {
  await comando("/me/player/play", { method: "PUT" });
}

export async function pause() {
  await comando("/me/player/pause", { method: "PUT" });
}

export async function seguinte() {
  await comando("/me/player/next", { method: "POST" });
}

export async function definirVolume(percent: number) {
  await comando(`/me/player/volume?volume_percent=${Math.round(percent)}`, {
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

/** Toca a playlist de uma cena com fade suave de volume. */
export async function tocarPlaylist(uri: string, fade = true) {
  if (!uri) return false;
  if (fade) {
    for (const v of [50, 25, 10]) await definirVolume(v);
  }
  const res = await spotifyFetch(comDispositivo("/me/player/play"), {
    method: "PUT",
    body: JSON.stringify({ context_uri: uri }),
  });
  if (fade) {
    for (const v of [30, 55, 80]) await definirVolume(v);
  }
  return Boolean(res?.ok);
}
