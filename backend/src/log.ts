export function logEvent(...parts: unknown[]): void {
  console.log("[events]", ...parts);
}

export function logCoord(...parts: unknown[]): void {
  console.log("[coord]", ...parts);
}

export function logCoordError(...parts: unknown[]): void {
  console.error("[coord]", ...parts);
}

export function logAction(...parts: unknown[]): void {
  console.log("[actions]", ...parts);
}

export function logActionError(...parts: unknown[]): void {
  console.error("[actions]", ...parts);
}
