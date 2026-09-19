// Único punto del coordinador que habla con un proveedor externo.
// Sin SDK: solo fetch, para no añadir dependencias al backend.

const TIMEOUT_MS = 90_000;

const DEFAULT_MODELS = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
  helmcode: "deepseek-v4-flash",
} as const;

const DEFAULT_BASE_URLS = {
  openai: "https://api.openai.com/v1",
  helmcode: "https://api.helmcode.com/v1",
} as const;

export type Provider = keyof typeof DEFAULT_MODELS;

export interface LlmConfig {
  provider: Provider;
  apiKey: string;
  model: string;
  baseUrl: string;
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function loadLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig {
  const openai = env.OPENAI_API_KEY?.trim();
  const helmcode = env.HELMCODE_API_KEY?.trim();
  const anthropic = env.ANTHROPIC_API_KEY?.trim();
  const model = env.COORDINATOR_MODEL?.trim();
  const baseUrl = env.OPENAI_BASE_URL?.trim();

  if (openai) {
    return {
      provider: "openai",
      apiKey: openai,
      model: model || DEFAULT_MODELS.openai,
      baseUrl: trimSlash(baseUrl || DEFAULT_BASE_URLS.openai),
    };
  }
  if (helmcode) {
    return {
      provider: "helmcode",
      apiKey: helmcode,
      model: model || DEFAULT_MODELS.helmcode,
      baseUrl: trimSlash(baseUrl || DEFAULT_BASE_URLS.helmcode),
    };
  }
  if (anthropic) {
    return {
      provider: "anthropic",
      apiKey: anthropic,
      model: model || DEFAULT_MODELS.anthropic,
      baseUrl: "",
    };
  }

  throw new Error(
    "Falta HELMCODE_API_KEY, OPENAI_API_KEY o ANTHROPIC_API_KEY en .env. Opcional: COORDINATOR_MODEL y OPENAI_BASE_URL.",
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

export async function complete(
  config: LlmConfig,
  system: string,
  user: string,
  options: { temperature?: number; nonce?: string; signal?: AbortSignal } = {},
): Promise<string> {
  if (config.provider === "openai" || config.provider === "helmcode") {
    const temperature = options.temperature ?? 0.7;
    const data = (await post(
      `${config.baseUrl}/chat/completions`,
      { Authorization: `Bearer ${config.apiKey}` },
      {
        model: config.model,
        temperature,
        ...(options.nonce === undefined ? {} : { user: options.nonce }),
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      },
      options.signal,
    )) as { choices?: { message?: { content?: string } }[] };

    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("respuesta de OpenAI sin contenido");
    return content;
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
