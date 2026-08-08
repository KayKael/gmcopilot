import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { iniciarGravador, type GravadorAudio } from "@/lib/audio-recorder";
import { transcreverBloco } from "@/lib/transcricao.functions";

const DURACAO_TESTE_MS = 5000;

export function MicPanel() {
  const [nivel, setNivel] = useState(0);
  const [pico, setPico] = useState(0);
  const [aEscutar, setAEscutar] = useState(false);
  const [aTestar, setATestar] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [dispositivo, setDispositivo] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const contextoRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const gravadorRef = useRef<GravadorAudio | null>(null);

  const pararEscuta = async () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    for (const faixa of streamRef.current?.getTracks() ?? []) faixa.stop();
    streamRef.current = null;
    if (contextoRef.current) await contextoRef.current.close();
    contextoRef.current = null;
    setAEscutar(false);
    setNivel(0);
  };

  useEffect(() => () => void pararEscuta(), []);

  const comecarEscuta = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      setDispositivo(stream.getAudioTracks()[0]?.label ?? "Microfone预");
      const contexto = new AudioContext();
      await contexto.resume();
      contextoRef.current = contexto;
      const analisador = contexto.createAnalyser();
      analisador.fftSize = 1024;
      contexto.createMediaStreamSource(stream).connect(analisador);
      const dados = new Float32Array(analisador.fftSize);
      setPico(0);
      setAEscutar(true);

      const medir = () => {
        analisador.getFloatTimeDomainData(dados);
        let soma = 0;
        for (const amostra of dados) soma += amostra * amostra;
        const rms = Math.sqrt(soma / dados.length);
        const valor = Math.min(1, rms * 6);
        setNivel(valor);
        setPico((anterior) => Math.max(anterior, valor));
        rafRef.current = requestAnimationFrame(medir);
      };
      medir();
    } catch (erro) {
      console.error(erro);
      toast.error("Não consegui aceder ao microfone");
    }
  };

  const testarTranscricao = async () => {
    if (aTestar) return;
    setATestar(true);
    setResultado(null);
    try {
      let recebido = false;
      gravadorRef.current = await iniciarGravador({
        intervaloMs: DURACAO_TESTE_MS,
        onBloco: (wavBase64) => {
          if (recebido) return;
          recebido = true;
          void (async () => {
            try {
              const { texto } = await transcreverBloco({ data: { wavBase64 } });
              setResultado(texto || "(nada percetível — fala mais alto ou aproxima-te)");
            } catch (erro) {
              console.error(erro);
              toast.error("Falha ao transcrever o teste");
            } finally {
              await gravadorRef.current?.parar();
              gravadorRef.current = null;
              setATestar(false);
            }
          })();
        },
        onErro: (erro) => console.error(erro),
      });
    } catch (erro) {
      console.error(erro);
      toast.error("Não consegui aceder ao microfone");
      setATestar(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Microfone</h2>
          <p className="text-xs text-muted-foreground">
            Verifica se o teu microfone está a captar som antes de iniciar a sessão.
          </p>
        </div>
        <Button size="sm" variant={aEscutar ? "secondary" : "default"} onClick={() => (aEscutar ? void pararEscuta() : void comecarEscuta())}>
          {aEscutar ? "Parar" : "Testar áudio"}
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        <div className="h-3 w-full overflow-hidden rounded bg-muted">
          <div
            className="h-full bg-primary transition-[width] duration-75"
            style={{ width: `${Math.round(nivel * 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{dispositivo ?? "Nenhum dispositivo ativo"}</span>
          <span>
            {aEscutar
              ? pico > 0.05
                ? `A ouvir — pico ${Math.round(pico * 100)}%`
                : "Sem som detetado…"
              : "Parado"}
          </span>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button size="sm" variant="outline" onClick={() => void testarTranscricao()} disabled={aTestar}>
          {aTestar ? "A gravar 5s…" : "Testar transcrição (5s)"}
        </Button>
        {resultado && <p className="text-xs text-foreground/80">“{resultado}”</p>}
      </div>
    </section>
  );
}
