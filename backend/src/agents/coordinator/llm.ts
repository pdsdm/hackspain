// Único punto del coordinador que habla con un proveedor externo.
// Sin SDK: solo fetch. Cognition/Devin es el proveedor por defecto (D12).

import { logCoord } from "../../log.js";

const TIMEOUT_MS = 120_000;

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
  reasoningEffort?: string;
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
  const reasoningEffort = env.COORDINATOR_REASONING_EFFORT?.trim() || undefined;

  // Una OPENAI_API_KEY suelta en el entorno del sistema (no en .env: `--env-file` de Node
  // NO sobreescribe lo que ya existe) ganaba a HELMCODE_API_KEY y mandaba la clave de
  // OpenAI a api.helmcode.com. El proveedor respondía 401 «Invalid API key», el coordinador
  // se marcaba caído y el Modo vivo quedaba mudo: media demo apagada por una variable de
  // entorno ajena. Si la base apunta a otro proveedor y tenemos su clave, esa manda.
  const baseHost = (() => {
    if (!openaiBase) return "";
    try {
      return new URL(openaiBase).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  const baseBelongsTo = (provider: keyof typeof DEFAULT_BASE_URLS): boolean =>
    baseHost !== "" && baseHost === new URL(DEFAULT_BASE_URLS[provider]).hostname;
  const openaiUsable = Boolean(openai) && !(helmcode && baseBelongsTo("helmcode"));

  const withHarness = (config: Omit<LlmConfig, "harness">): LlmConfig => {
    const harness = readHarness(env.COORDINATOR_HARNESS, config.provider);
    if (harness === "devin" && !orgId) {
      throw new Error("COORDINATOR_HARNESS=devin requiere DEVIN_ORG_ID (Settings → Service Users).");
    }
    return { ...config, harness, ...(orgId ? { orgId } : {}), ...(reasoningEffort ? { reasoningEffort } : {}) };
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
  const response = await postRaw(url, headers, body, signal);
  return response.json();
}

async function postRaw(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal?: AbortSignal,
): Promise<Response> {
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

  return response;
}

export function llmVerbose(): boolean {
  const value = process.env.COORDINATOR_VERBOSE?.trim().toLowerCase();
  if (value === "0" || value === "false" || value === "off") return false;
  return true;
}

function deltaText(delta: Record<string, unknown> | undefined, key: string): string {
  const value = delta?.[key];
  return typeof value === "string" ? value : "";
}

export function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  for (let end = text.lastIndexOf("}"); end > start; end -= 1) {
    if (text[end] !== "}") continue;
    const slice = text.slice(start, end + 1);
    try {
      JSON.parse(slice);
      return slice;
    } catch {
      continue;
    }
  }
  return null;
}

function pickChatContent(content: string | null | undefined, reasoning?: string | null): string | null {
  if (typeof content === "string" && content.trim().length > 0) return content;
  if (typeof reasoning === "string") {
    const salvaged = extractJsonObject(reasoning);
    if (salvaged) return salvaged;
  }
  return typeof content === "string" && content.length > 0 ? content : null;
}

function isAbortLike(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function thinkingFields(config: LlmConfig): Record<string, unknown> {
  const effort = config.reasoningEffort?.trim().toLowerCase();
  if (!effort) return {};
  if (effort === "none") {
    return { reasoning_effort: "none", thinking: { type: "disabled" } };
  }
  return { reasoning_effort: effort, thinking: { type: "enabled" } };
}

export function takeSseDataEvents(buffer: string): { payloads: string[]; rest: string } {
  const payloads: string[] = [];
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    payloads.push(trimmed.slice(5).trim());
  }
  return { payloads, rest };
}

class TokenPrinter {
  private buffer = "";
  private opened = false;

  constructor(private readonly label: string) {}

  push(chunk: string): void {
    if (!chunk) return;
    if (!this.opened) {
      logCoord(`${this.label} ---`);
      this.opened = true;
    }
    this.buffer += chunk;
    while (this.buffer.includes("\n") || this.buffer.length >= 160) {
      const newline = this.buffer.indexOf("\n");
      const take = newline >= 0 && newline < 160 ? newline + 1 : 160;
      process.stdout.write(`[coord] ${this.label} ${this.buffer.slice(0, take)}`);
      if (!this.buffer.slice(0, take).endsWith("\n")) process.stdout.write("\n");
      this.buffer = this.buffer.slice(take);
    }
  }

  flush(): void {
    if (this.buffer.length > 0) {
      process.stdout.write(`[coord] ${this.label} ${this.buffer}\n`);
      this.buffer = "";
    }
    if (this.opened) logCoord(`${this.label} fin`);
  }
}

async function readChatStream(response: Response, verbose: boolean): Promise<ChatResult & { usage?: unknown }> {
  if (!response.body) throw new Error("respuesta stream sin body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let rest = "";
  let content = "";
  let reasoning = "";
  const toolChunks: unknown[] = [];
  let usage: unknown;
  const thinkOut = verbose ? new TokenPrinter("think") : undefined;
  const answerOut = verbose ? new TokenPrinter("answer") : undefined;

  const applyPayload = (payload: string): boolean => {
    if (payload === "[DONE]") return false;
    const data = JSON.parse(payload) as {
      usage?: unknown;
      choices?: { delta?: Record<string, unknown>; message?: Record<string, unknown> }[];
    };
    if (data.usage !== undefined) usage = data.usage;
    const choice = data.choices?.[0];
    const delta = choice?.delta ?? choice?.message;
    const think = deltaText(delta, "reasoning_content") || deltaText(delta, "reasoning");
    const text = deltaText(delta, "content");
    if (think) {
      reasoning += think;
      thinkOut?.push(think);
    }
    if (text) {
      content += text;
      answerOut?.push(text);
    }
    const calls = delta?.tool_calls;
    if (Array.isArray(calls)) toolChunks.push(...calls);
    return true;
  };

  const finish = (salvaged: boolean): ChatResult & { usage?: unknown } => {
    thinkOut?.flush();
    answerOut?.flush();
    const picked = pickChatContent(content.length > 0 ? content : null, reasoning);
    if (verbose) {
      logCoord("think total", `${reasoning.length}c`);
      if (salvaged && picked) logCoord("aviso", "JSON recuperado del thinking tras corte");
    }
    return {
      content: picked,
      tool_calls: asToolCalls(toolChunks),
      usage,
    };
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      rest += decoder.decode(value, { stream: true });
      const taken = takeSseDataEvents(rest);
      rest = taken.rest;
      for (const payload of taken.payloads) {
        if (!applyPayload(payload)) return finish(false);
      }
    }
    return finish(false);
  } catch (error) {
    const picked = pickChatContent(content.length > 0 ? content : null, reasoning);
    if (isAbortLike(error) && picked) return finish(true);
    thinkOut?.flush();
    answerOut?.flush();
    throw error;
  }
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

  const verbose = llmVerbose();
  const temperature = options.temperature ?? 0.3;
  const useTools = Boolean(options.tools && options.tools.length > 0);
  const stream = verbose && !useTools;
  const body = {
    model: config.model,
    temperature,
    ...thinkingFields(config),
    ...(options.nonce === undefined ? {} : { user: options.nonce }),
    ...(config.jsonObject && !useTools ? { response_format: { type: "json_object" } } : {}),
    ...(useTools ? { tools: options.tools, tool_choice: "auto" as const } : {}),
    ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
    messages,
  };

  if (verbose) {
    const chars = messages.reduce((sum, message) => sum + (message.content?.length ?? 0), 0);
    logCoord(
      "llm",
      config.provider,
      config.model,
      stream ? "stream" : "bloque",
      config.reasoningEffort ? `effort=${config.reasoningEffort}` : "effort=default",
      `${chars}c prompt`,
    );
    if (config.provider === "helmcode" && config.model.includes("deepseek")) {
      const effort = config.reasoningEffort ?? "default";
      logCoord("aviso", `deepseek thinking=${effort === "none" ? "disabled" : "enabled"} effort=${effort}`);
    }
  }

  const started = Date.now();
  const heartbeat = verbose
    ? setInterval(() => {
        logCoord("llm esperando", `${Math.round((Date.now() - started) / 1000)}s`, config.model);
      }, 5_000)
    : undefined;

  try {
    if (stream) {
      const response = await postRaw(
        `${config.baseUrl}/chat/completions`,
        { Authorization: `Bearer ${config.apiKey}` },
        body,
        options.signal,
      );
      const result = await readChatStream(response, verbose);
      if (verbose) {
        logCoord(
          "llm listo",
          `${Math.round((Date.now() - started) / 1000)}s`,
          `answer ${result.content?.length ?? 0}c`,
          result.usage ?? "sin usage",
        );
      }
      return { content: result.content, tool_calls: result.tool_calls };
    }

    const data = (await post(
      `${config.baseUrl}/chat/completions`,
      { Authorization: `Bearer ${config.apiKey}` },
      body,
      options.signal,
    )) as {
      usage?: unknown;
      choices?: {
        message?: {
          content?: string | null;
          reasoning_content?: string | null;
          tool_calls?: unknown;
        };
      }[];
    };

    const message = data.choices?.[0]?.message;
    if (verbose && message?.reasoning_content) {
      logCoord("think ---");
      for (const line of message.reasoning_content.split("\n")) logCoord("think", line);
      logCoord("think fin");
    }
    if (verbose) {
      logCoord(
        "llm listo",
        `${Math.round((Date.now() - started) / 1000)}s`,
        `answer ${typeof message?.content === "string" ? message.content.length : 0}c`,
        data.usage ?? "sin usage",
      );
      if (typeof message?.content === "string" && message.content.length > 0) {
        logCoord("answer", message.content);
      }
    }
    const content = pickChatContent(message?.content, message?.reasoning_content);
    if (verbose && content && (!message?.content || message.content.trim().length === 0)) {
      logCoord("aviso", "JSON recuperado del thinking (content vacío)");
    }
    return {
      content,
      tool_calls: asToolCalls(message?.tool_calls),
    };
  } finally {
    if (heartbeat) clearInterval(heartbeat);
  }
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
