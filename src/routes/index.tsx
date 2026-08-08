import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { TopBar } from "@/components/gm/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { SFX_KEYS, SFX_META, sceneIcon, type SceneConfig } from "@/lib/scenes";
import { sceneByKey, useSessionStore } from "@/store/session";
import { useSpotify } from "@/hooks/useSpotify";
import { pause, play, seguinte, tocarPlaylist } from "@/lib/spotify";
import { Music, SkipForward, Play, Pause, Wand2 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GM Co-Pilot — Assistente de Mestre de RPG" },
      {
        name: "description",
        content:
          "Painel de mestre em tempo real: transcrição da sessão, deteção automática de cena, música do Spotify e efeitos sonoros a um clique.",
      },
      { property: "og:title", content: "GM Co-Pilot — Assistente de Mestre de RPG" },
      {
        property: "og:description",
        content:
          "Transcrição ao vivo, troca automática de playlist por cena e efeitos sonoros para sessões de D&D.",
      },
    ],
  }),
  component: Dashboard,
});

function Panel({
  titulo,
  extra,
  children,
  className,
  style,
}: {
  titulo: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <section
      className={`flex min-h-0 flex-col rounded-lg border border-border bg-panel ${className ?? ""}`}
      style={style}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {titulo}
        </h2>
        {extra}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
    </section>
  );
}

function Dashboard() {
  const {
    scenes,
    setScenes,
    cenaAtual,
    setCena,
    confianca,
    autoClassify,
    setAutoClassify,
    linhas,
    parcial,
    track,
    sfxSugeridos,
    setSfxSugeridos,
  } = useSessionStore();

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.from("scene_configs").select("*").order("ordem");
      if (error) {
        toast.error("Não consegui carregar as cenas");
        return;
      }
      setScenes((data ?? []) as unknown as SceneConfig[]);
    })();
  }, [setScenes]);

  const cena = sceneByKey(scenes, cenaAtual);
  const cor = cena?.cor ?? "#71717a";
  const sugeridos = (sfxSugeridos.length ? sfxSugeridos : (cena?.sfx_sugeridos ?? [])).slice(0, 3);

  function mudarCena(key: SceneConfig["key"]) {
    setCena(key, "manual", null);
    setSfxSugeridos([]);
  }

  const Icon = sceneIcon(cena?.icone ?? "");

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TopBar />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-2 lg:grid-rows-[1fr_auto]">
        <Panel titulo="Transcrição" className="lg:row-span-1">
          {linhas.length === 0 && !parcial ? (
            <p className="text-sm text-muted-foreground">
              Inicia a sessão para começar a transcrever.
            </p>
          ) : (
            <div className="space-y-1 font-mono text-sm">
              {linhas.map((l) => (
                <p key={l.id} className="flex gap-3">
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(l.ts).toLocaleTimeString("pt-PT")}
                  </span>
                  <span>{l.texto}</span>
                </p>
              ))}
              {parcial && <p className="italic text-muted-foreground">{parcial}</p>}
            </div>
          )}
        </Panel>

        <div className="flex min-h-0 flex-col gap-3">
          <Panel
            titulo="Cena atual"
            style={{ borderColor: cor, boxShadow: `0 0 24px -14px ${cor}` }}
            extra={
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled>
                  Classificar agora
                </Button>
                <Button
                  size="sm"
                  variant={autoClassify ? "default" : "outline"}
                  onClick={() => setAutoClassify(!autoClassify)}
                >
                  Auto: {autoClassify ? "ON" : "OFF"}
                </Button>
              </div>
            }
          >
            <div className="flex items-center gap-3">
              <Icon className="h-10 w-10" style={{ color: cor }} />
              <div>
                <p className="text-2xl font-semibold" style={{ color: cor }}>
                  {cena?.nome ?? "Sem cena"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {confianca != null ? `Confiança ${(confianca * 100).toFixed(0)}%` : "Manual"}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {scenes.map((s) => (
                <button
                  key={s.id}
                  onClick={() => mudarCena(s.key)}
                  className="rounded-md border px-2 py-1 text-xs transition-colors hover:bg-secondary"
                  style={s.key === cenaAtual ? { borderColor: s.cor, color: s.cor } : undefined}
                >
                  {s.ordem}. {s.nome}
                </button>
              ))}
            </div>
          </Panel>

          <Panel titulo="Spotify">
            <div className="flex items-center gap-3">
              <div className="flex h-16 w-16 items-center justify-center rounded bg-secondary">
                {track?.capa ? (
                  <img src={track.capa} alt="Capa do álbum" className="h-16 w-16 rounded" />
                ) : (
                  <Music className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{track?.nome ?? "Nada a reproduzir"}</p>
                <p className="truncate text-xs text-muted-foreground">{track?.artista ?? "—"}</p>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="outline" disabled aria-label="Play">
                  <Play className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="outline" disabled aria-label="Pause">
                  <Pause className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="outline" disabled aria-label="Seguinte">
                  <SkipForward className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Panel>

          <Panel titulo="Efeitos sonoros">
            {sugeridos.length > 0 && (
              <div className="mb-3">
                <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                  Sugeridos para esta cena
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {sugeridos.map((sfx) => {
                    const meta = SFX_META[sfx as keyof typeof SFX_META];
                    if (!meta) return null;
                    const I = meta.icon;
                    return (
                      <button
                        key={sfx}
                        className="flex h-14 flex-col items-center justify-center gap-1 rounded-md border text-xs"
                        style={{ borderColor: cor }}
                      >
                        <I className="h-4 w-4" style={{ color: cor }} />
                        {meta.nome}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="grid grid-cols-5 gap-2">
              {SFX_KEYS.map((sfx) => {
                const I = SFX_META[sfx].icon;
                return (
                  <button
                    key={sfx}
                    className="flex h-24 flex-col items-center justify-center gap-1.5 rounded-md border border-border bg-secondary/40 text-xs transition-colors hover:bg-secondary"
                  >
                    <I className="h-5 w-5 text-muted-foreground" />
                    {SFX_META[sfx].nome}
                  </button>
                );
              })}
            </div>
          </Panel>
        </div>

        <div className="lg:col-span-2">
          <section className="rounded-lg border border-border bg-panel p-3">
            <div className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-muted-foreground" />
              <Input placeholder="Perguntar à campanha…" disabled className="flex-1" />
              <Button disabled>Perguntar</Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
