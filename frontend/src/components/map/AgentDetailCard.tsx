import { useEffect, useState } from "react";
import { Bot, Building2, Bus, Network, Phone, Users, Utensils, X } from "lucide-react";
import type { Area, CrisisState } from "../../domain/types";
import { fmtClock } from "../../domain/time";
import { Pill, type Tone } from "../ui/Pill";
import { agentCorrection } from "../../domain/selectors";
import { AGENT, COMMITMENT, COORD } from "../ui/status";

const TONE: Record<Tone, string> = {
  ink: "text-ink",
  amber: "text-amber",
  red: "text-red",
  green: "text-green",
  muted: "text-muted",
};
import { Glass } from "./Glass";

export type AgentFocus = "coordinador" | Area;

const ICONS = {
  coordinador: Network,
  espacios: Building2,
  catering: Utensils,
  transporte: Bus,
  asistentes: Users,
} as const;

/**
 * Editor del teléfono del área.
 *
 * La llamada real sale a este número, así que el responsable tiene que poder cambiarlo en
 * mitad de la operación sin tocar variables de entorno ni redespliegue.
 */
function PhoneField({ area, phone, onSave }: {
  area: Area
  phone: string | undefined
  onSave: (area: Area, phone: string | null) => Promise<string | null>
}) {
  // `draft` en null significa «muestra lo que dice el backend»: así el sondeo refresca el
  // campo sin pelearse con lo que el responsable está escribiendo.
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const stored = phone ?? ''
  const value = draft ?? stored

  const submit = async (next: string) => {
    setSaving(true); setError(null); setSaved(false)
    try {
      await onSave(area, next)
      setDraft(null)
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="agent-phone" aria-label={`Teléfono de ${area}`}>
      <h3><Phone size={12} aria-hidden="true" /> Teléfono de la llamada</h3>
      <form
        className="agent-phone-row"
        onSubmit={(e) => { e.preventDefault(); if (value.trim() !== stored) void submit(value.trim()) }}
      >
        <input
          type="tel"
          inputMode="tel"
          value={value}
          placeholder="+34600000000"
          aria-label={`Teléfono en formato E.164 para ${area}`}
          onChange={(e) => { setDraft(e.target.value); setSaved(false); setError(null) }}
          disabled={saving}
        />
        <button type="submit" disabled={saving || value.trim() === '' || value.trim() === stored}>
          {saving ? '…' : 'Guardar'}
        </button>
      </form>
      <p className="agent-phone-hint">
        {error
          ? <span className="text-red">{error}</span>
          : saved
            ? <span className="text-green">Guardado. La próxima llamada usa este número.</span>
            : <>Formato internacional, por ejemplo <span className="num">+34600000000</span>.</>}
      </p>
    </section>
  )
}

function focusOf(s: CrisisState, id: AgentFocus) {
  if (id === "coordinador") {
    const st = COORD[s.coordinatorStatus] ?? COORD.replanificando;
    return {
      name: "Coordinador",
      status: st,
      objective:
        "Coordina a los especialistas y adapta el plan de la operación.",
      reason: `Coordinación global · Plan v${s.planVersion}`,
      lastResult: undefined as string | undefined,
      area: undefined as Area | undefined,
      phone: undefined as string | undefined,
    };
  }
  const a = s.agents.find((agent) => agent.id === id);
  const st = AGENT[a?.status ?? "activo"] ?? AGENT.activo;
  const phone = a?.phone;
  return {
    name: a?.name ?? id,
    status: st,
    objective: a?.objective ?? "Sin objetivo publicado.",
    reason: a?.reason,
    lastResult: a?.lastResult,
    area: id,
    phone,
  };
}

export function AgentDetailCard({
  s,
  id,
  onClose,
  onSavePhone,
}: {
  s: CrisisState;
  id: AgentFocus;
  onClose: () => void;
  onSavePhone: (area: Area, phone: string | null) => Promise<string | null>;
}) {
  const focus = focusOf(s, id);
  const Icon = ICONS[id];
  const correction = agentCorrection(s, focus.area);
  const commitments = (
    focus.area
      ? s.commitments.filter((c) => c.area === focus.area)
      : s.commitments
  ).slice(0, 4);
  const events = [...s.events]
    .reverse()
    .filter((e) =>
      focus.area
        ? e.area === focus.area
        : !e.area || e.kind === "decision" || e.kind === "intervencion",
    )
    .slice(0, 3);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <Glass
      label={`Detalle de ${focus.name}`}
      className="w-[300px] agent-detail"
    >
      <header className="agent-detail-heading">
        <div className="agent-detail-title">
          <Icon size={15} />
          <h2>Agente · {focus.name}</h2>
        </div>
        <Pill tone={focus.status.tone}>{focus.status.label}</Pill>
        <button
          type="button"
          className="agent-detail-close"
          onClick={onClose}
          aria-label="Cerrar detalle del agente"
        >
          <X size={14} />
        </button>
      </header>
      <div className="agent-detail-body">
        <p className="agent-detail-objective">{focus.objective}</p>
        {focus.reason && <p className="agent-role">{focus.reason}</p>}
        {focus.lastResult && (
          <p className="agent-result">
            <span>Último resultado</span>
            {focus.lastResult}
          </p>
        )}
        {focus.area && (
          <PhoneField key={focus.area} area={focus.area} phone={focus.phone} onSave={onSavePhone} />
        )}
        {correction && (
          <section
            className="agent-correction"
            aria-label="El agente corrigió su plan anterior"
          >
            <h3>
              <Bot size={12} aria-hidden="true" /> El agente corrigió
            </h3>
            <p className="agent-correction-failed">
              {correction.failed}
              {correction.note ? ` · ${correction.note}` : ""}
            </p>
            <p className="agent-correction-next">{correction.next}</p>
          </section>
        )}
        {commitments.length > 0 && (
          <section>
            <h3>Compromisos</h3>
            <ul>
              {commitments.map((c) => {
                const meta = COMMITMENT[c.status] ?? COMMITMENT.propuesto;
                return (
                  <li key={c.id}>
                    <span>{c.title}</span>
                    <small className={TONE[meta.tone]}>
                      {meta.label} · {c.counterpart}
                    </small>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {events.length > 0 && (
          <section>
            <h3>Última actividad</h3>
            <ul>
              {events.map((e) => (
                <li key={e.id}>
                  <span>{e.text}</span>
                  <small>
                    {fmtClock(e.time)}
                    {e.actor ? ` · ${e.actor}` : ""}
                  </small>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Glass>
  );
}
