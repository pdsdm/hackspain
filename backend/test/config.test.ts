import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig } from "../src/config.js";

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

test("a real HappyRobot hook requires a test destination", () => {
  assert.throws(
    () => loadConfig({
      HAPPYROBOT_API_KEY: "key",
      HAPPYROBOT_HOOK_ESPACIOS: "https://hook.test/espacios",
    }),
    /HAPPYROBOT_TEST_PHONE/,
  );
});

test("un hook por defecto da canal a las cuatro áreas, y el específico manda", () => {
  const hooks = loadConfig({
    HAPPYROBOT_API_KEY: "key",
    HAPPYROBOT_TEST_PHONE: "+34600000000",
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

test("HAPPYROBOT_ENDPOINT sirve de hook por defecto para no dejar áreas sin canal", () => {
  const hooks = loadConfig({
    HAPPYROBOT_API_KEY: "key",
    HAPPYROBOT_TEST_PHONE: "+34600000000",
    HAPPYROBOT_ENDPOINT: "https://hook.test/unico",
  }).hooks;
  assert.deepEqual(Object.keys(hooks).sort(), ["asistentes", "catering", "espacios", "transporte"]);
  assert.equal(hooks.asistentes, "https://hook.test/unico");
});

test("Railway deployment id is optional and trimmed", () => {
  assert.equal(loadConfig({ RAILWAY_DEPLOYMENT_ID: " deploy-42 " }).deploymentId, "deploy-42");
  assert.equal(loadConfig({}).deploymentId, undefined);
});
