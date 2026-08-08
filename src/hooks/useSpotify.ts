import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import { useSessionStore } from "@/store/session";
import {
  getToken,
  iniciarLoginSpotify,
  listarDispositivos,
  logoutSpotify,
  maybeResumeSpotifyLogin,
  obterAtual,
} from "@/lib/spotify";

/** Liga o estado do Spotify ao store e faz polling do que está a tocar. */
export function useSpotify(intervaloMs = 5000) {
  const setSpotifyStatus = useSessionStore((s) => s.setSpotifyStatus);
  const setTrack = useSessionStore((s) => s.setTrack);
  const setDevices = useSessionStore((s) => s.setDevices);

  const refrescar = useCallback(async () => {
    if (!getToken()) {
      setSpotifyStatus("desligado");
      setTrack(null);
      return;
    }
    setSpotifyStatus("ligado");
    const atual = await obterAtual();
    setTrack(atual);
  }, [setSpotifyStatus, setTrack]);

  useEffect(() => {
    void refrescar();
    const id = window.setInterval(() => void refrescar(), intervaloMs);
    return () => window.clearInterval(id);
  }, [refrescar, intervaloMs]);

  useEffect(() => {
    if (!getToken()) return;
    void listarDispositivos().then(setDevices);
  }, [setDevices]);

  // Continua o OAuth depois de saltar de localhost → 127.0.0.1
  useEffect(() => {
    try {
      maybeResumeSpotifyLogin();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha a ligar o Spotify");
    }
  }, []);

  const ligar = useCallback(() => {
    void iniciarLoginSpotify().catch((e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Falha a ligar o Spotify"),
    );
  }, []);

  const desligar = useCallback(() => {
    logoutSpotify();
    setSpotifyStatus("desligado");
    setTrack(null);
    toast.success("Spotify desligado");
  }, [setSpotifyStatus, setTrack]);

  const recarregarDispositivos = useCallback(async () => {
    setDevices(await listarDispositivos());
  }, [setDevices]);

  return { refrescar, ligar, desligar, recarregarDispositivos };
}
