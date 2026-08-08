import { useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { tocarPlaylist } from "@/lib/spotify";
import { CENA_PARA_MOOD, moodByKey, normalizarPlaylistUri } from "@/lib/music-moods";
import { useSessionStore } from "@/store/session";
import type { SceneKey } from "@/lib/scenes";

const PAUSA_DJ_MANUAL_MS = 120_000;

/** Toca um mood: no-op se o URI for o mesmo; actualiza store. */
export function useTocarMood() {
  return useCallback(async (moodKey: string, opts?: { pausarDj?: boolean }) => {
    const state = useSessionStore.getState();
    const mood = moodByKey(state.moods, moodKey);
    if (!mood?.spotify_playlist_uri) {
      toast.error("Mood sem playlist configurada");
      return false;
    }
    const uri = normalizarPlaylistUri(mood.spotify_playlist_uri);
    if (!uri) {
      toast.error("URI de playlist inválido");
      return false;
    }

    if (opts?.pausarDj) state.pausarDj(PAUSA_DJ_MANUAL_MS);

    // Mesmo URI → só actualiza label
    if (uri === state.playlistUriAtual) {
      state.setMood(moodKey, uri);
      return true;
    }

    if (state.spotifyStatus !== "ligado") {
      state.setMood(moodKey, uri);
      toast.error("Liga o Spotify para ouvir a playlist");
      return false;
    }

    const resultado = await tocarPlaylist(uri);
    if (resultado === "ok" || resultado === "cancelled") {
      if (resultado === "ok") useSessionStore.getState().setMood(moodKey, uri);
      return resultado === "ok";
    }
    if (resultado === "premium") {
      toast.error("Spotify Premium é necessário para controlar a reprodução");
    } else if (resultado === "nodevice") {
      toast.error("Nenhum dispositivo Spotify activo — abre a app e atualiza");
    } else {
      toast.error("Não consegui trocar a playlist");
    }
    return false;
  }, []);
}

/** Muda de cena: UI/SFX; música só se DJ Auto estiver OFF (fallback cena→mood). */
export function useMudarCena() {
  const tocarMood = useTocarMood();

  return useCallback(
    async (
      key: SceneKey,
      origem: "auto" | "manual",
      confianca: number | null = null,
      sfx: string[] = [],
    ) => {
      const { cenaAtual, sessionId, setCena, setSfxSugeridos, djAuto } =
        useSessionStore.getState();

      if (key === cenaAtual && origem === "auto") return;
      setCena(key, origem, confianca);
      setSfxSugeridos(sfx);

      void supabase
        .from("scene_events")
        .insert({ session_id: sessionId, cena: key, origem, confianca });

      // DJ Auto ON: música fica a cargo do classificador de mood
      if (djAuto) return;

      const moodKey = CENA_PARA_MOOD[key];
      if (moodKey) await tocarMood(moodKey);
    },
    [tocarMood],
  );
}
