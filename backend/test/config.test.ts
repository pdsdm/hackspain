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

test("HappyRobot hooks can start without a test destination", () => {
  const config = loadConfig({
    HAPPYROBOT_API_KEY: "key",
    HAPPYROBOT_HOOK_ESPACIOS: "https://hook.test/espacios",
  });
  assert.equal(config.happyrobotTestPhone, undefined);
  assert.equal(config.hooks.espacios, "https://hook.test/espacios");
});

test("Railway deployment id is optional and trimmed", () => {
  assert.equal(loadConfig({ RAILWAY_DEPLOYMENT_ID: " deploy-42 " }).deploymentId, "deploy-42");
  assert.equal(loadConfig({}).deploymentId, undefined);
});
