/** The one place that talks to Anthropic's Messages API. Uses plain fetch (no SDK) and takes the fetch function as a
 *  parameter, so tests can answer without the network. The API key never leaves the server. */

export type AiImage = { mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string };

export type ClaudeReply = { text: string; inputTokens: number; outputTokens: number };

/** The AI service couldn't be reached or refused. The message is safe to log; it never holds the key or a photo. */
export class AiUnavailableError extends Error {}

const ENDPOINT = "https://api.anthropic.com/v1/messages";

export async function askClaude(
  input: { apiKey: string; model: string; prompt: string; images: AiImage[] },
  fetchImpl: typeof fetch = fetch,
): Promise<ClaudeReply> {
  let res: Response;
  try {
    res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": input.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: input.model,
        // Room for a little thinking as well as the short reply: thinking tokens count towards this, but are only billed when used.
        max_tokens: 1000,
        // Reading a tag doesn't need deep reasoning; low effort is faster and cheaper (Haiku 5.5 defaults to medium).
        output_config: { effort: "low" },
        messages: [
          {
            role: "user",
            content: [
              ...input.images.map((i) => ({ type: "image", source: { type: "base64", media_type: i.mediaType, data: i.base64 } })),
              { type: "text", text: input.prompt },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch (e) {
    throw new AiUnavailableError(e instanceof Error && e.name === "TimeoutError" ? "AI request timed out" : "AI request failed to send");
  }
  if (!res.ok) throw new AiUnavailableError(`AI service answered ${res.status}`);

  const json = (await res.json().catch(() => null)) as {
    content?: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  } | null;
  if (!json || !Array.isArray(json.content)) throw new AiUnavailableError("AI service sent an unreadable reply");
  const text = json.content.filter((b) => b.type === "text" && typeof b.text === "string").map((b) => b.text).join("");
  return { text, inputTokens: json.usage?.input_tokens ?? 0, outputTokens: json.usage?.output_tokens ?? 0 };
}
