import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { TopBar } from "@/components/gm/TopBar";
import { Button } from "@/components/ui/button";
import {
  apagarDocumento,
  indexarDocumento,
  listarDocumentos,
  type DocResumo,
} from "@/lib/rag.functions";
import { Loader2, Trash2, Upload } from "lucide-react";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Documentação da Campanha — GM Co-Pilot" },
      {
        name: "description",
        content:
          "Carrega os documentos da tua campanha de RPG para poderes fazer perguntas durante a sessão.",
      },
      { property: "og:title", content: "Documentação da Campanha — GM Co-Pilot" },
      {
        property: "og:description",
        content: "Upload de notas e lore da campanha para pesquisa semântica durante o jogo.",
      },
    ],
  }),
  component: DocsPage,
});

function DocsPage() {
  const [aba, setAba] = useState<"campanha" | "manual">("campanha");
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TopBar />
      <main className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-lg font-semibold">Documentação</h1>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant={aba === "campanha" ? "default" : "outline"}
              onClick={() => setAba("campanha")}
            >
              Campanha
            </Button>
            <Button
              size="sm"
              variant={aba === "manual" ? "default" : "outline"}
              onClick={() => setAba("manual")}
            >
              Manual
            </Button>
          </div>
          <div className="mt-4">{aba === "campanha" ? <Campanha /> : <Manual />}</div>
        </div>
      </main>
    </div>
  );
}

function Campanha() {
  const listar = useServerFn(listarDocumentos);
  const indexar = useServerFn(indexarDocumento);
  const apagar = useServerFn(apagarDocumento);
  const [docs, setDocs] = useState<DocResumo[]>([]);
  const [aCarregar, setACarregar] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const recarregar = useCallback(async () => {
    try {
      setDocs(await listar({}));
    } catch (e) {
      console.error(e);
    }
  }, [listar]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  async function processar(ficheiros: FileList | null) {
    if (!ficheiros?.length) return;
    for (const f of Array.from(ficheiros)) {
      if (!/\.(md|txt|markdown)$/i.test(f.name)) {
        toast.error(`${f.name}: só aceito .md ou .txt`);
        continue;
      }
      setACarregar(f.name);
      try {
        const conteudo = await f.text();
        const { chunks } = await indexar({ data: { nome: f.name, conteudo } });
        toast.success(`${f.name} indexado (${chunks} pedaços)`);
      } catch (e) {
        console.error(e);
        toast.error(`Falhei a indexar ${f.name}`);
      } finally {
        setACarregar(null);
      }
    }
    await recarregar();
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void processar(e.dataTransfer.files);
        }}
        className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-panel p-8 text-center"
      >
        <Upload className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Arrasta ficheiros .md ou .txt para aqui, ou
        </p>
        <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
          Escolher ficheiros
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".md,.txt,.markdown"
          multiple
          className="hidden"
          onChange={(e) => void processar(e.target.files)}
        />
        {aCarregar && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> A indexar {aCarregar}…
          </p>
        )}
      </div>

      <div className="rounded-lg border border-border bg-panel">
        <p className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Documentos indexados
        </p>
        {docs.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">Ainda não há documentos.</p>
        ) : (
          <ul className="divide-y divide-border">
            {docs.map((d) => (
              <li key={d.doc_name} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>
                  {d.doc_name}{" "}
                  <span className="text-xs text-muted-foreground">· {d.chunks} pedaços</span>
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Apagar ${d.doc_name}`}
                  onClick={() => {
                    void (async () => {
                      await apagar({ data: { nome: d.doc_name } });
                      await recarregar();
                    })();
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Seccao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-panel p-3">
      <h2 className="text-sm font-semibold">{titulo}</h2>
      <div className="mt-2 space-y-1.5 text-sm text-muted-foreground">{children}</div>
    </section>
  );
}

function Manual() {
  return (
    <div className="space-y-3">
      <Seccao titulo="O que é o GM Co-Pilot">
        <p>
          Painel de apoio ao mestre durante a sessão: ouve a mesa, deteta o tipo de cena, troca a
          música no Spotify, dispara efeitos sonoros e responde a perguntas sobre as tuas notas.
          Nunca bloqueia o jogo — os erros aparecem apenas como avisos discretos.
        </p>
      </Seccao>

      <Seccao titulo="Arranque rápido">
        <p>1. Abre a app em http://127.0.0.1:8080 (não uses localhost — o Spotify rejeita).</p>
        <p>2. Em Definições, cola o Redirect URI e regista-o no Spotify Dashboard.</p>
        <p>3. Liga o Spotify (Premium + dispositivo activo a tocar).</p>
        <p>4. Preenche as 6 playlists das cenas e guarda.</p>
        <p>5. Carrega as notas da campanha no separador “Campanha”.</p>
        <p>6. “Iniciar Sessão” e autoriza o microfone.</p>
      </Seccao>

      <Seccao titulo="Variáveis de ambiente (local)">
        <p>
          No ficheiro <code>.env</code> (servidor): <code>OPENAI_API_KEY</code>,{" "}
          <code>SUPABASE_URL</code>, <code>SUPABASE_PUBLISHABLE_KEY</code>, e de preferência{" "}
          <code>SUPABASE_SERVICE_ROLE_KEY</code>. Nunca uses prefixo <code>VITE_</code> em
          segredos.
        </p>
      </Seccao>

      <Seccao titulo="Atalhos">
        <p>1 – 6: mudar de cena · Q W E R T Y: os 6 primeiros efeitos sonoros</p>
        <p>Espaço: play/pause · M: silenciar microfone · /: perguntar às notas</p>
      </Seccao>

      <Seccao titulo="Cenas e classificação automática">
        <p>
          Com a sessão a decorrer, as últimas falas são analisadas a cada 15 segundos. A cena só
          muda com confiança alta (ou confirmada duas vezes) e nunca mais do que uma vez por
          30 segundos. Se mudares de cena à mão, a automação pausa 2 minutos. Podes desligá-la no
          botão “Auto”.
        </p>
      </Seccao>

      <Seccao titulo="Documentos e perguntas">
        <p>
          Aceita .md e .txt. O texto é dividido em pedaços, indexado por semelhança semântica e
          consultado quando fazes uma pergunta. As respostas citam os excertos usados; se nada
          corresponder, o co-piloto diz que não encontrou.
        </p>
      </Seccao>

      <Seccao titulo="Sessões e resumos">
        <p>
          Ao parar a sessão é gerado um resumo com síntese, decisões, NPCs, ganchos e ações para o
          mestre. Tudo fica em “Sessões”, com a transcrição completa e exportação em Markdown.
        </p>
      </Seccao>

      <Seccao titulo="Resolução de problemas">
        <p>
          <strong>Spotify redirect_uri</strong>: regista exactamente{" "}
          <code>http://127.0.0.1:8080/callback</code> (com /callback). Spotify rejeita{" "}
          <code>localhost</code>.
        </p>
        <p>
          <strong>Sem dispositivo activo</strong>: começa a tocar algo no Spotify e escolhe o
          dispositivo em Definições.
        </p>
        <p>
          <strong>Transcrição a reconectar</strong>: tenta até 3 vezes com novo token; se falhar,
          pára a sessão mas os controlos manuais continuam.
        </p>
        <p>
          <strong>SFX</strong>: packs (DnD, Ordem Paranormal, custom) nas Definições; no
          dashboard escolhes o perfil. MP3 em <code>public/sfx/</code> (Mixkit); se vazio,
          fallback procedural.
        </p>
        <p>
          <strong>OPENAI_API_KEY</strong>: necessária para transcrição, classificação, RAG e
          resumos. Reinicia o servidor após editar o <code>.env</code>. Se aparecer “créditos
          esgotados”, adiciona saldo em platform.openai.com ou define{" "}
          <code>LOVABLE_API_KEY</code> como fallback de chat/embeddings.
        </p>
      </Seccao>
    </div>
  );
}

