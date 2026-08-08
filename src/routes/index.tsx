import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { TopBar } from "@/components/gm/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { SFX_KEYS, SFX_META, sceneIcon, type SceneConfig } from "@/lib/scenes";
import { sceneByKey, useSessionStore } from "@/store/session";
import { useSpotify } from "@/hooks/useSpotify";
import { useSfx } from "@/hooks/useSfx";
import { useMudarCena } from "@/hooks/useCena";
import { useClassificador } from "@/hooks/useClassificador";
import { perguntarDocs, type RespostaRag } from "@/lib/rag.functions";
import { pause, play, seguinte } from "@/lib/spotify";
import { Music, SkipForward, Play, Pause, Wand2, Loader2 } from "lucide-react";

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
    confianca,
    origem,
    autoClassify,
    setAutoClassify,
    linhas,
    parcial,
    track,
    sfxSugeridos,
  } = useSessionStore();
  const spotifyStatus = useSessionStore((s) => s.spotifyStatus);
  const { refrescar } = useSpotify();
  const mudarCena = useMudarCena();
  const { classificarAgora, aClassificar } = useClassificador();
  const { disparar, aTocar } = useSfx();
  const fimRef = useRef<HTMLDivElement | null>(null);

  const [pergunta, setPergunta] = useState("");
  const [aPerguntar, setAPerguntar] = useState(false);
  const [resposta, setResposta] = useState<RespostaRag | null>(null);
  const perguntar = useServerFn(perguntarDocs);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [linhas.length, parcial]);

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

  async function controlo(acao: "play" | "pause" | "next") {
    if (spotifyStatus !== "ligado") {
      toast.error("Liga o Spotify primeiro");
      return;
    }
    if (acao === "play") await play();
    else if (acao === "pause") await pause();
    else await seguinte();
    setTimeout(() => void refrescar(), 400);
  }

  async function enviarPergunta(texto: string) {
    if (!texto.trim() || aPerguntar) return;
    setAPerguntar(true);
    setResposta(null);
    try {
      setResposta(await perguntar({ data: { pergunta: texto.trim() } }));
    } catch (e) {
      console.error(e);
      toast.error("Não consegui consultar as notas");
    } finally {
      setAPerguntar(false);
    }
  }

  // Atalhos: 1–6 muda de cena, espaço play/pause, "/" foca a pergunta
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "/") {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        void controlo(track?.aTocar ? "pause" : "play");
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= 9) {
        const alvo = scenes.find((s) => s.ordem === n);
        if (alvo) void mudarCena(alvo.key, "manual");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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
              <div ref={fimRef} />
            </div>
          )}
        </Panel>

        <div className="flex min-h-0 flex-col gap-3">
          <Panel
            titulo="Cena atual"
            style={{ borderColor: cor, boxShadow: `0 0 24px -14px ${cor}` }}
            extra={
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={aClassificar}
                  onClick={classificarAgora}
                >
                  {aClassificar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
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
              <div className="min-w-0 flex-1">
                <p className="text-2xl font-semibold" style={{ color: cor }}>
                  {cena?.nome ?? "Sem cena"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {origem === "auto" ? "Automático" : origem === "manual" ? "Manual" : "—"}
                  {confianca != null ? ` · confiança ${(confianca * 100).toFixed(0)}%` : ""}
                </p>
                {confianca != null && (
                  <div className="mt-1 h-1 w-full overflow-hidden rounded bg-secondary">
                    <div
                      className="h-full rounded"
                      style={{ width: `${confianca * 100}%`, backgroundColor: cor }}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {scenes.map((s) => (
                <button
                  key={s.id}
                  onClick={() => void mudarCena(s.key, "manual")}
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
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Play"
                  onClick={() => void controlo("play")}
                >
                  <Play className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Pause"
                  onClick={() => void controlo("pause")}
                >
                  <Pause className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Seguinte"
                  onClick={() => void controlo("next")}
                >
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
                        onClick={() => disparar(sfx)}
                        className="flex h-14 flex-col items-center justify-center gap-1 rounded-md border text-xs transition-transform active:scale-95"
                        style={{
                          borderColor: cor,
                          backgroundColor: aTocar === sfx ? `${cor}22` : undefined,
                        }}
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
              {SFX_KEYS.map((sfx, i) => {
                const I = SFX_META[sfx].icon;
                const tecla = ["Q", "W", "E", "R", "T", "Y"][i];
                return (
                  <button
                    key={sfx}
                    onClick={() => disparar(sfx)}
                    className={`relative flex h-24 flex-col items-center justify-center gap-1.5 rounded-md border bg-secondary/40 text-xs transition-colors hover:bg-secondary active:scale-95 ${
                      aTocar === sfx ? "border-primary bg-secondary" : "border-border"
                    }`}
                  >
                    {tecla && (
                      <kbd className="absolute left-1 top-1 rounded border border-border px-1 text-[10px] text-muted-foreground">
                        {tecla}
                      </kbd>
                    )}
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
              <Input
                ref={inputRef}
                value={pergunta}
                onChange={(e) => setPergunta(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void enviarPergunta(pergunta);
                  if (e.key === "Escape") e.currentTarget.blur();
                }}
                placeholder="Perguntar à campanha…  (/)"
                className="flex-1"
              />
              <Button disabled={aPerguntar} onClick={() => void enviarPergunta(pergunta)}>
                {aPerguntar ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Perguntar
              </Button>
            </div>
            {resposta && (
              <div className="mt-3 space-y-2">
                <p className="whitespace-pre-wrap text-sm">{resposta.resposta}</p>
                {resposta.fontes.length > 0 && (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">
                      {resposta.fontes.length} excertos das tuas notas
                    </summary>
                    <ul className="mt-2 space-y-2">
                      {resposta.fontes.map((f, i) => (
                        <li key={i} className="rounded border border-border p-2">
                          <span className="font-semibold">{f.doc_name}</span> ·{" "}
                          {(f.similarity * 100).toFixed(0)}%
                          <p className="mt-1 line-clamp-4">{f.content}</p>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
