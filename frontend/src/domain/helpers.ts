/** A partir de aquí el backend da la llamada real por perdida (no_answer). */
export const REAL_CALL_TIMEOUT_SECONDS = 180

export function callCapSeconds() {
  return REAL_CALL_TIMEOUT_SECONDS
}
