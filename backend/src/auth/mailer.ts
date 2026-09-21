export type AuthPurpose = "register" | "login";

export type SendAuthEmail = (input: { to: string; code: string; purpose: AuthPurpose }) => Promise<void>;

function subject(purpose: AuthPurpose, code: string): string {
  return purpose === "register" ? `Tu código de registro: ${code}` : `Tu código de acceso: ${code}`;
}

function textBody(purpose: AuthPurpose, code: string): string {
  const action = purpose === "register" ? "crear tu cuenta" : "entrar";
  return `Usa este código de 6 dígitos para ${action}: ${code}\n\nCaduca en 10 minutos. Si no lo has pedido, ignora este correo.`;
}

function htmlBody(purpose: AuthPurpose, code: string): string {
  const action = purpose === "register" ? "crear tu cuenta" : "entrar al centro de operaciones";
  return `<p>Usa este código para ${action}:</p><p style="font-size:28px;letter-spacing:8px;font-weight:700;font-family:ui-monospace,monospace">${code}</p><p>Caduca en 10 minutos. Si no lo has pedido, ignora este correo.</p>`;
}

export function createAuthMailer(options: {
  resendApiKey?: string;
  mailFrom: string;
  fetchFn?: typeof fetch;
}): SendAuthEmail {
  return async ({ to, code, purpose }) => {
    if (!options.resendApiKey) {
      console.log(`[auth] código para ${to} (${purpose}): ${code}`);
      return;
    }
    const fetchFn = options.fetchFn ?? fetch;
    const response = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: options.mailFrom,
        to: [to],
        subject: subject(purpose, code),
        text: textBody(purpose, code),
        html: htmlBody(purpose, code),
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`No se pudo enviar el correo (${response.status})${detail ? `: ${detail.slice(0, 180)}` : ""}`);
    }
  };
}
