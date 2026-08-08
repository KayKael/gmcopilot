import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { iniciarTranscricao, type SessaoTranscricao } from "@/lib/realtime-client";
import { criarTokenTranscricao } from "@/lib/realtime.functions";
import { guardarMicrofone, obterMicrofoneGuardado, restricoesAudio } from "@/lib/mic-device";

const DURACAO_TESTE_MS = 8000;

export function MicPanel() {
  const pedirToken = useServerFn(criarTokenTranscricao);
  const [nivel, setNivel] = useState(0);
  const [pico, setPico] = useState(0);
  const [aEscutar, setAEscutar] = useState(false);
  const [aTestar, setATestar] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [dispositivo, setDispositivo] = useState<string | null>(null);
  const [dispositivos, setDispositivos] = useState<MediaDeviceInfo[]>([]);
  const [selecionado, setSelecionado] = useState<string>("auto");

  const streamRef = useRef<MediaStream | null>(null);
  const contextoRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const sessaoTesteRef = useRef<SessaoTranscricao | null>(null);

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

  useEffect(
    () => () => {
      void pararEscuta();
      try {
        sessaoTesteRef.current?.parar();
      } catch {
        /* ignorar */
      }
    },
    [],
  );

  const listarDispositivos = async () => {
    try {
      const lista = await navigator.mediaDevices.enumerateDevices();
      setDispositivos(lista.filter((d) => d.kind === "audioinput"));
    } catch (erro) {
      console.error(erro);
    }
  };

  useEffect(() => {
    setSelecionado(obterMicrofoneGuardado() ?? "auto");
    void listarDispositivos();
    navigator.mediaDevices?.addEventListener?.("devicechange", listarDispositivos);
    return () =>
      navigator.mediaDevices?.removeEventListener?.("devicechange", listarDispositivos);
  }, []);

  const escolherDispositivo = async (valor: string) => {
    setSelecionado(valor);
    guardarMicrofone(valor === "auto" ? null : valor);
    if (aEscutar) {
      await pararEscuta();
      await comecarEscuta(valor === "auto" ? null : valor);
    }
  };

  const comecarEscuta = async (deviceId?: string | null) => {
    try {
      const id = deviceId ?? (selecionado === "auto" ? null : selecionado);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: restricoesAudio(id),
      });
      void listarDispositivos();
      streamRef.current = stream;
      setDispositivo(stream.getAudioTracks()[0]?.label ?? "Microfone");
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
    const finais: string[] = [];
    try {
      // Evita conflito com o medidor de nível (dois getUserMedia no mesmo mic)
      if (aEscutar) await pararEscuta();

      const { token } = await pedirToken({ data: undefined });
      const deviceId = selecionado === "auto" ? null : selecionado;
      sessaoTesteRef.current = await iniciarTranscricao({
        token,
        deviceId,
        onParcial: (texto) => setResultado(texto || null),
        onFinal: (texto) => {
          if (texto.trim()) finais.push(texto.trim());
          setResultado(finais.join(" ") || texto);
        },
        onEstado: () => {},
      });

      await new Promise((r) => window.setTimeout(r, DURACAO_TESTE_MS));
      sessaoTesteRef.current?.parar();
      sessaoTesteRef.current = null;

      const texto = finais.join(" ").trim();
      setResultado(texto || "(nada percetível — fala mais alto ou aproxima-te)");
    } catch (erro) {
      console.error(erro);
      try {
        sessaoTesteRef.current?.parar();
      } catch {
        /* ignorar */
      }
      sessaoTesteRef.current = null;
      toast.error(
        erro instanceof Error ? erro.message : "Falha ao transcrever o teste",
      );
    } finally {
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
        <Button
          size="sm"
          variant={aEscutar ? "secondary" : "default"}
          onClick={() => (aEscutar ? void pararEscuta() : void comecarEscuta())}
        >
          {aEscutar ? "Parar" : "Testar áudio"}
        </Button>
      </div>

      <div className="mt-4">
        <Select value={selecionado} onValueChange={(v) => void escolherDispositivo(v)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Microfone predefinido" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Predefinido do sistema</SelectItem>
            {dispositivos.map((d, i) => (
              <SelectItem key={d.deviceId} value={d.deviceId}>
                {d.label || `Microfone ${i + 1}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Os nomes só aparecem depois de dares permissão de microfone.
        </p>
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
          {aTestar ? "A ouvir 8s…" : "Testar transcrição (8s)"}
        </Button>
        {resultado && <p className="text-xs text-foreground/80">“{resultado}”</p>}
      </div>
    </section>
  );
}
