import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { TopBar } from "@/components/gm/TopBar";
import { Button } from "@/components/ui/button";
import {
  apagarSessao,
  listarSessoes,
  resumirSessao,
  type SessaoResumo,
} from "@/lib/sessao.functions";
import { Loader2, Trash2 } from "lucide-react";

export const Route = createFileRoute("/sessoes")({
  head: () => ({
    meta: [
      { title: "Histórico de Sessões — GM Co-Pilot" },
      {
        name: "description",
        content:
          "Todas as sessões de jogo com resumo automático, transcrição completa e exportação em Markdown.",
      },
      { property: "og:title", content: "Histórico de Sessões — GM Co-Pilot" },
      {
        property: "og:description",
        content: "Resumos, transcrições e linha do tempo de cenas das tuas sessões de RPG.",
      },
    ],
  }),
  component: SessoesPage,
});

function SessoesPage() {
  const listar = useServerFn(listarSessoes);
  const resumir = useServerFn(resumirSessao);
  const apagar = useServerFn(apagarSessao);
  const [sessoes, setSessoes] = useState<SessaoResumo[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    try {
      setSessoes(await listar({}));
    } catch (e) {
      console.error(e);
      toast.error("Não consegui carregar as sessões");
    }
  }, [listar]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TopBar />
      <main className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-lg font-semibold">Sessões</h1>
          {sessoes.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Ainda não há sessões gravadas.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {sessoes.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-panel p-3"
                >
                  <div className="min-w-0">
                    <Link
                      to="/sessoes/$id"
                      params={{ id: s.id }}
                      className="text-sm font-medium hover:underline"
                    >
                      {s.nome ?? new Date(s.started_at).toLocaleString("pt-PT")}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {new Date(s.started_at).toLocaleString("pt-PT")} · {s.linhas} linhas ·{" "}
                      {s.resumo ? "com resumo" : "sem resumo"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={ocupado === s.id || s.linhas === 0}
                      onClick={() => {
                        void (async () => {
                          setOcupado(s.id);
                          try {
                            await resumir({ data: { id: s.id } });
                            toast.success("Resumo gerado");
                            await recarregar();
                          } catch {
                            toast.error("Não consegui gerar o resumo");
                          } finally {
                            setOcupado(null);
                          }
                        })();
                      }}
                    >
                      {ocupado === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      {s.resumo ? "Regerar resumo" : "Gerar resumo"}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Apagar sessão"
                      onClick={() => {
                        void (async () => {
                          await apagar({ data: { id: s.id } });
                          await recarregar();
                        })();
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
