import { createHash } from "node:crypto";

import type { JevEvaluateFn } from "../agents/jev.js";
import type { SpecialistResultEnvelope, TranscriptLine } from "../contracts/api.js";
import type { DispatchTask } from "../state/task-repository.js";
import {
  acceptanceGap, confirmationBlocker, decideAcceptance, readVerificationTarget, verificationSnapshot,
  type AcceptanceDecision, type AcceptanceScores, type VerificationTarget,
} from "./acceptance-policy.js";
import type { CrisisStateDocument } from "./crisis-state.js";

export interface CallAcceptanceVerification {
  decision: AcceptanceDecision;
  reason: string;
  target?: VerificationTarget;
  scores?: AcceptanceScores;
  snapshot?: string;
  /** Desacuerdo entre lo que afirma el extractor y lo que sostiene la transcripción. */
  gap?: string;
}

export interface VerificationOptions {
  /** Manda a JEV transcripciones no revisadas. Solo para datos sintéticos. */
  allowUnreviewedTranscripts?: boolean;
  timeoutMs?: number;
}

const DEMO_WORDS = new Set(`a al ahora antes apertura aprueba aprobado autorización autoriza autorizado
  b c cambio capacidad claro clara compromiso condiciones condicionada condicionado confirmación confirmar confirma
  confirmado confirmada confirmo consulta consultar consultarlo con coste de del desde disponible disponibilidad
  el en entonces es está estamos euros falta firme gasto hay invitados la las lo los lounge lugar más me
  montaje necesito no nos norte o para pabellón pero permiso plan plazas por principal puedo puede que queda
  quedado quedaría queremos quiero recinto reserva reservar reservada reservado responsable retiro rectifico
  sí si sin solo sur su son tenemos tengo todavía un una ya y acuerdo acepto aceptación exactamente
  listo lista hasta hora horas mismo misma ni nunca tampoco quizás quizá posible pendiente pendientes
  propuesta otra otro cambio cambiado antes después estoy seguro segura perdón error transcripción
  inaudible duda no sé se bien gracias vale correcto correcta buenas buenos días tardes`.split(/\s+/));

export function isDemoTranscript(text: string): boolean {
  if (!text.trim() || text.length > 2_000 || /[^\p{L}\p{N}\s.,;:¿?¡!€()-]/u.test(text) ||
    /\d(?:[\s.-]*\d){6,}/u.test(text)) return false;
  const tokens = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return tokens.every((token) => DEMO_WORDS.has(token) || ["450", "1500", "3200", "12", "50"].includes(token));
}

export function transcriptPrivacyHash(transcript: readonly TranscriptLine[]): string {
  return createHash("sha256")
    .update(JSON.stringify(transcript.map(({ who, text }) => ({ who, text }))))
    .digest("hex");
}

export function isTranscriptAllowed(transcript: readonly TranscriptLine[], reviewedHashes: readonly string[] = []): boolean {
  if (transcript.length === 0 || transcript.length > 80 || transcript.some((line) => !line.text.trim() || line.text.length > 2_000)) return false;
  return transcript.every((line) => isDemoTranscript(line.text)) || reviewedHashes.includes(transcriptPrivacyHash(transcript));
}

export async function verifyCallAcceptance(
  task: DispatchTask,
  envelope: SpecialistResultEnvelope,
  evaluate: JevEvaluateFn | undefined,
  state: CrisisStateDocument,
  applyConfirmations = false,
  reviewedTranscriptHashes: readonly string[] = [],
  options: VerificationOptions = {},
): Promise<CallAcceptanceVerification> {
  const target = readVerificationTarget(task.payload);
  const keep = (reason: string): CallAcceptanceVerification => ({ decision: "keep_conditional", reason, ...(target ? { target } : {}) });
  if (!target) return keep("target_no_admitido");
  if (!evaluate) return keep("verificacion_no_disponible");
  const blocker = confirmationBlocker(state, task);
  if (blocker) return keep(blocker);
  const transcript = envelope.result.evidence.transcript ?? [];
  if (task.id !== envelope.taskId || task.runId !== envelope.runId || task.planVersion !== envelope.planVersion ||
    envelope.status !== "completed" || envelope.result.outcome !== "accepted" || envelope.result.conditions.length > 0 ||
    !envelope.result.evidence.sessionId?.trim() || envelope.result.evidence.callId !== `call-${task.id}` ||
    !transcript.some((line) => line.who === "humano" && line.text.trim()) ||
    transcript.some((line, index) => line.at < 0 || line.at > 3600 || line.at < (transcript[index - 1]?.at ?? 0))) {
    return keep("evidencia_insuficiente");
  }
  if (!options.allowUnreviewedTranscripts && !isTranscriptAllowed(transcript, reviewedTranscriptHashes)) {
    return keep("privacidad_revision_necesaria");
  }
  const space = state.spaces.find((item) => item.id === target.resourceId)!;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const scores = await Promise.race([
      evaluate({
        objective: "Confirmar la reserva de Pabellón B (Sur) para 450 plazas, sin cambios en los términos acordados.",
        expectedRole: "Responsable de recinto (rol esperado, no identidad autenticada)",
        target,
        terms: { spaceName: "Pabellón B", capacity: 450, readyAt: typeof space.readyAt === "number" ? space.readyAt : null, planCost: Number(state.budget.forecast) },
        transcript: transcript.map(({ who, text, at }) => ({ who, text, at })),
      }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), options.timeoutMs ?? 1_500); }),
    ]);
    const decision = decideAcceptance(scores);
    const gap = acceptanceGap(scores);
    return {
      decision: applyConfirmations ? decision : "keep_conditional",
      reason: decision === "confirm_target" ? (applyConfirmations ? "evidencia_suficiente" : "solo_evaluacion") : "evidencia_insuficiente",
      target, scores,
      ...(gap ? { gap } : {}),
      snapshot: verificationSnapshot(state),
    };
  } catch {
    return keep("verificacion_no_disponible");
  } finally {
    clearTimeout(timer);
  }
}
