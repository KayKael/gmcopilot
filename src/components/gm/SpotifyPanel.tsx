import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useSpotify } from "@/hooks/useSpotify";
import { definirVolume, transferirPara, getDeviceId } from "@/lib/spotify";
import { useSessionStore } from "@/store/session";

export function SpotifyPanel() {
  const spotifyStatus = useSessionStore((s) => s.spotifyStatus);
  const devices = useSessionStore((s) => s.devices);
  const { ligar, desligar, recarregarDispositivos } = useSpotify();
  const [volume, setVolume] = useState(70);
  const ativo = getDeviceId();

  return (
    <section className="rounded-lg border border-border bg-panel p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Spotify</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {spotifyStatus === "ligado"
              ? "Conta ligada. Escolhe o dispositivo de reprodução."
              : "Liga a tua conta (Spotify Premium é necessário para controlar a reprodução)."}
          </p>
        </div>
        <div className="flex gap-2">
          {spotifyStatus === "ligado" && (
            <Button variant="outline" size="sm" onClick={() => void recarregarDispositivos()}>
              Atualizar dispositivos
            </Button>
          )}
          <Button
            size="sm"
            variant={spotifyStatus === "ligado" ? "destructive" : "default"}
            onClick={() => (spotifyStatus === "ligado" ? desligar() : ligar())}
          >
            {spotifyStatus === "ligado" ? "Desligar" : "Ligar Spotify"}
          </Button>
        </div>
      </div>

      {spotifyStatus === "ligado" && (
        <div className="mt-4 space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Dispositivos</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {devices.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhum dispositivo. Abre o Spotify num aparelho e atualiza.
                </p>
              )}
              {devices.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    void transferirPara(d.id).then(() => toast.success(`A usar ${d.name}`));
                  }}
                  className={`rounded-md border px-2 py-1 text-xs transition-colors hover:bg-secondary ${
                    d.id === ativo || d.is_active ? "border-primary text-primary" : "border-border"
                  }`}
                >
                  {d.name} · {d.type}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Volume ({volume}%)</Label>
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolume(v);
                void definirVolume(v);
              }}
              className="mt-1.5 w-full accent-primary"
            />
          </div>
        </div>
      )}
    </section>
  );
}
