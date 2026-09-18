// Único punto del coordinador que habla con un proveedor externo.
// Sin SDK: solo fetch, para no añadir dependencias al backend.

const TIMEOUT_MS = 45_000;

const DEFAULT_MODELS = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
} as const;

export type Provider = keyof typeof DEFAULT_MODELS;

export interface LlmConfig {
  provider: Provider;
  apiKey: string;
  model: string;
}

export function loadLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig {
  const openai = env.OPENAI_API_KEY?.trim();
  const anthropic = env.ANTHROPIC_API_KEY?.trim();
  const model = env.COORDINATOR_MODEL?.trim();

  if (openai) {
    return { provider: "openai", apiKey: openai, model: model || DEFAULT_MODELS.openai };
  }
  if (anthropic) {
    return { provider: "anthropic", apiKey: anthropic, model: model || DEFAULT_MODELS.anthropic };
  }

  throw new Error(
    "Falta OPENAI_API_KEY o ANTHROPIC_API_KEY en .env. Opcional: COORDINATOR_MODEL para elegir modelo.",
  );
}

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  }

  return response.json();
}

export async function complete(config: LlmConfig, system: string, user: string): Promise<string> {
  if (config.provider === "openai") {
    const data = (await post(
      "https://api.openai.com/v1/chat/completions",
      { Authorization: `Bearer ${config.apiKey}` },
      {
        model: config.model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      },
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
  )) as { content?: { type?: string; text?: string }[] };

  const block = data.content?.find((item) => item.type === "text");
  if (typeof block?.text !== "string") throw new Error("respuesta de Anthropic sin contenido");
  return block.text;
}
