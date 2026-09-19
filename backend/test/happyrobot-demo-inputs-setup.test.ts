import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { createWebhookNode, createWorkflowBody } from "../../scripts/setup-happyrobot-demo-inputs.mts";

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const script = resolve(here, "../../scripts/setup-happyrobot-demo-inputs.mts");

/**
 * El guard de entrada comparaba `file://${process.argv[1]}` con `import.meta.url`. En
 * Windows argv[1] llega con barras invertidas, nunca casaban y el instalador salía en
 * silencio con código 0: parecía haber funcionado sin haber hecho nada.
 */
test("ejecutado como script, el instalador arranca de verdad en cualquier plataforma", async () => {
  const failed = await run(process.execPath, ["--import", "tsx", script], {
    env: { ...process.env, HAPPYROBOT_API_KEY: "", HAPPYROBOT_WEBHOOK_TOKEN: "" },
  }).then(
    (result) => ({ code: 0, ...result }),
    (error: NodeJS.ErrnoException & { code?: number; stderr?: string; stdout?: string }) => ({
      code: typeof error.code === "number" ? error.code : 1,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
    }),
  );
  // Sin credenciales tiene que quejarse y salir con error, no terminar callado.
  assert.equal(failed.code, 1, `debía salir con código 1; stdout=${failed.stdout} stderr=${failed.stderr}`);
  assert.match(`${failed.stderr}${failed.stdout}`, /Falta HAPPYROBOT_API_KEY/);
});

test("el cuerpo del workflow declara los parámetros que T46 exige", () => {
  const body = createWorkflowBody("token-secreto", "https://backend.test");
  const trigger = body.version.nodes[0]!;
  assert.deepEqual(trigger.configuration.params, [
    "eventId", "channel", "actor", "incidentId", "summary", "sessionId", "backend_base_url",
  ]);
  const variable = body.variables[0]!;
  assert.equal(variable.is_hidden_in_ui, true, "el bearer no puede quedar visible en la UI");
  assert.equal(variable.value_development, "token-secreto");
  assert.equal(variable.value_production, "", "el token de demo no se propaga a producción");
});

test("el nodo de salida manda exactamente los seis campos de T46", () => {
  const node = createWebhookNode({ id: "n1", persistent_id: "p1", name: "Demo incident request" });
  const sent = JSON.parse(node.configuration.body.raw) as Record<string, unknown>;
  assert.deepEqual(Object.keys(sent).sort(), ["actor", "channel", "eventId", "evidence", "incidentId", "summary"]);
  assert.deepEqual(Object.keys(sent.evidence as Record<string, unknown>), ["sessionId"]);
  assert.equal(node.configuration.authType, "bearer");
});
