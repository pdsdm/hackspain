import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { openDatabase } from "../src/state/database.js";

async function withAuthServer(
  run: (base: string, inbox: Array<{ to: string; code: string; purpose: string }>) => Promise<void>,
  extra: Record<string, string> = {},
): Promise<void> {
  const database = openDatabase(":memory:");
  const inbox: Array<{ to: string; code: string; purpose: string }> = [];
  const config = {
    ...loadConfig({ AUTH_SECRET: "unit-test-secret", ...extra }),
    coordinatorMode: "rules" as const,
  };
  const server = createApp(database, {
    workflowToken: undefined,
    config,
    sendAuthEmail: async (input) => {
      inbox.push(input);
    },
  }).listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address !== "string");
    await run(`http://127.0.0.1:${address.port}`, inbox);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    database.close();
  }
}

function post(base: string, path: string, body: unknown, token?: string): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

test("createApp sin auth deja el panel abierto y /auth/config lo dice", async () => {
  const database = openDatabase(":memory:");
  const server = createApp(database).listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const config = await (await fetch(`${base}/auth/config`)).json();
    assert.deepEqual(config, { required: false });
    assert.equal((await fetch(`${base}/state`)).status, 200);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    database.close();
  }
});

test("register envía un código de 6 dígitos y verify abre sesión", async () => {
  await withAuthServer(async (base, inbox) => {
    assert.deepEqual(await (await fetch(`${base}/auth/config`)).json(), { required: true });
    assert.equal((await fetch(`${base}/state`)).status, 401);

    const asked = await post(base, "/auth/request-code", { email: "Ana@Zhivel.test", purpose: "register" });
    assert.equal(asked.status, 200);
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal(inbox.length, 1);
    assert.equal(inbox[0]?.to, "ana@zhivel.test");
    assert.match(inbox[0]?.code ?? "", /^\d{6}$/);

    const loginTooSoon = await post(base, "/auth/request-code", { email: "ana@zhivel.test", purpose: "login" });
    assert.equal(loginTooSoon.status, 404);

    const verified = await post(base, "/auth/verify", { email: "ana@zhivel.test", code: inbox[0]?.code });
    assert.equal(verified.status, 200);
    const session = (await verified.json()) as { token: string; user: { email: string } };
    assert.equal(session.user.email, "ana@zhivel.test");
    assert.ok(session.token);

    const state = await fetch(`${base}/state`, { headers: { Authorization: `Bearer ${session.token}` } });
    assert.equal(state.status, 200);

    const me = await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${session.token}` } });
    assert.equal(me.status, 200);
    assert.deepEqual((await me.json() as { user: { email: string } }).user.email, "ana@zhivel.test");
  });
});

test("login pide código solo si la cuenta existe, y un código malo no entra", async () => {
  await withAuthServer(async (base, inbox) => {
    assert.equal((await post(base, "/auth/request-code", { email: "nadie@zhivel.test", purpose: "login" })).status, 404);

    await post(base, "/auth/request-code", { email: "eva@zhivel.test", purpose: "register" });
    const created = await post(base, "/auth/verify", { email: "eva@zhivel.test", code: inbox[0]?.code });
    assert.equal(created.status, 200);

    const again = await post(base, "/auth/request-code", { email: "eva@zhivel.test", purpose: "register" });
    assert.equal(again.status, 409);

    inbox.length = 0;
    const login = await post(base, "/auth/request-code", { email: "eva@zhivel.test", purpose: "login" });
    assert.equal(login.status, 200);
    assert.equal(inbox.length, 1);

    const actual = inbox[0]?.code ?? "";
    const wrongCode = actual === "000000" ? "000001" : "000000";
    const wrong = await post(base, "/auth/verify", { email: "eva@zhivel.test", code: wrongCode });
    assert.equal(wrong.status, 401);
    assert.equal((await fetch(`${base}/state`)).status, 401);

    const ok = await post(base, "/auth/verify", { email: "eva@zhivel.test", code: inbox[0]?.code });
    assert.equal(ok.status, 200);
    const token = ((await ok.json()) as { token: string }).token;
    assert.equal((await fetch(`${base}/state`, { headers: { Authorization: `Bearer ${token}` } })).status, 200);

    await post(base, "/auth/logout", {}, token);
    assert.equal((await fetch(`${base}/state`, { headers: { Authorization: `Bearer ${token}` } })).status, 401);
  });
});

test("AUTH_DEV_ECHO devuelve el código en la respuesta cuando no hay correo real", async () => {
  await withAuthServer(async (base) => {
    const asked = await post(base, "/auth/request-code", { email: "eco@zhivel.test", purpose: "register" });
    const body = (await asked.json()) as { code?: string };
    assert.equal(asked.status, 200);
    assert.match(body.code ?? "", /^\d{6}$/);
  }, { AUTH_DEV_ECHO: "true" });
});
