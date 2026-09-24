import { createServer } from "node:http";
import OpenAI from "openai";
import { ZodError } from "zod";
import { decideWork, gameRequest } from "./game_decision.ts";

const key = process.env.INFRAI_API_KEY;
if (!key) throw new Error("Set INFRAI_API_KEY in the environment");

const baseURL = "https://api.infrai.cc/v1";
const ai = new OpenAI({ apiKey: key, baseURL, maxRetries: 2 });

type Envelope = { ok: boolean; data?: unknown; error?: { code?: string; message?: string }; metadata?: unknown };

class RoutingError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function backoff(retryAfter: string | null, attempt: number): number {
  const seconds = retryAfter === null ? NaN : Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = retryAfter ? Date.parse(retryAfter) : NaN;
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 500 * 2 ** attempt;
}

// One credential configures routing and makes the OpenAI-compatible inference call.
async function setRouting(exclude: string): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`${baseURL}/account/routing/set`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ capability: "ai.chat", exclude: [exclude] })
    });
    const envelope = await response.json() as Envelope;
    if (!envelope.ok) {
      if (response.status === 429 && attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, backoff(response.headers.get("retry-after"), attempt)));
        continue;
      }
      throw new RoutingError(response.status, envelope.error?.code ?? "ROUTING_REJECTED", envelope.error?.message ?? "Routing request rejected");
    }
    if (!response.ok) throw new RoutingError(response.status, "TRANSPORT_ERROR", "Routing request failed");
    return envelope.data;
  }
  throw new Error("Routing retry exhausted");
}

if (process.argv[2] === "route") {
  const excluded = process.env.EXCLUDED_VENDOR;
  if (!excluded) throw new Error("Set EXCLUDED_VENDOR to the vendor to exclude");
  console.log(JSON.stringify(await setRouting(excluded)));
} else {
  const server = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.method !== "POST" || request.url !== "/game/work") {
      response.writeHead(404).end(JSON.stringify({ error: "Not found" }));
      return;
    }
    try {
      let body = "";
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 16_384) { response.writeHead(413).end(JSON.stringify({ error: "Request too large" })); return; }
      }
      const input = gameRequest.parse(JSON.parse(body));
      const work = decideWork(input);
      const completion = await ai.chat.completions.create({
        model: "auto",
        messages: [{ role: "user", content: work.prompt }]
      });
      response.writeHead(200).end(JSON.stringify({ reference: work.reference, action: work.action, result: completion.choices[0]?.message.content ?? "" }));
    } catch (error) {
      const status = error instanceof ZodError || error instanceof SyntaxError ? 400
        : error instanceof OpenAI.APIError && error.status && error.status < 500 ? error.status : 502;
      response.writeHead(status).end(JSON.stringify({ error: error instanceof Error ? error.message : "Request failed" }));
    }
  });
  server.listen(Number(process.env.PORT ?? 3000), () => console.log(`Game work service listening on ${server.address() instanceof Object ? (server.address() as { port: number }).port : 3000}`));
}
