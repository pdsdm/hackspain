import type { AttendeesBrief, Channel, Segment } from "./types.js";

export const SMS_MAX_CHARS = 300;

function hhmm(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function zoneName(zone: "norte" | "sur"): string {
  return zone === "sur" ? "MADRING Sur" : "MADRING Norte";
}

function destination(brief: AttendeesBrief): string {
  return brief.assignedSpaceName
    ? `Tu espacio asignado es ${brief.assignedSpaceName}.`
    : "Te enviaremos el espacio asignado cuando quede confirmado.";
}

const NORTH_WARNING = "No intentes entrar por Norte: las zonas no están conectadas por dentro.";

export function segmentOf(groupId: string): Segment | undefined {
  if (groupId === "g-acceso" || groupId === "g-shuttles" || groupId === "g-propios") return groupId;
  return undefined;
}

export function buildMessage(brief: AttendeesBrief, channel: Channel): string {
  const segment = segmentOf(brief.groupId);
  const zone = zoneName(brief.zone);
  const opening = hhmm(brief.openingAt);
  let body: string;
  if (segment === "g-acceso") {
    body = `Permanece en el control de acceso ${zone.replace("MADRING ", "")}. ${destination(brief)} El equipo te acompañará al nuevo espacio cuando esté preparado.`;
  } else if (segment === "g-shuttles") {
    body = `Tu shuttle llega al acceso ${zone.replace("MADRING ", "")}. ${destination(brief)} Espera instrucciones al bajar. ${NORTH_WARNING}`;
  } else {
    body = `Tu acceso sigue siendo ${zone}. La apertura se mantiene a las ${opening}. ${destination(brief)} ${NORTH_WARNING}`;
  }
  if (channel === "email") {
    return `Hospitalidad MADRING · cambio de plan\n\n${body}\n\nSi tienes una necesidad de accesibilidad o alimentación registrada, responde a este correo y te confirmamos que la alternativa la cubre.`;
  }
  return body.length <= SMS_MAX_CHARS ? body : `${body.slice(0, SMS_MAX_CHARS - 1)}…`;
}

export function buildNeedsMessage(brief: AttendeesBrief): string {
  const space = brief.assignedSpaceName ?? "el nuevo espacio";
  const needs = brief.needs ?? "tu necesidad registrada";
  const body = `Hospitalidad MADRING: tenemos registrada ${needs}. Queremos confirmar que ${space} la cubre. Responde SÍ si te vale o llámanos para coordinar la asistencia.`;
  return body.length <= SMS_MAX_CHARS ? body : `${body.slice(0, SMS_MAX_CHARS - 1)}…`;
}
