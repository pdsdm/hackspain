// Único punto del coordinador que habla con un proveedor externo.
// Sin SDK: solo fetch. Cognition/Devin es el proveedor por defecto (D12).

const TIMEOUT_MS = 90_000;

const DEFAULT_MODELS = {
  cognition: "swe-1.7",
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
  helmcode: "deepseek-v4-flash",
} as const;

const DEFAULT_BASE_URLS = {
  cognition: "https://api.cognition.ai/v1",
  openai: "https://api.openai.com/v1",
  helmcode: "https://api.helmcode.com/v1",
} as const;

export type Provider = keyof typeof DEFAULT_MODELS;
export type CoordinatorHarness = "tools" | "json" | "devin";

export interface LlmConfig {
  provider: Provider;
  apiKey: string;
  model: string;
  baseUrl: string;
  harness: CoordinatorHarness;
  jsonObject: boolean;
  orgId?: string;
  sessionApiUrl: string;
  devinMode: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ChatTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatResult {
  content: string | null;
  tool_calls: ToolCall[];
}

export type ChatFn = (
  config: LlmConfig,
  messages: ChatMessage[],
  options?: { temperature?: number; nonce?: string; signal?: AbortSignal; tools?: ChatTool[] },
) => Promise<ChatResult>;

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function cognitionKey(env: NodeJS.ProcessEnv): string | undefined {
  return env.COGNITION_API_KEY?.trim() || env.DEVIN_API_KEY?.trim();
}

function readHarness(value: string | undefined, provider: Provider): CoordinatorHarness {
  const harness = value?.trim();
  if (harness === "tools" || harness === "json" || harness === "devin") return harness;
  if (harness) throw new Error(`COORDINATOR_HARNESS must be tools, json or devin, received "${value}"`);
  return provider === "cognition" ? "tools" : "json";
}

export function loadLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig {
  const cognition = cognitionKey(env);
  const openai = env.OPENAI_API_KEY?.trim();
  const helmcode = env.HELMCODE_API_KEY?.trim();
  const anthropic = env.ANTHROPIC_API_KEY?.trim();
  const model = env.COORDINATOR_MODEL?.trim();
  const openaiBase = env.OPENAI_BASE_URL?.trim();
  const cognitionBase = env.COGNITION_API_BASE?.trim();
  const sessionApiUrl = trimSlash(env.DEVIN_API_BASE?.trim() || "https://api.devin.ai/v3");
  const orgId = env.DEVIN_ORG_ID?.trim() || env.COGNITION_ORG_ID?.trim();
  const jsonFlag = env.COORDINATOR_JSON_OBJECT?.trim();
  const jsonObject = jsonFlag === "1" || jsonFlag === "true";
  const devinMode = env.DEVIN_MODE?.trim() || "fast";

  const withHarness = (config: Omit<LlmConfig, "harness">): LlmConfig => {
    const harness = readHarness(env.COORDINATOR_HARNESS, config.provider);
    if (harness === "devin" && !orgId) {
      throw new Error("COORDINATOR_HARNESS=devin requiere DEVIN_ORG_ID (Settings → Service Users).");
    }
    return { ...config, harness, ...(orgId ? { orgId } : {}) };
  };

  if (cognition) {
    return withHarness({
      provider: "cognition",
      apiKey: cognition,
      model: model || DEFAULT_MODELS.cognition,
      baseUrl: trimSlash(cognitionBase || openaiBase || DEFAULT_BASE_URLS.cognition),
      jsonObject,
      sessionApiUrl,
      devinMode,
    });
  }
  if (openai) {
    return withHarness({
      provider: "openai",
      apiKey: openai,
      model: model || DEFAULT_MODELS.openai,
      baseUrl: trimSlash(openaiBase || DEFAULT_BASE_URLS.openai),
      jsonObject: jsonFlag === undefined || jsonFlag === "" ? true : jsonObject,
      sessionApiUrl,
      devinMode,
    });
  }
  if (helmcode) {
    return withHarness({
      provider: "helmcode",
      apiKey: helmcode,
      model: model || DEFAULT_MODELS.helmcode,
      baseUrl: trimSlash(openaiBase || DEFAULT_BASE_URLS.helmcode),
      jsonObject: jsonFlag === undefined || jsonFlag === "" ? true : jsonObject,
      sessionApiUrl,
      devinMode,
    });
  }
  if (anthropic) {
    return withHarness({
      provider: "anthropic",
      apiKey: anthropic,
      model: model || DEFAULT_MODELS.anthropic,
      baseUrl: "",
      jsonObject: false,
      sessionApiUrl,
      devinMode,
    });
  }

  throw new Error(
    "Falta COGNITION_API_KEY (o DEVIN_API_KEY), HELMCODE_API_KEY, OPENAI_API_KEY o ANTHROPIC_API_KEY. Opcional: COORDINATOR_MODEL, COGNITION_API_BASE, DEVIN_ORG_ID.",
  );
}

async function post(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([timeout, signal]) : timeout;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: combined,
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  }

  return response.json();
}

function asToolCalls(value: unknown): ToolCall[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const row = item as Record<string, unknown>;
    const fn = row.function;
    if (typeof fn !== "object" || fn === null) return [];
    const name = (fn as Record<string, unknown>).name;
    const args = (fn as Record<string, unknown>).arguments;
    if (typeof name !== "string") return [];
    return [
      {
        id: typeof row.id === "string" ? row.id : `call-${name}`,
        type: "function" as const,
        function: { name, arguments: typeof args === "string" ? args : JSON.stringify(args ?? {}) },
      },
    ];
  });
}

export async function chat(
  config: LlmConfig,
  messages: ChatMessage[],
  options: { temperature?: number; nonce?: string; signal?: AbortSignal; tools?: ChatTool[] } = {},
): Promise<ChatResult> {
  if (config.provider !== "openai" && config.provider !== "helmcode" && config.provider !== "cognition") {
    throw new Error(`chat() no soporta el proveedor ${config.provider}`);
  }

  const temperature = options.temperature ?? 0.3;
  const data = (await post(
    `${config.baseUrl}/chat/completions`,
    { Authorization: `Bearer ${config.apiKey}` },
    {
      model: config.model,
      temperature,
      ...(options.nonce === undefined ? {} : { user: options.nonce }),
      ...(config.jsonObject && !options.tools ? { response_format: { type: "json_object" } } : {}),
      ...(options.tools && options.tools.length > 0 ? { tools: options.tools, tool_choice: "auto" } : {}),
      messages,
    },
    options.signal,
  )) as { choices?: { message?: { content?: string | null; tool_calls?: unknown } }[] };

  const message = data.choices?.[0]?.message;
  const content = message?.content;
  return {
    content: typeof content === "string" ? content : null,
    tool_calls: asToolCalls(message?.tool_calls),
  };
}

export async function complete(
  config: LlmConfig,
  system: string,
  user: string,
  options: { temperature?: number; nonce?: string; signal?: AbortSignal } = {},
): Promise<string> {
  if (config.provider === "openai" || config.provider === "helmcode" || config.provider === "cognition") {
    const result = await chat(
      config,
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      options,
    );
    if (typeof result.content !== "string" || result.content.length === 0) {
      throw new Error("respuesta de chat sin contenido");
    }
    return result.content;
  }

  const data = (await post(
    "https://api.anthropic.com/v1/messages",
    { "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" },
    {
      model: config.model,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: user }],
    },
    options.signal,
  )) as { content?: { type?: string; text?: string }[] };

  const block = data.content?.find((item) => item.type === "text");
  if (typeof block?.text !== "string") throw new Error("respuesta de Anthropic sin contenido");
  return block.text;
}

export async function getJson(
  url: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([timeout, signal]) : timeout;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: combined,
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  }
  return response.json();
}
