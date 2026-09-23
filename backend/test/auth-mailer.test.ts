import assert from "node:assert/strict";
import test from "node:test";

import { createAuthMailer, parseMailFrom } from "../src/auth/mailer.js";

test("parte el remitente en nombre y correo", () => {
  assert.deepEqual(parseMailFrom("Zhivel <ops@example.com>"), {
    name: "Zhivel",
    email: "ops@example.com",
  });
  assert.deepEqual(parseMailFrom("ops@example.com"), { name: "Zhivel", email: "ops@example.com" });
});

test("envía el código por la API de Brevo", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const send = createAuthMailer({
    brevoApiKey: "xkeysib-test",
    mailFrom: "Zhivel <ops@example.com>",
    fetchFn: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response("{}", { status: 201 });
    },
  });

  await send({ to: "ana@zhivel.test", code: "123456", purpose: "login" });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.brevo.com/v3/smtp/email");
  const headers = new Headers(calls[0].init?.headers);
  assert.equal(headers.get("api-key"), "xkeysib-test");
  const body = JSON.parse(String(calls[0].init?.body));
  assert.deepEqual(body.sender, { name: "Zhivel", email: "ops@example.com" });
  assert.deepEqual(body.to, [{ email: "ana@zhivel.test" }]);
  assert.match(body.subject, /123456/);
  assert.match(body.textContent, /123456/);
});

test("sin clave no llama a Brevo", async () => {
  let called = false;
  const send = createAuthMailer({
    mailFrom: "Zhivel <noreply@localhost>",
    fetchFn: async () => {
      called = true;
      return new Response("{}", { status: 201 });
    },
  });
  await send({ to: "ana@zhivel.test", code: "123456", purpose: "register" });
  assert.equal(called, false);
});
