import { pathToFileURL } from "node:url";

const PREDEFINED_REQUEST_EVENT_ID = "b329e750-2e0e-4618-ba65-e04bb6a93c5f";
const WEBHOOK_POST_EVENT_ID = "01926f2b-2973-7ebf-ada1-e984251e27ec";
const WORKFLOW_NAME = "Demo Incident Inputs";

type FetchFn = typeof fetch;

type TriggerNode = { id: string; persistent_id: string; name: string };

const variable = (groupId: string, variableId: string) => ({
  type: "variable",
  children: [{ text: "" }],
  group_id: groupId,
  variable_id: variableId,
});

const paragraph = (...children: Array<{ text: string } | ReturnType<typeof variable>>) => [{ type: "paragraph", children }];

const tokenOf = (persistentId: string, field: string) => `{{$var:${persistentId}.${field}}}`;

export function createWorkflowBody(webhookToken: string, sampleBackendBaseUrl: string) {
  return {
    name: WORKFLOW_NAME,
    icon: "bolt",
    variables: [{
      key: "HAPPYROBOT_DEMO_WEBHOOK_TOKEN",
      value_production: "",
      value_staging: "",
      value_development: webhookToken,
      is_hidden_in_ui: true,
    }],
    version: {
      name: "v1",
      description: "Pasarela determinista de inputs de demo (llamada y SMS) hacia el backend",
      nodes: [{
        type: "trigger",
        event_id: PREDEFINED_REQUEST_EVENT_ID,
        name: "Demo incident request",
        configuration: { params: ["eventId", "channel", "actor", "incidentId", "summary", "sessionId", "backend_base_url"] },
        webhook_payload: {
          eventId: "demo-event",
          channel: "call",
          actor: "Responsable de recinto",
          incidentId: "principal_pipe_burst",
          summary: "Incidente de prueba",
          sessionId: "demo-session",
          backend_base_url: sampleBackendBaseUrl,
        },
      }],
    },
    skip_test_all: true,
  };
}

export function createWebhookNode(trigger: TriggerNode) {
  const field = (name: string) => tokenOf(trigger.persistent_id, name);
  return {
    type: "action",
    event_id: WEBHOOK_POST_EVENT_ID,
    name: "POST incidente al centro de operaciones",
    parent_node_id: trigger.id,
    configuration: {
      url: paragraph({ text: "" }, variable(trigger.persistent_id, "backend_base_url"), { text: "/workflow/happyrobot/events" }),
      body: {
        raw: JSON.stringify({
          eventId: field("eventId"),
          channel: field("channel"),
          actor: field("actor"),
          incidentId: field("incidentId"),
          summary: field("summary"),
          evidence: { sessionId: field("sessionId") },
        }, null, 2),
        contentType: "application/json",
        schemaVersion: 2,
      },
      mtls: null,
      token: paragraph({ text: "" }, variable("use_case_variables", "HAPPYROBOT_DEMO_WEBHOOK_TOKEN"), { text: "" }),
      params: [],
      headers: [],
      authType: "bearer",
      ignore5XX: false,
      contentType: "application/json",
      xssProtection: true,
      responseHeaders: [],
      webhookSchemaVersion: 2,
    },
    webhook_payload: { ok: true, duplicate: false, eventId: "demo-event", incidentId: "principal_pipe_burst", planVersion: 2 },
  };
}

function required(value: string | undefined, name: string): string {
  const parsed = value?.trim();
  if (!parsed) throw new Error(`Falta ${name}`);
  return parsed;
}

async function request<T>(fetchFn: FetchFn, url: string, apiKey: string, init?: RequestInit): Promise<T> {
  const response = await fetchFn(url, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) as Record<string, unknown> : {};
  if (!response.ok) {
    const message = response.status === 403 ? "La API key no puede crear workflows; usa una key de owner o créalo desde la UI" : `${response.status} ${response.statusText}: ${text}`;
    throw new Error(message);
  }
  return body as T;
}

export async function setupHappyRobotDemoInputs(fetchFn: FetchFn = fetch): Promise<void> {
  const apiBase = (process.env.HAPPYROBOT_DEMO_INPUT_API_BASE?.trim() || "https://platform.eu.happyrobot.ai/api/v2").replace(/\/+$/, "");
  const apiKey = required(process.env.HAPPYROBOT_API_KEY, "HAPPYROBOT_API_KEY");
  const webhookToken = required(process.env.HAPPYROBOT_WEBHOOK_TOKEN, "HAPPYROBOT_WEBHOOK_TOKEN");
  const sampleBackendBaseUrl = process.env.PUBLIC_BASE_URL?.trim() || "https://example.test";
  const publish = process.argv.includes("--publish");
  const workflows = await request<{ data?: Array<{ id: string; name: string; slug: string; latest_version?: { id?: string } }> }>(fetchFn, `${apiBase}/workflows/?page_size=100`, apiKey);
  const existing = workflows.data?.find((workflow) => workflow.name === WORKFLOW_NAME);
  if (existing) {
    console.log(`Workflow ya existe: ${existing.slug} (${existing.id}). No se modifica.`);
    return;
  }

  const created = await request<{ id: string; slug: string; latest_version?: { id?: string } }>(fetchFn, `${apiBase}/workflows/`, apiKey, {
    method: "POST",
    body: JSON.stringify(createWorkflowBody(webhookToken, sampleBackendBaseUrl)),
  });
  const versionId = required(created.latest_version?.id, "latest_version.id devuelto por HappyRobot");
  const listed = await request<{ data?: TriggerNode[] }>(fetchFn, `${apiBase}/versions/${versionId}/nodes`, apiKey);
  const trigger = listed.data?.find((node) => node.name === "Demo incident request");
  if (!trigger) throw new Error("HappyRobot no devolvió el trigger recién creado");
  await request(fetchFn, `${apiBase}/versions/${versionId}/nodes`, apiKey, {
    method: "POST",
    body: JSON.stringify({ nodes: [createWebhookNode(trigger)], skip_test_all: true }),
  });

  if (publish) {
    if (sampleBackendBaseUrl === "https://example.test") throw new Error("PUBLIC_BASE_URL es obligatorio para --publish");
    await request(fetchFn, `${apiBase}/workflows/${created.id}/publish`, apiKey, {
      method: "POST",
      body: JSON.stringify({ environment: "development" }),
    });
  }
  console.log(`Workflow creado: ${created.slug} (${created.id})${publish ? " y publicado en development" : "; publícalo en development cuando el backend sea público"}.`);
  console.log(`HAPPYROBOT_DEMO_INPUT_WORKFLOW_ID=${created.id}`);
}

// En Windows argv[1] llega con barras invertidas y `file://${argv[1]}` nunca casa con
// import.meta.url: el instalador terminaba en silencio con código 0, aparentando éxito.
const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  setupHappyRobotDemoInputs().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
