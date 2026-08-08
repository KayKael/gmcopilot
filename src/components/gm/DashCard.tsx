import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  ResizablePanel,
  usePanelRef,
} from "@/components/ui/resizable";

export function DashCard({
  id,
  titulo,
  extra,
  children,
  className,
  style,
  bodyClassName,
  aberto,
  onToggle,
}: {
  id: string;
  titulo: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  bodyClassName?: string;
  aberto: boolean;
  onToggle: () => void;
}) {
  return (
    <section
      className={`flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-panel ${className ?? ""}`}
      style={style}
      data-panel={id}
      data-open={aberto ? "1" : "0"}
    >
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-0.5 text-left outline-none transition-colors hover:bg-secondary/50 focus-visible:ring-1 focus-visible:ring-ring"
          aria-expanded={aberto}
          aria-controls={`panel-body-${id}`}
          title={aberto ? "Recolher" : "Expandir"}
        >
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
              aberto ? "" : "-rotate-90"
            }`}
          />
          <h2 className="truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {titulo}
          </h2>
        </button>
        {extra && aberto ? <div className="flex shrink-0 items-center gap-2">{extra}</div> : null}
      </div>
      {aberto ? (
        <div
          id={`panel-body-${id}`}
          className={`min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto scrollbar-none p-3 ${bodyClassName ?? ""}`}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}

/** Painel redimensionável + recolhível (seta no título). */
export function ResizeCard({
  id,
  titulo,
  extra,
  children,
  bodyClassName,
  style,
  className,
  defaultSize,
  minSize = "12%",
  maxSize,
  collapsedSize = 36,
}: {
  id: string;
  titulo: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
  bodyClassName?: string;
  style?: React.CSSProperties;
  className?: string;
  defaultSize?: number | string;
  minSize?: number | string;
  maxSize?: number | string;
  collapsedSize?: number | string;
}) {
  const panelRef = usePanelRef();
  const [aberto, setAberto] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`gmcp.panel.${id}`);
      if (raw === "0") {
        setAberto(false);
        requestAnimationFrame(() => panelRef.current?.collapse());
      }
    } catch {
      /* ignore */
    }
  }, [id, panelRef]);

  const alternar = () => {
    const p = panelRef.current;
    if (!p) return;
    if (p.isCollapsed()) {
      p.expand();
      setAberto(true);
      try {
        localStorage.setItem(`gmcp.panel.${id}`, "1");
      } catch {
        /* ignore */
      }
    } else {
      p.collapse();
      setAberto(false);
      try {
        localStorage.setItem(`gmcp.panel.${id}`, "0");
      } catch {
        /* ignore */
      }
    }
  };

  return (
    <ResizablePanel
      id={id}
      panelRef={panelRef}
      collapsible
      collapsedSize={collapsedSize}
      defaultSize={defaultSize}
      minSize={minSize}
      maxSize={maxSize}
      className="min-h-0 min-w-0"
      style={{ height: "100%", width: "100%", overflow: "hidden" }}
      onResize={(size) => {
        // Ignora frames iniciais a 0px (antes do layout) para não “apagar” os cards
        if (size.inPixels <= 0) return;
        const collapsed = size.inPixels <= 48;
        setAberto((prev) => {
          if (prev === !collapsed) return prev;
          try {
            localStorage.setItem(`gmcp.panel.${id}`, collapsed ? "0" : "1");
          } catch {
            /* ignore */
          }
          return !collapsed;
        });
      }}
    >
      <div className="box-border flex h-full min-h-0 w-full flex-col p-0.5">
        <DashCard
          id={id}
          titulo={titulo}
          aberto={aberto}
          onToggle={alternar}
          {...(extra !== undefined ? { extra } : {})}
          {...(style !== undefined ? { style } : {})}
          {...(className !== undefined ? { className } : {})}
          {...(bodyClassName !== undefined ? { bodyClassName } : {})}
        >
          {children}
        </DashCard>
      </div>
    </ResizablePanel>
  );
}

export const DASH_LAYOUT_KEYS = [
  "react-resizable-panels:gmcp-audio-main-v2",
  "react-resizable-panels:gmcp-audio-left-v2",
  "react-resizable-panels:gmcp-audio-right-v3",
  "react-resizable-panels:gmcp-audio-mobile-v3",
  // legado
  "react-resizable-panels:gmcp-audio-right-v2",
  "react-resizable-panels:gmcp-audio-mobile-v2",
  "react-resizable-panels:gmcp-audio-main",
  "react-resizable-panels:gmcp-audio-left",
  "react-resizable-panels:gmcp-audio-right",
  "react-resizable-panels:gmcp-audio-mobile",
  "react-resizable-panels:gmcp-dash-main",
  "react-resizable-panels:gmcp-dash-left",
  "react-resizable-panels:gmcp-dash-right",
  "react-resizable-panels:gmcp-dash-mobile",
] as const;

export function resetDashboardLayouts() {
  for (const key of DASH_LAYOUT_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  // Limpa quaisquer chaves de layout da lib (evita min>max persistido)
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("react-resizable-panels:gmcp-")) doomed.push(k);
    }
    for (const k of doomed) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
  // também limpa estados recolhidos
  for (const id of ["transcricao", "campanha", "cena", "spotify", "voz", "sfx"]) {
    try {
      localStorage.removeItem(`gmcp.panel.${id}`);
    } catch {
      /* ignore */
    }
  }
  window.location.reload();
}
