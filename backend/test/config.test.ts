import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_TEST_PHONE, loadConfig } from "../src/config.js";

test("HappyRobot test destination must use E.164", () => {
  assert.equal(
    loadConfig({ HAPPYROBOT_TEST_PHONE: "+34600000000" }).happyrobotTestPhone,
    "+34600000000",
  );
  assert.throws(
    () => loadConfig({ HAPPYROBOT_TEST_PHONE: "600 000 000" }),
    /HAPPYROBOT_TEST_PHONE/,
  );
});

test("siempre hay un destino: el teléfono del equipo por defecto, y el entorno lo sustituye", () => {
  // Sin esto, una llamada real podía salir sin número y el panel arrancaba con el campo vacío.
  assert.equal(loadConfig({}).happyrobotTestPhone, DEFAULT_TEST_PHONE);
  assert.equal(
    loadConfig({
      HAPPYROBOT_API_KEY: "key",
      HAPPYROBOT_HOOK_ESPACIOS: "https://hook.test/espacios",
    }).happyrobotTestPhone,
    DEFAULT_TEST_PHONE,
  );
  assert.equal(
    loadConfig({ HAPPYROBOT_TEST_PHONE: "+34699888777" }).happyrobotTestPhone,
    "+34699888777",
  );
});

test("un hook por defecto da canal a las cuatro áreas, y el específico manda", () => {
  const hooks = loadConfig({
    HAPPYROBOT_API_KEY: "key",
    HAPPYROBOT_HOOK_DEFAULT: "https://hook.test/todos",
    HAPPYROBOT_HOOK_ESPACIOS: "https://hook.test/espacios",
  }).hooks;
  assert.deepEqual(hooks, {
    espacios: "https://hook.test/espacios",
    catering: "https://hook.test/todos",
    transporte: "https://hook.test/todos",
    asistentes: "https://hook.test/todos",
  });
});

test("el hook por defecto es opt-in: sin él no se inventan canales reales", () => {
  // HAPPYROBOT_ENDPOINT existe en .env desde antes y no abre canales por su cuenta: activar
  // llamadas reales sin pedirlo llamaría a gente de verdad.
  assert.deepEqual(loadConfig({ HAPPYROBOT_ENDPOINT: "https://hook.test/unico" }).hooks, {});
  const hooks = loadConfig({
    HAPPYROBOT_API_KEY: "key",
    HAPPYROBOT_HOOK_DEFAULT: "https://hook.test/unico",
  }).hooks;
  assert.deepEqual(Object.keys(hooks).sort(), ["asistentes", "catering", "espacios", "transporte"]);
  assert.equal(hooks.asistentes, "https://hook.test/unico");
});

test("Railway deployment id is optional and trimmed", () => {
  assert.equal(loadConfig({ RAILWAY_DEPLOYMENT_ID: " deploy-42 " }).deploymentId, "deploy-42");
  assert.equal(loadConfig({}).deploymentId, undefined);
});

test("el panel exige sesión salvo AUTH_REQUIRED=false", () => {
  assert.equal(loadConfig({}).authEnabled, true);
  assert.equal(loadConfig({ AUTH_REQUIRED: "false" }).authEnabled, false);
  assert.equal(loadConfig({ AUTH_REQUIRED: "0" }).authEnabled, false);
  assert.equal(loadConfig({ AUTH_DEV_ECHO: "true" }).authDevEcho, true);
  assert.equal(loadConfig({ AUTH_DEV_ECHO: "true", RESEND_API_KEY: "re_test" }).authDevEcho, false);
});
