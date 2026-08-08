import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { iniciarTranscricao, type SessaoTranscricao } from "@/lib/realtime-client";
import { criarTokenTranscricao } from "@/lib/realtime.functions";
import { resumirSessao } from "@/lib/sessao.functions";
import { useSessionStore } from "@/store/session";

const MAX_RETRIES = 3;

export function useTranscricao() {
  const pedirToken = useServerFn(criarTokenTranscricao);
  const gerarResumo = useServerFn(resumirSessao);
  const sessaoRef = useRef<SessaoTranscricao | null>(null);
  const retriesRef = useRef(0);
  const aPararRef = useRef(false);
  const sidRef = useRef<string | null>(null);
  const aReconectarRef = useRef(false);

  const status = useSessionStore((s) => s.status);
  const setStatus = useSessionStore((s) => s.setStatus);
  const sessionId = useSessionStore((s) => s.sessionId);
  const setSessionId = useSessionStore((s) => s.setSessionId);
  const addLinha = useSessionStore((s) => s.addLinha);
  const setParcial = useSessionStore((s) => s.setParcial);
  const limparTranscricao = useSessionStore((s) => s.limparTranscricao);
  const micMudo = useSessionStore((s) => s.micMudo);
  const setMicMudo = useSessionStore((s) => s.setMicMudo);

  const guardarLinha = useCallback(
    async (texto: string, sid: string | null) => {
      const linha = {
        id: crypto.randomUUID(),
        ts: new Date().toISOString(),
        texto,
      };
      addLinha(linha);
      const { error } = await supabase
        .from("transcript_lines")
        .insert({ id: linha.id, session_id: sid, texto, ts: linha.ts });
      if (error) console.error("Não consegui guardar a linha:", error.message);
    },
    [addLinha],
  );

  const ligarWebRTC = useCallback(
    async (sid: string) => {
      const { token } = await pedirToken({ data: undefined });
      sessaoRef.current = await iniciarTranscricao({
        token,
        onParcial: setParcial,
        onFinal: (texto) => void guardarLinha(texto, sid),
        onEstado: (estado) => {
          if (estado === "ligado") {
            retriesRef.current = 0;
            aReconectarRef.current = false;
            setStatus("ativa");
          } else if (estado === "erro") {
            if (aPararRef.current || aReconectarRef.current) return;
            void reconectar();
          }
        },
      });
      setMicMudo(false);
    },
    // reconectar via closure estável abaixo
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [guardarLinha, pedirToken, setMicMudo, setParcial, setStatus],
  );

  const ligarRef = useRef(ligarWebRTC);
  ligarRef.current = ligarWebRTC;

  async function reconectar() {
    if (aPararRef.current || aReconectarRef.current) return;
    const sid = sidRef.current;
    if (!sid) {
      setStatus("parada");
      return;
    }

    aReconectarRef.current = true;
    try {
      sessaoRef.current?.parar();
    } catch {
      /* ignorar */
    }
    sessaoRef.current = null;

    if (retriesRef.current >= MAX_RETRIES) {
      setStatus("parada");
      aReconectarRef.current = false;
      toast.error("Ligação de transcrição perdida (sem mais tentativas)");
      return;
    }

    retriesRef.current += 1;
    setStatus("reconectando");
    toast.message(`A reconectar transcrição (${retriesRef.current}/${MAX_RETRIES})…`);

    try {
      await ligarRef.current(sid);
    } catch (e) {
      console.error(e);
      aReconectarRef.current = false;
      if (retriesRef.current >= MAX_RETRIES) {
        setStatus("parada");
        toast.error("Não consegui reestabelecer a transcrição");
      } else {
        window.setTimeout(() => void reconectar(), 1500 * retriesRef.current);
      }
    }
  }

  const parar = useCallback(async () => {
    aPararRef.current = true;
    aReconectarRef.current = false;
    try {
      sessaoRef.current?.parar();
    } catch {
      /* ignorar */
    }
    sessaoRef.current = null;
    setParcial("");
    setStatus("parada");
    const sid = sidRef.current ?? sessionId;
    if (sid) {
      await supabase
        .from("sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", sid);
      try {
        await gerarResumo({ data: { id: sid } });
        toast.success("Resumo da sessão gerado");
      } catch (e) {
        console.error(e);
        toast.error(
          e instanceof Error ? e.message : "Não consegui gerar o resumo da sessão",
        );
      }
    }
  }, [gerarResumo, sessionId, setParcial, setStatus]);

  const iniciar = useCallback(async () => {
    if (sessaoRef.current) return;
    aPararRef.current = false;
    aReconectarRef.current = false;
    retriesRef.current = 0;
    setStatus("reconectando");
    limparTranscricao();
    try {
      const { data: sess, error } = await supabase
        .from("sessions")
        .insert({ nome: `Sessão de ${new Date().toLocaleDateString("pt-PT")}` })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      const sid = sess.id as string;
      sidRef.current = sid;
      setSessionId(sid);
      await ligarRef.current(sid);
    } catch (e) {
      console.error(e);
      setStatus("parada");
      toast.error(
        e instanceof DOMException
          ? "Sem acesso ao microfone"
          : e instanceof Error
            ? e.message
            : "Não consegui iniciar a transcrição",
      );
    }
  }, [limparTranscricao, setSessionId, setStatus]);

  const alternarMic = useCallback(() => {
    if (!sessaoRef.current) return;
    const novo = !micMudo;
    sessaoRef.current.setMudo(novo);
    setMicMudo(novo);
  }, [micMudo, setMicMudo]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key.toLowerCase() === "m") alternarMic();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [alternarMic]);

  useEffect(
    () => () => {
      aPararRef.current = true;
      try {
        sessaoRef.current?.parar();
      } catch {
        /* ignorar */
      }
    },
    [],
  );

  return { status, iniciar, parar, alternarMic, micMudo };
}
