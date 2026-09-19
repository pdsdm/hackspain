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

test("Supabase needs URL and service role together", () => {
  assert.throws(
    () => loadConfig({ SUPABASE_URL: "https://vdekfueryshivtdkbbti.supabase.co" }),
    /SUPABASE_SERVICE_ROLE_KEY/,
  );
  assert.throws(
    () => loadConfig({ SUPABASE_SERVICE_ROLE_KEY: "service-role" }),
    /SUPABASE_URL/,
  );
  const config = loadConfig({
    SUPABASE_URL: "https://vdekfueryshivtdkbbti.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
  });
  assert.equal(config.supabaseUrl, "https://vdekfueryshivtdkbbti.supabase.co");
  assert.equal(config.supabaseServiceRoleKey, "service-role");
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
