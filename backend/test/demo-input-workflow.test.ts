import assert from "node:assert/strict";
import test from "node:test";

import { createWebhookNode, createWorkflowBody } from "../../scripts/setup-happyrobot-demo-inputs.mts";

test("demo input workflow keeps the bearer in a hidden variable and forwards the strict T46 body", () => {
  const workflow = createWorkflowBody("secret-token", "https://backend.example");
  assert.equal(workflow.variables[0]?.is_hidden_in_ui, true);
  assert.equal(workflow.variables[0]?.value_development, "secret-token");
  assert.deepEqual(workflow.version.nodes[0]?.configuration.params, ["eventId", "channel", "actor", "incidentId", "summary", "sessionId", "backend_base_url"]);

  const action = createWebhookNode({ id: "00000000-0000-0000-0000-000000000001", persistent_id: "trigger-group", name: "Demo incident request" });
  assert.equal(action.configuration.authType, "bearer");
  assert.equal(action.configuration.token[0]?.children[1] && "group_id" in action.configuration.token[0].children[1] ? action.configuration.token[0].children[1].group_id : undefined, "use_case_variables");
  assert.match(action.configuration.body.raw, /"evidence"/);
  assert.match(action.configuration.body.raw, /\{\{\$var:trigger-group\.incidentId\}\}/);
  assert.doesNotMatch(action.configuration.body.raw, /secret-token/);
});
