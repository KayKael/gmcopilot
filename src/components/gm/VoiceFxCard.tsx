import { Loader2, Mic, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useVoiceFx } from "@/hooks/useVoiceFx";
import { VOICE_PRESETS } from "@/lib/voice-presets";
import { useSessionStore } from "@/store/session";

/** Controlo compacto de voz para o dashboard Áudio. */
export function VoiceFxCard() {
  const statusSessao = useSessionStore((s) => s.status);
  const sessaoActiva = statusSessao !== "parada";

  const {
    activo,
    aArrancar,
    nivel,
    presetKey,
    personalizado,
    params,
    monitorLigado,
    activar,
    parar,
    escolherPreset,
    actualizarCampo,
    alternarMonitor,
  } = useVoiceFx();

  const nomePreset =
    VOICE_PRESETS.find((p) => p.key === presetKey)?.nome ?? presetKey;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5">
      {sessaoActiva && (
        <p className="rounded-md border border-warn/40 bg-warn/10 px-2 py-1.5 text-[11px] text-warn">
          Sessão de transcrição activa — para a sessão para usar a voz.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!activo ? (
          <Button
            size="sm"
            disabled={sessaoActiva || aArrancar}
            onClick={() => void activar()}
          >
            {aArrancar ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Mic className="h-3.5 w-3.5" />
            )}
            Ativar
          </Button>
        ) : (
          <Button size="sm" variant="destructive" onClick={() => void parar()}>
            <Square className="h-3.5 w-3.5" />
            Parar
          </Button>
        )}
        <span className="text-[11px] text-muted-foreground">
          {activo
            ? personalizado
              ? "Activo · personalizado"
              : `Activo · ${nomePreset}`
            : "Parado"}
        </span>
      </div>

      <div>
        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-75"
            style={{ width: `${Math.round(nivel * 100)}%` }}
          />
        </div>
      </div>

      <label className="block space-y-1">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Perfil
        </span>
        <select
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          value={presetKey}
          onChange={(e) => escolherPreset(e.target.value)}
          aria-label="Perfil de voz"
        >
          {VOICE_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.nome}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-2">
        <div className="min-w-0">
          <p className="text-xs font-medium">Ouvir-me</p>
          <p className="text-[10px] text-muted-foreground">Retorno processado</p>
        </div>
        <Switch
          checked={monitorLigado}
          onCheckedChange={alternarMonitor}
          aria-label="Ouvir retorno da voz"
        />
      </div>

      <div className="flex items-center gap-2">
        <Volume2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(params.monitorGain * 100)}
          disabled={!monitorLigado}
          onChange={(e) => actualizarCampo("monitorGain", Number(e.target.value) / 100)}
          className="h-1.5 w-full accent-primary disabled:opacity-40"
          aria-label="Volume do retorno"
        />
        <span className="w-7 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
          {Math.round(params.monitorGain * 100)}
        </span>
      </div>

      <label className="block space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="uppercase tracking-wider text-muted-foreground">Pitch</span>
          <span className="tabular-nums text-foreground/80">
            {params.pitchSemitones > 0 ? "+" : ""}
            {params.pitchSemitones} st
          </span>
        </div>
        <input
          type="range"
          min={-12}
          max={6}
          step={0.5}
          value={params.pitchSemitones}
          onChange={(e) => actualizarCampo("pitchSemitones", Number(e.target.value))}
          className="h-1.5 w-full accent-primary"
          aria-label="Pitch da voz"
        />
      </label>
    </div>
  );
}
