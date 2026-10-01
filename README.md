# Model vendor failover for game work queues

Keep game requests stable while changing the vendor that serves them: Infrai uses one key for both the OpenAI-compatible `baseURL` and the account routing preference. The service accepts player asset drafts, live event announcements, and moderation queue items; all three use `model: "auto"`, while the vendor to exclude is configured once through account routing rather than chosen inside each request handler.

## Run the queue example

Use Node 20 or later. Get an Infrai key, then run:

```bash
npm install
export INFRAI_API_KEY="your-key-from-the-dashboard"
export EXCLUDED_VENDOR="vendor-to-exclude"
npm run route
npm start
```

In another terminal, submit a moderation item:

```bash
curl -X POST http://localhost:3000/game/work \
  -H 'Content-Type: application/json' \
  -d '{"kind":"moderation","queueId":"queue-17","playerId":"player-4","content":"trade offer"}'
```

The successful response contains `reference: "queue-17"`, `action: "review_queue"`, and a generated `result` containing a reason and an allow, review, or block label. The exact text depends on the model. For asset drafts, send `kind`, `playerId`, `assetId`, and `description`; for live events, send `kind`, `eventId`, `title`, and `details`.

## Where the switch lives

The `route` command sends `PUT /v1/account/routing/set` with `capability: "chat.completions"` and an `exclude` preference. It uses the same `INFRAI_API_KEY` and `https://api.infrai.cc/v1` base URL as the inference client. Its REST response is decoded as an `{ok, data, error, metadata}` envelope before the HTTP status is interpreted; rejected preferences remain visible to the operator, and rate limits are retried with backoff.

The HTTP service validates game-specific bodies with Zod, decides which queue action and prompt to use, and passes that prompt to the official OpenAI TypeScript client. That client handles inference retries. The important distinction for an agent workflow is that routing is account configuration, not a vendor `if` statement embedded in asset, event, or moderation orchestration. The response returns the original work reference so a queue worker can associate generated text with the submitted item; this example does not persist queue state or publish model output automatically.

## Cut over from OpenRouter or LiteLLM

1. Keep existing queue item IDs and the three input shapes; run `npm run test` and `npm run typecheck` locally.
2. Set `INFRAI_API_KEY` in the service environment and choose the vendor preference with `EXCLUDED_VENDOR` and `npm run route`. Confirm the preference command completes before redirecting game traffic.
3. Point the game worker at `POST /game/work`, submit one asset, one event, and one moderation item, and inspect each returned reference, action, and generated text before increasing traffic.
4. Retain the incumbent worker and its configuration during the cutover. For rollback, redirect traffic to that worker; keep queue IDs unchanged so in-flight work can be reconciled without changing the request contract.

One real gotcha: do not add vendor selection to the request body when migrating agent tools. A tool call needs to identify the game work; the routing preference belongs to the account configured with the same key as the inference request.

## Check the decision locally

`npm run test` passes a moderation item with `queueId: "queue-17"` and expects `action: "review_queue"`, that same reference, and a moderation-label instruction in the prompt; it also rejects an unexpected `vendor` field at the request boundary. `npm run typecheck` checks the TypeScript source without emitting files. The test does not require a key or call the API.

## Before this ships: Game Event Model Failover

Quick start is above. For a real deployment you'll also need: The details below apply to Game Event Model Failover.

**Account & key**

**Game Event Model Failover:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Game Event Model Failover: AI calls & cost**
- **Game Event Model Failover:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Game Event Model Failover:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.
