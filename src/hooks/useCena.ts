import { useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { tocarPlaylist } from "@/lib/spotify";
import { useSessionStore } from "@/store/session";
import type { SceneKey } from "@/lib/scenes";

/** Muda de cena: atualiza o estado, troca a playlist e regista o evento. */
export function useMudarCena() {
  const { scenes, spotifyStatus, sessionId, setCena, setSfxSugeridos, cenaAtual } =
    useSessionStore();

  return useCallback(
    async (
      key: SceneKey,
      origem: "auto" | "manual",
      confianca: number | null = null,
      sfx: string[] = [],
    ) => {
      if (key === cenaAtual && origem === "auto") return;
      setCena(key, origem, confianca);
      setSfxSugeridos(sfx);

      void supabase
        .from("scene_events")
        .insert({ session_id: sessionId, cena: key, origem, confianca });

      const alvo = scenes.find((s) => s.key === key);
      if (spotifyStatus === "ligado" && alvo?.spotify_playlist_uri) {
        const ok = await tocarPlaylist(alvo.spotify_playlist_uri);
        if (!ok) toast.error("Não consegui trocar a playlist (verifica o dispositivo ativo)");
      }
    },
    [cenaAtual, scenes, sessionId, setCena, setSfxSugeridos, spotifyStatus],
  );
}
