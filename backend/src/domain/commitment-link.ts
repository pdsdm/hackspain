import type { CrisisStateDocument } from "./crisis-state.js";

/**
 * Estados de un compromiso que todavía esperan respuesta de la contraparte. Un compromiso
 * invalidado o completado ya no es lo que contesta una llamada en curso.
 */
const OPEN: ReadonlySet<string> = new Set(["propuesto", "en_consulta", "aceptado_condiciones"]);

function normalize(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim()
    : "";
}

/** Palabras que no distinguen a nadie: aparecen en casi cualquier objetivo o contraparte. */
const NOISE: ReadonlySet<string> = new Set([
  "del", "las", "los", "con", "para", "por", "sin", "responsable", "recinto",
  "confirmar", "consultar", "llamar", "aviso", "plazas", "invitados", "hospitalidad",
]);

function tokens(value: unknown): Set<string> {
  return new Set(
    normalize(value)
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 3 && !NOISE.has(word)),
  );
}

function shared(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const word of left) if (right.has(word)) count += 1;
  return count;
}

/**
 * Qué compromiso responde una acción. Sin esto, el resultado de la llamada se registra pero
 * el compromiso se queda «en consulta» para siempre: el panel nunca enseña un acuerdo cerrado.
 *
 * El LLM no repite literalmente el nombre de la contraparte («Recinto / Pabellón B» frente a
 * «Responsable de Pabellón B / Recinto Ferial»), así que se puntúa el solape de palabras y
 * solo se acepta un ganador claro: atribuir el acuerdo equivocado es peor que no atribuirlo.
 */
export function commitmentIdForAction(
  state: CrisisStateDocument,
  action: { area: string; counterpart?: unknown; objective?: unknown },
): string | undefined {
  const candidates = state.commitments.filter(
    (commitment) =>
      commitment.planVersion === state.planVersion &&
      normalize(commitment.area) === normalize(action.area) &&
      OPEN.has(commitment.status),
  );
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0]!.id;

  const counterpart = tokens(action.counterpart);
  const objective = tokens(action.objective);
  const scored = candidates
    .map((commitment) => ({
      id: commitment.id,
      score: shared(tokens(commitment.counterpart), counterpart) * 2 + shared(tokens(commitment.title), objective),
    }))
    .sort((left, right) => right.score - left.score);
  const [best, second] = scored;
  return best && best.score > 0 && best.score > (second?.score ?? 0) ? best.id : undefined;
}

/** El compromiso que dejó anotado el despacho, si sigue existiendo. */
export function commitmentIdFromTaskPayload(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const data = (payload as Record<string, unknown>).data;
  if (typeof data !== "object" || data === null) return undefined;
  const commitmentId = (data as Record<string, unknown>).commitmentId;
  return typeof commitmentId === "string" && commitmentId !== "" ? commitmentId : undefined;
}
