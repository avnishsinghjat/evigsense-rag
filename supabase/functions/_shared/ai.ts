/**
 * Shared LM Studio client (OpenAI-compatible API).
 * All edge functions import from here instead of calling OpenRouter directly.
 */

export function getLmStudioBaseUrl(): string {
  return Deno.env.get("LMSTUDIO_BASE_URL") ?? "http://host.docker.internal:1234/v1";
}

export function getLmStudioApiKey(): string {
  return Deno.env.get("LMSTUDIO_API_KEY") ?? "lm-studio";
}

export function getChatModel(): string {
  return Deno.env.get("LMSTUDIO_CHAT_MODEL") ?? "local-chat";
}

export function getEmbedModel(): string {
  return Deno.env.get("LMSTUDIO_EMBED_MODEL") ?? "bge-m3";
}

export function getEmbeddingDim(): number {
  const dim = parseInt(Deno.env.get("EMBEDDING_DIM") ?? "1024", 10);
  return Number.isFinite(dim) ? dim : 1024;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: string };
  signal?: AbortSignal;
  /** OpenAI-compatible: "low" | "medium" | "high". Forwarded as-is to LM Studio. */
  reasoning_effort?: "low" | "medium" | "high";
  /** Extra body params to pass through to LM Studio (e.g. backend-specific knobs). */
  extra?: Record<string, unknown>;
}

export async function chat(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<Response> {
  const base = getLmStudioBaseUrl();
  const body: Record<string, unknown> = {
    model: options.model ?? getChatModel(),
    messages,
  };
  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.max_tokens !== undefined) body.max_tokens = options.max_tokens;
  if (options.response_format) body.response_format = options.response_format;
  if (options.reasoning_effort) body.reasoning_effort = options.reasoning_effort;
  if (options.extra) Object.assign(body, options.extra);

  return fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getLmStudioApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });
}

export async function chatCompletionText(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<string> {
  const res = await chat(messages, options);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LM Studio chat failed (${res.status}): ${err}`);
  }
  const data = await res.json();
  const choice = data?.choices?.[0];
  const message = choice?.message ?? {};
  const content: string = typeof message.content === "string" ? message.content : "";
  const finishReason: string | undefined = choice?.finish_reason;
  const usage = data?.usage ?? {};
  const completionTokens: number | undefined = usage.completion_tokens;
  const reasoningTokens: number | undefined = usage.completion_tokens_details?.reasoning_tokens;

  if (content.trim().length > 0) return content;

  // Some reasoning models (e.g. chandra-ocr-2 in LM Studio's "thinking" mode)
  // emit the actual answer into `reasoning_content` and leave `content` blank,
  // especially when the token budget is too small. Fall back to it if it looks
  // like a useful payload rather than throwing.
  const reasoningContent: string =
    typeof message.reasoning_content === "string" ? message.reasoning_content : "";
  if (reasoningContent.trim().length > 0) {
    console.warn(
      `[ai] LM Studio returned empty content; falling back to reasoning_content ` +
        `(finish_reason=${finishReason ?? "?"}, completion_tokens=${completionTokens ?? "?"}, ` +
        `reasoning_tokens=${reasoningTokens ?? "?"}). Consider raising max_tokens or ` +
        `using a non-reasoning OCR model.`,
    );
    return reasoningContent;
  }

  throw new Error(
    `LM Studio returned empty chat response (finish_reason=${finishReason ?? "?"}, ` +
      `completion_tokens=${completionTokens ?? "?"}, reasoning_tokens=${reasoningTokens ?? "?"}). ` +
      `If using a reasoning model, raise max_tokens or set a non-reasoning model.`,
  );
}

export async function embed(input: string, retries = 3): Promise<number[]> {
  const base = getLmStudioBaseUrl();
  const expectedDim = getEmbeddingDim();

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(`${base}/embeddings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getLmStudioApiKey()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: getEmbedModel(),
          input,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        if ((response.status === 429 || response.status >= 500) && attempt < retries) {
          await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
          continue;
        }
        throw new Error(`Embedding failed: ${response.status} - ${error}`);
      }

      const data = await response.json();
      const vector = data?.data?.[0]?.embedding;
      if (!Array.isArray(vector)) {
        throw new Error("Invalid embedding response structure");
      }
      if (vector.length !== expectedDim) {
        console.warn(
          `[ai] Embedding dim ${vector.length} != EMBEDDING_DIM ${expectedDim}. Update DB migration if intentional.`,
        );
      }
      return vector;
    } catch (error) {
      if (attempt === retries) throw error;
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }

  throw new Error("Failed to generate embedding after retries");
}

export async function transcribeAudio(
  base64Audio: string,
  mimeType: string,
): Promise<string> {
  const backend = Deno.env.get("AUDIO_BACKEND") ?? "disabled";

  if (backend === "disabled") {
    throw new Error(
      "Audio transcription is disabled (AUDIO_BACKEND=disabled). " +
        "Load a Whisper model in LM Studio and set AUDIO_BACKEND=whisper.",
    );
  }

  if (backend === "whisper") {
    const whisperBase = (Deno.env.get("WHISPER_BASE_URL") ?? getLmStudioBaseUrl()).replace(/\/v1\/?$/, "");
    const model = Deno.env.get("WHISPER_MODEL") ?? "whisper-1";

    const binary = Uint8Array.from(atob(base64Audio), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append("file", new Blob([binary], { type: mimeType }), "audio.bin");
    form.append("model", model);

    const res = await fetch(`${whisperBase}/v1/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getLmStudioApiKey()}` },
      body: form,
    });

    if (!res.ok) {
      throw new Error(`Whisper transcription failed (${res.status}): ${await res.text()}`);
    }

    const data = await res.json();
    const text = data?.text?.trim();
    if (!text) throw new Error("Whisper returned empty transcription");
    return text;
  }

  throw new Error(`Unknown AUDIO_BACKEND: ${backend}`);
}
