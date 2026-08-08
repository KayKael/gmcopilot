import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { TopBar } from "@/components/gm/TopBar";
import { ResizeCard } from "@/components/gm/DashCard";
import { VoiceFxCard } from "@/components/gm/VoiceFxCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useDefaultLayout,
} from "@/components/ui/resizable";
import { supabase } from "@/integrations/supabase/client";
import { SFX_META, sceneIcon, type SceneConfig } from "@/lib/scenes";
import { carregarMoods, moodByKey } from "@/lib/music-moods";
import { carregarPacks } from "@/lib/sfx-packs";
import { sceneByKey, useSessionStore } from "@/store/session";
import { useSpotify } from "@/hooks/useSpotify";
import { useSfx } from "@/hooks/useSfx";
import { useMudarCena, useTocarMood } from "@/hooks/useCena";
import { useClassificador } from "@/hooks/useClassificador";
import { useIsMobile } from "@/hooks/use-mobile";
import { perguntarDocs, type RespostaRag } from "@/lib/rag.functions";
import { pause, play, seguinte, definirVolume, obterVolumeSpotify, obterVolumePreferido, getCrossfadeEnabled } from "@/lib/spotify";
import { definirVolumeSfx, obterVolumeSfx } from "@/lib/sfx";
import {
  Music,
  SkipForward,
  Play,
  Pause,
  Wand2,
  Loader2,
  Repeat,
  Volume2,
  Square,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/audio")({
  // Painéis redimensionáveis + localStorage não hidratam bem no SSR
  ssr: false,
  head: () => ({
    meta: [
      { title: "Áudio — GM Co-Pilot" },
      {
        name: "description",
        content:
          "Painel de áudio: transcrição da sessão, deteção automática de cena, música do Spotify e efeitos sonoros a um clique.",
      },
      { property: "og:title", content: "Áudio — GM Co-Pilot" },
      {
        property: "og:description",
        content:
          "Transcrição ao vivo, troca automática de playlist por cena e efeitos sonoros para sessões de D&D.",
      },
    ],
  }),
  component: Dashboard,
});

/** Ignora layouts inválidos que colapsam o dashboard (0s, NaN, soma absurda). */
function layoutSeguro(
  layout: Record<string, number> | undefined,
): Record<string, number> | undefined {
  if (!layout) return undefined;
  const entries = Object.entries(layout);
  if (entries.length === 0) return undefined;
  const vals = entries.map(([, v]) => v);
  if (vals.some((v) => !Number.isFinite(v) || v < 0)) return undefined;
  const sum = vals.reduce((a, b) => a + b, 0);
  // Percentagens devem somar ~100; layouts quebrados geram min>max nos separators
  if (sum < 50 || sum > 150) return undefined;
  const usable = vals.filter((v) => v > 1).length;
  if (usable === 0) return undefined;
  return layout;
}

/** localStorage só no cliente — AudioLayoutShell monta após hydration. */
function usePersistedLayout(id: string) {
  return useDefaultLayout({
    id,
    storage: window.localStorage,
  });
}

function AudioLayoutShell({
  isMobile,
  panels,
}: {
  isMobile: boolean;
  panels: {
    cardTranscricao: ReactNode;
    cardCampanha: ReactNode;
    cardCena: ReactNode;
    cardSpotify: ReactNode;
    cardVoz: ReactNode;
    cardSfx: ReactNode;
  };
}) {
  const layoutMain = usePersistedLayout("gmcp-audio-main-v2");
  const layoutLeft = usePersistedLayout("gmcp-audio-left-v2");
  // v3: 4 painéis na coluna direita / mobile (cena, spotify, voz, sfx)
  const layoutRight = usePersistedLayout("gmcp-audio-right-v3");
  const layoutMobile = usePersistedLayout("gmcp-audio-mobile-v3");
  const { cardTranscricao, cardCampanha, cardCena, cardSpotify, cardVoz, cardSfx } = panels;

  if (isMobile) {
    return (
      <ResizablePanelGroup
        id="gmcp-audio-mobile-v3"
        orientation="vertical"
        className="h-full"
        defaultLayout={layoutSeguro(layoutMobile.defaultLayout)}
        onLayoutChanged={layoutMobile.onLayoutChanged}
      >
        {cardTranscricao}
        <ResizableHandle withHandle />
        {cardCampanha}
        <ResizableHandle withHandle />
        {cardCena}
        <ResizableHandle withHandle />
        {cardSpotify}
        <ResizableHandle withHandle />
        {cardVoz}
        <ResizableHandle withHandle />
        {cardSfx}
      </ResizablePanelGroup>
    );
  }

  return (
    <ResizablePanelGroup
      id="gmcp-audio-main-v2"
      orientation="horizontal"
      className="h-full"
      defaultLayout={layoutSeguro(layoutMain.defaultLayout)}
      onLayoutChanged={layoutMain.onLayoutChanged}
    >
      <ResizablePanel
        id="col-left"
        defaultSize="46%"
        minSize="28%"
        className="min-h-0 min-w-0"
        style={{ height: "100%", overflow: "hidden" }}
      >
        <ResizablePanelGroup
          id="gmcp-audio-left-v2"
          orientation="vertical"
          className="h-full"
          defaultLayout={layoutSeguro(layoutLeft.defaultLayout)}
          onLayoutChanged={layoutLeft.onLayoutChanged}
        >
          {cardTranscricao}
          <ResizableHandle withHandle />
          {cardCampanha}
        </ResizablePanelGroup>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel
        id="col-right"
        defaultSize="54%"
        minSize="32%"
        className="min-h-0 min-w-0"
        style={{ height: "100%", overflow: "hidden" }}
      >
        <ResizablePanelGroup
          id="gmcp-audio-right-v3"
          orientation="vertical"
          className="h-full"
          defaultLayout={layoutSeguro(layoutRight.defaultLayout)}
          onLayoutChanged={layoutRight.onLayoutChanged}
        >
          {cardCena}
          <ResizableHandle withHandle />
          {cardSpotify}
          <ResizableHandle withHandle />
          {cardVoz}
          <ResizableHandle withHandle />
          {cardSfx}
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function Dashboard() {
  const isMobile = useIsMobile();
  // Só monta painéis no cliente (ssr:false + gate) — evita hydration mismatch da lib
  const [layoutReady, setLayoutReady] = useState(false);
  useEffect(() => {
    setLayoutReady(true);
  }, []);

  const {
    scenes,
    setScenes,
    moods,
    setMoods,
    moodAtual,
    djAuto,
    setDjAuto,
    crossfade,
    setCrossfade,
    cenaAtual,
    confianca,
    origem,
    autoClassify,
    setAutoClassify,
    linhas,
    parcial,
    track,
    sfxSugeridos,
    setSfxPacks,
  } = useSessionStore();
  const spotifyStatus = useSessionStore((s) => s.spotifyStatus);
  const { refrescar } = useSpotify();
  const mudarCena = useMudarCena();
  const tocarMood = useTocarMood();
  const { classificarAgora, aClassificar } = useClassificador();
  const {
    disparar,
    pararTudo,
    aTocar,
    modoLoop,
    definirLoop,
    emLoop,
    efeitos,
    pack,
    packsActivos,
    escolherPack,
  } = useSfx();
  const fimRef = useRef<HTMLDivElement | null>(null);

  const [pergunta, setPergunta] = useState("");
  const [aPerguntar, setAPerguntar] = useState(false);
  const [resposta, setResposta] = useState<RespostaRag | null>(null);
  const [volSfx, setVolSfx] = useState(0.8);
  // Valor estável no SSR; carregar preferência no cliente (evita hydration mismatch)
  const [volMusica, setVolMusica] = useState(70);
  const perguntar = useServerFn(perguntarDocs);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const volMusicaTimer = useRef<number | null>(null);

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

  useEffect(() => {
    void (async () => {
      setMoods(await carregarMoods());
    })();
  }, [setMoods]);

  useEffect(() => {
    void (async () => {
      const packs = await carregarPacks({ soActivos: false });
      setSfxPacks(packs.filter((p) => p.ativo !== false));
    })();
  }, [setSfxPacks]);

  useEffect(() => {
    setVolSfx(obterVolumeSfx());
    setVolMusica(obterVolumePreferido(70));
    setCrossfade(getCrossfadeEnabled());
  }, [setCrossfade]);

  useEffect(() => {
    if (spotifyStatus !== "ligado") return;
    void obterVolumeSpotify().then((v) => setVolMusica(v));
  }, [spotifyStatus]);

  function onVolSfx(v: number) {
    setVolSfx(v);
    definirVolumeSfx(v);
  }

  function onVolMusica(v: number) {
    setVolMusica(v);
    if (volMusicaTimer.current) window.clearTimeout(volMusicaTimer.current);
    volMusicaTimer.current = window.setTimeout(() => {
      void definirVolume(v).catch(() => {
        toast.error("Não consegui alterar o volume do Spotify");
      });
    }, 180);
  }

  const cena = sceneByKey(scenes, cenaAtual);
  const mood = moodByKey(moods, moodAtual);
  const cor = cena?.cor ?? "#71717a";
  const packSet = new Set(efeitos);
  const sugeridos = (sfxSugeridos.length ? sfxSugeridos : (cena?.sfx_sugeridos ?? []))
    .filter((s) => packSet.has(s as (typeof efeitos)[number]))
    .slice(0, 3);

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

  const cardTranscricao = (
    <ResizeCard id="transcricao" titulo="Transcrição" defaultSize="40%" minSize="15%" bodyClassName="!p-2.5">
      {linhas.length === 0 && !parcial ? (
        <p className="text-xs text-muted-foreground">
          Inicia a sessão para começar a transcrever.
        </p>
      ) : (
        <div className="space-y-1 font-mono text-xs leading-relaxed">
          {linhas.map((l) => (
            <p key={l.id} className="flex gap-2">
              <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
                {new Date(l.ts).toLocaleTimeString("pt-PT", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
              <span className="text-foreground/90">{l.texto}</span>
            </p>
          ))}
          {parcial && <p className="italic text-muted-foreground">{parcial}</p>}
          <div ref={fimRef} />
        </div>
      )}
    </ResizeCard>
  );

  const cardCampanha = (
    <ResizeCard
      id="campanha"
      titulo="Campanha"
      defaultSize="60%"
      minSize="20%"
      bodyClassName="flex flex-col !overflow-hidden !p-0"
      extra={<span className="text-[10px] text-muted-foreground">/</span>}
    >
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto scrollbar-none px-3 py-2.5">
        {!resposta && !aPerguntar ? (
          <p className="text-xs text-muted-foreground">
            Pergunta sobre as tuas notas — o contexto da sessão fica à mão.
          </p>
        ) : null}
        {aPerguntar && !resposta ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            A consultar as notas…
          </div>
        ) : null}
        {resposta && (
          <div className="space-y-2">
            <div className="rounded-md border border-border/60 bg-secondary/30 px-3 py-2">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{resposta.resposta}</p>
            </div>
            {resposta.fontes.length > 0 && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none hover:text-foreground">
                  {resposta.fontes.length} excertos das tuas notas
                </summary>
                <ul className="mt-2 space-y-2">
                  {resposta.fontes.map((f, i) => (
                    <li
                      key={i}
                      className="rounded-md border border-border/70 bg-background/40 p-2"
                    >
                      <span className="font-medium text-foreground/80">{f.doc_name}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {(f.similarity * 100).toFixed(0)}%
                      </span>
                      <p className="mt-1 line-clamp-3 text-muted-foreground">{f.content}</p>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
      <div className="shrink-0 border-t border-border bg-panel/80 p-2.5">
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={pergunta}
            onChange={(e) => setPergunta(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void enviarPergunta(pergunta);
              if (e.key === "Escape") e.currentTarget.blur();
            }}
            placeholder="Perguntar à campanha…"
            className="h-9 flex-1 text-sm"
          />
          <Button size="sm" disabled={aPerguntar} onClick={() => void enviarPergunta(pergunta)}>
            {aPerguntar ? <Loader2 className="h-4 w-4 animate-spin" /> : "Perguntar"}
          </Button>
        </div>
      </div>
    </ResizeCard>
  );

  const cardCena = (
    <ResizeCard
      id="cena"
      titulo="Cena atual"
      defaultSize="20%"
      minSize="10%"
      style={{ borderColor: cor, boxShadow: `0 0 24px -14px ${cor}` }}
      extra={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="outline" disabled={aClassificar} onClick={classificarAgora}>
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
        <Icon className="h-9 w-9 shrink-0" style={{ color: cor }} />
        <div className="min-w-0 flex-1">
          <p className="text-xl font-semibold leading-tight" style={{ color: cor }}>
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
      <div className="mt-2.5 flex flex-wrap gap-1.5">
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
    </ResizeCard>
  );

  const cardSpotify = (
    <ResizeCard
      id="spotify"
      titulo="Spotify"
      defaultSize="24%"
      minSize="12%"
      extra={
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant={djAuto ? "default" : "outline"}
            onClick={() => setDjAuto(!djAuto)}
          >
            DJ: {djAuto ? "ON" : "OFF"}
          </Button>
          <Button
            size="sm"
            variant={crossfade ? "default" : "outline"}
            onClick={() => setCrossfade(!crossfade)}
            title="Ponte de preview no browser enquanto o Spotify troca"
          >
            Crossfade: {crossfade ? "ON" : "OFF"}
          </Button>
        </div>
      }
    >
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-secondary">
          {track?.capa ? (
            <img src={track.capa} alt="Capa do álbum" className="h-14 w-14 rounded" />
          ) : (
            <Music className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">{track?.nome ?? "Nada a reproduzir"}</p>
          <p className="truncate text-xs text-muted-foreground">{track?.artista ?? "—"}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            Mood: {mood?.nome ?? "—"}
            {djAuto ? " · auto (transcrição + cena)" : " · manual"}
          </p>
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="outline" aria-label="Play" onClick={() => void controlo("play")}>
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
      {moods.length > 0 && (
        <div className="mt-2.5">
          <select
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            value={moodAtual ?? ""}
            onChange={(e) => {
              const key = e.target.value;
              if (!key) return;
              void tocarMood(key, { pausarDj: true }).then((ok) => {
                if (ok) toast.success(`Mood: ${moodByKey(moods, key)?.nome ?? key}`);
              });
            }}
          >
            <option value="" disabled>
              Escolher mood…
            </option>
            {moods.map((m) => (
              <option key={m.key} value={m.key}>
                {m.nome}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="mt-2.5 flex items-center gap-2">
        <Volume2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          type="range"
          min={0}
          max={100}
          value={volMusica}
          disabled={spotifyStatus !== "ligado"}
          onChange={(e) => onVolMusica(Number(e.target.value))}
          className="h-1.5 w-full accent-primary disabled:opacity-40"
          aria-label="Volume da música"
        />
        <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
          {volMusica}
        </span>
      </div>
    </ResizeCard>
  );

  const cardVoz = (
    <ResizeCard
      id="voz"
      titulo="Voz"
      defaultSize="22%"
      minSize="12%"
      extra={
        <Button asChild size="sm" variant="outline" className="h-7 px-2 text-[11px]">
          <Link to="/voz">Studio</Link>
        </Button>
      }
    >
      <VoiceFxCard />
    </ResizeCard>
  );

  const cardSfx = (
    <ResizeCard
      id="sfx"
      titulo="Efeitos sonoros"
      defaultSize="34%"
      minSize="16%"
      extra={
        <div className="flex items-center gap-2">
          <select
            className="h-7 max-w-[140px] rounded-md border border-border bg-secondary/40 px-1.5 text-[11px]"
            value={pack.key}
            onChange={(e) => escolherPack(e.target.value)}
            aria-label="Pack de efeitos"
          >
            {packsActivos.map((p) => (
              <option key={p.key} value={p.key}>
                {p.nome}
              </option>
            ))}
          </select>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <Repeat className={`h-3.5 w-3.5 ${modoLoop ? "text-primary" : ""}`} />
            <span className={modoLoop ? "text-primary" : ""}>Loop</span>
            <Switch
              checked={modoLoop}
              onCheckedChange={definirLoop}
              aria-label="Repetir efeitos sonoros"
            />
          </label>
          <Button
            size="sm"
            variant="outline"
            onClick={pararTudo}
            title="Parar todos os efeitos"
            aria-label="Parar todos os efeitos"
            className="h-7 gap-1 px-2"
          >
            <Square className="h-3 w-3 fill-current" />
            Stop
          </Button>
        </div>
      }
    >
      <div className="mb-3 flex items-center gap-2">
        <Volume2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volSfx * 100)}
          onChange={(e) => onVolSfx(Number(e.target.value) / 100)}
          className="h-1.5 w-full accent-primary"
          aria-label="Volume dos efeitos"
        />
        <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
          {Math.round(volSfx * 100)}
        </span>
      </div>
      {modoLoop && (
        <p className="mb-2 text-[11px] text-muted-foreground">
          Clique num efeito para repetir · clique de novo para parar
        </p>
      )}
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
              const activo = aTocar === sfx || emLoop.includes(sfx);
              return (
                <button
                  key={sfx}
                  onClick={() => disparar(sfx)}
                  className="flex h-14 flex-col items-center justify-center gap-1 rounded-md border text-xs transition-transform active:scale-95"
                  style={{
                    borderColor: cor,
                    backgroundColor: activo ? `${cor}22` : undefined,
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
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 [grid-auto-rows:minmax(3.25rem,1fr)]">
        {efeitos.map((sfx, i) => {
          const meta = SFX_META[sfx];
          if (!meta) return null;
          const I = meta.icon;
          const tecla = ["Q", "W", "E", "R", "T", "Y"][i];
          const activo = aTocar === sfx || emLoop.includes(sfx);
          return (
            <button
              key={sfx}
              onClick={() => disparar(sfx)}
              className={`relative flex min-h-[3.25rem] flex-col items-center justify-center gap-1 rounded-md border bg-secondary/40 px-1 py-2 text-[11px] leading-tight transition-colors hover:bg-secondary active:scale-95 sm:min-h-[4rem] sm:gap-1.5 sm:text-xs ${
                activo ? "border-primary bg-secondary" : "border-border"
              }`}
            >
              {tecla && (
                <kbd className="absolute left-1 top-1 rounded border border-border px-1 text-[10px] text-muted-foreground">
                  {tecla}
                </kbd>
              )}
              {emLoop.includes(sfx) && (
                <Repeat className="absolute right-1 top-1 h-3 w-3 text-primary" />
              )}
              <I className="h-4 w-4 text-muted-foreground sm:h-5 sm:w-5" />
              {meta.nome}
            </button>
          );
        })}
      </div>
    </ResizeCard>
  );

  return (
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-background text-foreground">
      <TopBar />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="absolute inset-0 p-3 pt-2">
          {!layoutReady ? (
            <div className="h-full rounded-lg border border-border/60 bg-panel/30" aria-hidden />
          ) : (
            <AudioLayoutShell
              isMobile={isMobile}
              panels={{
                cardTranscricao,
                cardCampanha,
                cardCena,
                cardSpotify,
                cardVoz,
                cardSfx,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
