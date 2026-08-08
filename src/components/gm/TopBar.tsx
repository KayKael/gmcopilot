import { Link } from "@tanstack/react-router";
import { Keyboard, Radio, Settings, FileText, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSessionStore } from "@/store/session";

const atalhos: [string, string][] = [
  ["1 – 6", "Mudar de cena (combate → épico)"],
  ["Q W E R T Y", "Tocar os 6 primeiros efeitos sonoros"],
  ["Espaço", "Play / pause no Spotify"],
  ["M", "Ligar / desligar o microfone"],
];

export function TopBar() {
  const status = useSessionStore((s) => s.status);
  const spotifyStatus = useSessionStore((s) => s.spotifyStatus);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-panel px-4">
      <div className="flex items-center gap-2">
        <Radio className="h-5 w-5 text-primary" />
        <span className="text-sm font-semibold tracking-tight">GM Co-Pilot</span>
      </div>

      <span
        className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
        data-status={status}
      >
        Sessão:{" "}
        <span
          className={
            status === "ativa"
              ? "text-ok"
              : status === "reconectando"
                ? "text-warn"
                : "text-muted-foreground"
          }
        >
          {status === "ativa" ? "a decorrer" : status === "reconectando" ? "a reconectar…" : "parada"}
        </span>
      </span>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="outline" size="sm" disabled>
          {spotifyStatus === "ligado" ? (
            <span className="text-ok">Spotify: ligado ✓</span>
          ) : (
            "Ligar Spotify"
          )}
        </Button>

        <Button size="sm" variant={status === "parada" ? "default" : "destructive"} disabled>
          {status === "parada" ? (
            <>
              <Play className="h-4 w-4" /> Iniciar Sessão
            </>
          ) : (
            <>
              <Square className="h-4 w-4" /> Parar Sessão
            </>
          )}
        </Button>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Atalhos de teclado">
              <Keyboard className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Atalhos
            </p>
            <ul className="space-y-1.5 text-sm">
              {atalhos.map(([tecla, desc]) => (
                <li key={tecla} className="flex items-start justify-between gap-3">
                  <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 text-xs">
                    {tecla}
                  </kbd>
                  <span className="flex-1 text-right text-xs text-muted-foreground">{desc}</span>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>

        <Button asChild variant="ghost" size="icon" aria-label="Documentação">
          <Link to="/docs">
            <FileText className="h-4 w-4" />
          </Link>
        </Button>
        <Button asChild variant="ghost" size="icon" aria-label="Definições">
          <Link to="/settings">
            <Settings className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </header>
  );
}
