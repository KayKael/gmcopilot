import { Link } from "@tanstack/react-router";
import { Keyboard, Radio, Settings, FileText, Play, Square, Mic, MicOff, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSessionStore } from "@/store/session";
import { useSpotify } from "@/hooks/useSpotify";
import { useTranscricao } from "@/hooks/useTranscricao";

const atalhos: [string, string][] = [
  ["1 – 6", "Mudar de cena (combate → épico)"],
  ["Q W E R T Y", "Tocar os 6 primeiros efeitos sonoros"],
  ["Espaço", "Play / pause no Spotify"],
  ["M", "Ligar / desligar o microfone"],
];

export function TopBar() {
  const status = useSessionStore((s) => s.status);
  const spotifyStatus = useSessionStore((s) => s.spotifyStatus);
  const { ligar, desligar } = useSpotify();
  const { iniciar, parar, alternarMic, micMudo } = useTranscricao();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-panel px-4">
      <Link
        to="/"
        className="flex items-center gap-2 rounded-md outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Ir para a página inicial"
      >
        <Radio className="h-5 w-5 text-primary" />
        <span className="text-sm font-semibold tracking-tight">GM Co-Pilot</span>
      </Link>

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
        <Button
          variant="outline"
          size="sm"
          onClick={() => (spotifyStatus === "ligado" ? desligar() : ligar())}
        >
          {spotifyStatus === "ligado" ? (
            <span className="text-ok">Spotify: ligado ✓</span>
          ) : (
            "Ligar Spotify"
          )}
        </Button>

        {status !== "parada" && (
          <Button
            variant="outline"
            size="icon"
            aria-label={micMudo ? "Reativar microfone" : "Silenciar microfone"}
            onClick={alternarMic}
          >
            {micMudo ? (
              <MicOff className="h-4 w-4 text-destructive" />
            ) : (
              <Mic className="h-4 w-4 text-ok" />
            )}
          </Button>
        )}

        <Button
          size="sm"
          variant={status === "parada" ? "default" : "destructive"}
          onClick={() => void (status === "parada" ? iniciar() : parar())}
        >
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

        <Button asChild variant="ghost" size="icon" aria-label="Histórico de sessões">
          <Link to="/sessoes">
            <History className="h-4 w-4" />
          </Link>
        </Button>
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
