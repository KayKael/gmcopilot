// Spotify Client ID — NÃO é secreto.
//
// Redirect URI no Spotify Developer Dashboard (Settings → Redirect URIs):
//   http://127.0.0.1:8080/callback
// (Spotify já NÃO aceita "localhost" — usa sempre 127.0.0.1.)
// Em produção, adiciona também a URL HTTPS: https://<teu-dominio>/callback
export const SPOTIFY_CLIENT_ID = "23fcb25eaeaa48aea5885f834b939c8c";

export const SPOTIFY_SCOPES =
  "user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private playlist-read-collaborative";

