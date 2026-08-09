import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { TopBar } from "@/components/gm/TopBar";
import { Button } from "@/components/ui/button";
import {
  apagarAsset,
  isImageFile,
  isOverlayFile,
  listarAssets,
  uploadAssets,
  type VisualAsset,
} from "@/lib/visual-assets";
import {
  abrirJanelaApresentacao,
  carregarPresentation,
  definirFadeMs,
  limparEcran,
  limparOverlay,
  apresentarAsset,
  mostrarOverlay,
  preloadImage,
  preloadImages,
  readLocalPresentation,
  subscribePresentation,
  type PresentationState,
} from "@/lib/visual-presentation";
import {
  ExternalLink,
  ImageOff,
  Layers,
  Loader2,
  MonitorPlay,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";

export const Route = createFileRoute("/visual")({
  head: () => ({
    meta: [
      { title: "Visual — GM Co-Pilot" },
      {
        name: "description",
        content: "Biblioteca de imagens e overlays para a apresentação da sessão.",
      },
      { property: "og:title", content: "Visual — GM Co-Pilot" },
      {
        property: "og:description",
        content: "Fundos, fades e overlays transparentes (PNG/GIF).",
      },
    ],
  }),
  component: VisualPage,
});

function VisualPage() {
  const [fundos, setFundos] = useState<VisualAsset[]>([]);
  const [overlays, setOverlays] = useState<VisualAsset[]>([]);
  const [presentation, setPresentation] = useState<PresentationState | null>(null);
  const [aCarregar, setACarregar] = useState(false);
  const [aEnviar, setAEnviar] = useState<string | null>(null);
  const [dragOverFundo, setDragOverFundo] = useState(false);
  const [dragOverFx, setDragOverFx] = useState(false);
  const [selectedFundoId, setSelectedFundoId] = useState<string | null>(null);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const fundoInputRef = useRef<HTMLInputElement | null>(null);
  const fxInputRef = useRef<HTMLInputElement | null>(null);
  const fadeTimer = useRef<number | null>(null);

  const recarregar = useCallback(async () => {
    setACarregar(true);
    try {
      const [listaFundo, listaFx, estado] = await Promise.all([
        listarAssets("fundo"),
        listarAssets("overlay"),
        carregarPresentation(),
      ]);
      setFundos(listaFundo);
      setOverlays(listaFx);
      setPresentation(estado);
      preloadImages([
        ...listaFundo.map((a) => a.public_url),
        ...listaFx.map((a) => a.public_url),
      ]);
    } catch (e) {
      console.error(e);
      toast.error("Não consegui carregar a biblioteca visual");
    } finally {
      setACarregar(false);
    }
  }, []);

  useEffect(() => {
    const local = readLocalPresentation();
    if (local) setPresentation(local);
    void recarregar();
  }, [recarregar]);

  useEffect(() => {
    return subscribePresentation(setPresentation);
  }, []);

  async function processarFundos(ficheiros: FileList | File[] | null) {
    if (!ficheiros || !Array.from(ficheiros as FileList).length) return;
    const list = Array.from(ficheiros as FileList);
    const validos = list.filter(isImageFile);
    for (const f of list) {
      if (!isImageFile(f)) toast.error(`${f.name}: só aceito imagens`);
    }
    if (!validos.length) return;

    for (const f of validos) {
      setAEnviar(f.name);
      try {
        const uploaded = await uploadAssets([f], "fundo");
        setFundos((prev) => [...prev, ...uploaded]);
        preloadImages(uploaded.map((a) => a.public_url));
        toast.success(`${f.name} carregado`);
      } catch (e) {
        console.error(e);
        toast.error(`Falhei a carregar ${f.name}`);
      }
    }
    setAEnviar(null);
  }

  async function processarOverlays(ficheiros: FileList | File[] | null) {
    if (!ficheiros || !Array.from(ficheiros as FileList).length) return;
    const list = Array.from(ficheiros as FileList);
    const validos = list.filter(isOverlayFile);
    for (const f of list) {
      if (!isOverlayFile(f)) toast.error(`${f.name}: overlays só png/gif/webp`);
    }
    if (!validos.length) return;

    for (const f of validos) {
      setAEnviar(f.name);
      try {
        const uploaded = await uploadAssets([f], "overlay");
        setOverlays((prev) => [...prev, ...uploaded]);
        preloadImages(uploaded.map((a) => a.public_url));
        toast.success(`${f.name} carregado`);
      } catch (e) {
        console.error(e);
        toast.error(`Falhei a carregar ${f.name}`);
      }
    }
    setAEnviar(null);
  }

  function onApresentar(asset: VisualAsset) {
    try {
      setPresentation(apresentarAsset(asset, presentation?.fade_ms ?? 200));
    } catch (e) {
      console.error(e);
      toast.error("Não consegui apresentar a imagem");
    }
  }

  function onMostrarOverlay(asset: VisualAsset) {
    try {
      setPresentation(mostrarOverlay(asset));
    } catch (e) {
      console.error(e);
      toast.error("Não consegui mostrar o overlay");
    }
  }

  function onLimpar() {
    try {
      setPresentation(limparEcran(presentation?.fade_ms ?? 200));
    } catch (e) {
      console.error(e);
      toast.error("Não consegui limpar o ecrã");
    }
  }

  function onLimparOverlay() {
    try {
      setPresentation(limparOverlay());
    } catch (e) {
      console.error(e);
      toast.error("Não consegui limpar o overlay");
    }
  }

  function onFade(v: number) {
    setPresentation((p) =>
      p
        ? { ...p, fade_ms: v }
        : {
            active_asset_id: null,
            public_url: null,
            nome: null,
            overlay_asset_id: null,
            overlay_url: null,
            overlay_nome: null,
            fade_ms: v,
            updated_at: new Date().toISOString(),
            epoch: 0,
          },
    );
    if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
    fadeTimer.current = window.setTimeout(() => {
      try {
        setPresentation(definirFadeMs(v));
      } catch (e) {
        console.error(e);
        toast.error("Não consegui guardar o fade");
      }
    }, 200);
  }

  async function onApagarFundo(asset: VisualAsset) {
    try {
      const eraAtivo = presentation?.active_asset_id === asset.id;
      await apagarAsset(asset);
      setFundos((prev) => prev.filter((a) => a.id !== asset.id));
      if (selectedFundoId === asset.id) setSelectedFundoId(null);
      if (eraAtivo) setPresentation(limparEcran(presentation?.fade_ms ?? 200));
      toast.success("Imagem apagada");
    } catch (e) {
      console.error(e);
      toast.error("Não consegui apagar a imagem");
    }
  }

  async function onApagarOverlay(asset: VisualAsset) {
    try {
      const eraAtivo = presentation?.overlay_asset_id === asset.id;
      await apagarAsset(asset);
      setOverlays((prev) => prev.filter((a) => a.id !== asset.id));
      if (selectedOverlayId === asset.id) setSelectedOverlayId(null);
      if (eraAtivo) setPresentation(limparOverlay());
      toast.success("Overlay apagado");
    } catch (e) {
      console.error(e);
      toast.error("Não consegui apagar o overlay");
    }
  }

  const selecionadaFundo = fundos.find((a) => a.id === selectedFundoId) ?? null;
  const selecionadoFx = overlays.find((a) => a.id === selectedOverlayId) ?? null;
  const fade = presentation?.fade_ms ?? 200;
  const bgUrl = presentation?.public_url ?? null;
  const fxUrl = presentation?.overlay_url ?? null;

  return (
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-background text-foreground">
      <TopBar />
      <main className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-8">
            {/* Fundos */}
            <section className="space-y-3">
              <div className="flex items-end justify-between gap-2">
                <div>
                  <h1 className="text-lg font-semibold">Fundos</h1>
                  <p className="text-sm text-muted-foreground">
                    Imagens de cenário para o ecrã de apresentação.
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => fundoInputRef.current?.click()}>
                  <Upload className="h-4 w-4" /> Carregar
                </Button>
                <input
                  ref={fundoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void processarFundos(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>

              <DropZone
                dragOver={dragOverFundo}
                setDragOver={setDragOverFundo}
                onFiles={(f) => void processarFundos(f)}
                hint="Arrasta fundos (jpg, png, webp, gif, avif)"
                aEnviar={aEnviar}
              />

              <AssetGrid
                assets={fundos}
                loading={aCarregar && fundos.length === 0}
                empty="Ainda não há fundos."
                selectedId={selectedFundoId}
                onScreenId={presentation?.active_asset_id ?? null}
                onSelect={setSelectedFundoId}
                onDelete={(a) => void onApagarFundo(a)}
                onScreenLabel="Em ecrã"
              />
            </section>

            {/* Overlays */}
            <section className="space-y-3">
              <div className="flex items-end justify-between gap-2">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <Sparkles className="h-5 w-5 text-primary" /> Overlays
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    PNG/GIF transparentes por cima do fundo (ex.: símbolo de ritual).
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => fxInputRef.current?.click()}>
                  <Upload className="h-4 w-4" /> Carregar
                </Button>
                <input
                  ref={fxInputRef}
                  type="file"
                  accept="image/png,image/gif,image/webp"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void processarOverlays(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>

              <DropZone
                dragOver={dragOverFx}
                setDragOver={setDragOverFx}
                onFiles={(f) => void processarOverlays(f)}
                hint="Arrasta overlays transparentes (png, gif, webp)"
                aEnviar={aEnviar}
              />

              <AssetGrid
                assets={overlays}
                loading={aCarregar && overlays.length === 0}
                empty="Ainda não há overlays."
                selectedId={selectedOverlayId}
                onScreenId={presentation?.overlay_asset_id ?? null}
                onSelect={setSelectedOverlayId}
                onDelete={(a) => void onApagarOverlay(a)}
                onScreenLabel="Ativo"
                checkerboard
              />
            </section>
          </div>

          <aside className="space-y-3">
            <section className="rounded-lg border border-border bg-panel p-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Em ecrã
              </h2>
              <div className="relative mt-2 aspect-video overflow-hidden rounded-md border border-border bg-black">
                {bgUrl || fxUrl ? (
                  <>
                    {bgUrl ? (
                      <img
                        src={bgUrl}
                        alt={presentation?.nome ?? "Fundo"}
                        className="absolute inset-0 h-full w-full object-contain"
                      />
                    ) : null}
                    {fxUrl ? (
                      <img
                        src={fxUrl}
                        alt={presentation?.overlay_nome ?? "Overlay"}
                        className="absolute inset-0 h-full w-full object-contain"
                      />
                    ) : null}
                  </>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                    <ImageOff className="h-6 w-6" />
                    <span className="text-xs">Ecrã limpo</span>
                  </div>
                )}
              </div>
              <p className="mt-2 truncate text-sm">
                {presentation?.nome ?? "Sem fundo"}
                {presentation?.overlay_nome ? ` + ${presentation.overlay_nome}` : ""}
              </p>
              {selecionadaFundo && (
                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                  Fundo sel.: {selecionadaFundo.nome}
                </p>
              )}
              {selecionadoFx && (
                <p className="truncate text-[11px] text-muted-foreground">
                  Overlay sel.: {selecionadoFx.nome}
                </p>
              )}

              <label className="mt-3 block text-xs text-muted-foreground">
                Fade fundo: {fade} ms{fade === 0 ? " (corte)" : ""}
                <input
                  type="range"
                  min={0}
                  max={1500}
                  step={50}
                  value={fade}
                  onChange={(e) => onFade(Number(e.target.value))}
                  className="mt-1 h-1.5 w-full accent-primary"
                />
              </label>

              <div className="mt-3 flex flex-col gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    if (!selecionadaFundo) {
                      toast.message("Seleciona um fundo");
                      return;
                    }
                    onApresentar(selecionadaFundo);
                  }}
                  disabled={!selecionadaFundo}
                >
                  <MonitorPlay className="h-4 w-4" /> Apresentar fundo
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (!selecionadoFx) {
                      toast.message("Seleciona um overlay");
                      return;
                    }
                    onMostrarOverlay(selecionadoFx);
                  }}
                  disabled={!selecionadoFx}
                >
                  <Layers className="h-4 w-4" /> Mostrar overlay
                </Button>
                <Button size="sm" variant="outline" onClick={abrirJanelaApresentacao}>
                  <ExternalLink className="h-4 w-4" /> Abrir apresentação
                </Button>
                <Button size="sm" variant="ghost" onClick={onLimparOverlay}>
                  Limpar overlay
                </Button>
                <Button size="sm" variant="ghost" onClick={onLimpar}>
                  <ImageOff className="h-4 w-4" /> Limpar fundo
                </Button>
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}

function DropZone({
  dragOver,
  setDragOver,
  onFiles,
  hint,
  aEnviar,
}: {
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  onFiles: (f: FileList) => void;
  hint: string;
  aEnviar: string | null;
}) {
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onFiles(e.dataTransfer.files);
      }}
      className={`rounded-lg border border-dashed p-6 text-center transition-colors ${
        dragOver ? "border-primary bg-primary/5" : "border-border bg-panel"
      }`}
    >
      <Upload className="mx-auto h-5 w-5 text-muted-foreground" />
      <p className="mt-2 text-sm text-muted-foreground">{hint}</p>
      {aEnviar && (
        <p className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> A enviar {aEnviar}…
        </p>
      )}
    </div>
  );
}

function AssetGrid({
  assets,
  loading,
  empty,
  selectedId,
  onScreenId,
  onSelect,
  onDelete,
  onScreenLabel,
  checkerboard = false,
}: {
  assets: VisualAsset[];
  loading: boolean;
  empty: string;
  selectedId: string | null;
  onScreenId: string | null;
  onSelect: (id: string) => void;
  onDelete: (a: VisualAsset) => void;
  onScreenLabel: string;
  checkerboard?: boolean;
}) {
  if (loading) return <p className="text-sm text-muted-foreground">A carregar…</p>;
  if (assets.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {assets.map((asset) => {
        const selected = asset.id === selectedId;
        const onScreen = asset.id === onScreenId;
        return (
          <div
            key={asset.id}
            className={`group relative overflow-hidden rounded-lg border bg-panel ${
              selected
                ? "border-primary ring-1 ring-primary/40"
                : onScreen
                  ? "border-ok/60"
                  : "border-border"
            }`}
            onMouseEnter={() => void preloadImage(asset.public_url)}
            onFocus={() => void preloadImage(asset.public_url)}
          >
            <button
              type="button"
              className="block w-full text-left"
              onClick={() => onSelect(asset.id)}
              title="Selecionar"
            >
              <div
                className={`aspect-video ${
                  checkerboard
                    ? "bg-[length:12px_12px] bg-[linear-gradient(45deg,#333_25%,transparent_25%,transparent_75%,#333_75%),linear-gradient(45deg,#333_25%,transparent_25%,transparent_75%,#333_75%)] bg-[position:0_0,6px_6px] bg-neutral-700"
                    : "bg-secondary/40"
                }`}
              >
                <img
                  src={asset.public_url}
                  alt={asset.nome}
                  className="h-full w-full object-contain"
                  loading="eager"
                  decoding="async"
                />
              </div>
              <p className="truncate px-2 py-1.5 text-xs">{asset.nome}</p>
            </button>
            {onScreen && (
              <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                {onScreenLabel}
              </span>
            )}
            <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <Button
                size="icon"
                variant="secondary"
                className="h-7 w-7"
                title="Apagar"
                onClick={() => onDelete(asset)}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
