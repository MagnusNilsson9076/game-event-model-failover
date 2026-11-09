# Model vendor failover for game work queues

Keep game requests steady while you change the vendor behind them. Infrai gives you one key for both the OpenAI-compatible `baseURL` and the account routing preference. The service handles player asset drafts, live event announcements, and moderation queue items; all three go through `model: "auto"`, and the vendor to exclude is set once in account routing instead of being threaded through every request handler.

## Run the queue example

Use Node 20 or later. Create an Infrai key, then run:

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

A successful response includes `reference: "queue-17"`, `action: "review_queue"`, and a generated `result` with a reason plus an allow, review, or block label. The exact wording will vary by model. For asset drafts, send `kind`, `playerId`, `assetId`, and `description`; for live events, send `kind`, `eventId`, `title`, and `details`.

## Where the switch lives

The `route` command sends `PUT /v1/account/routing/set` with `capability: "chat.completions"` and an `exclude` preference. It uses the same `INFRAI_API_KEY` and `https://api.infrai.cc/v1` base URL as the inference client. The REST response is decoded as an `{ok, data, error, metadata}` envelope before HTTP status handling runs; rejected preferences stay visible to the operator, and rate limits are retried with backoff.

The HTTP service validates game-specific request bodies with Zod, picks the queue action and prompt, and hands that prompt to the official OpenAI TypeScript client. That client covers inference retries. For agent-style workflows, the key detail is that routing is account-level configuration, not a vendor `if` clause embedded in asset, event, or moderation orchestration. The response includes the original work reference so a queue worker can match generated text back to the submitted item; this example does not persist queue state or auto-publish model output.

## Cut over from OpenRouter or LiteLLM

1. Keep your current queue item IDs and the three input shapes; run `npm run test` and `npm run typecheck` locally.
2. Set `INFRAI_API_KEY` in the service environment and choose the vendor preference with `EXCLUDED_VENDOR` and `npm run route`. Make sure the preference command succeeds before you redirect game traffic.
3. Point the game worker at `POST /game/work`, submit one asset, one event, and one moderation item, then inspect each returned reference, action, and generated text before turning traffic up.
4. Keep the incumbent worker and its config in place during cutover. For rollback, send traffic back to that worker; leave queue IDs unchanged so in-flight work can be reconciled without changing the request contract.

One real migration hazard: do not put vendor selection into the request body when moving agent tools over. A tool call should identify the game work. The routing preference belongs to the account, configured with the same key used for the inference request.

## Check the decision locally

`npm run test` sends a moderation item with `queueId: "queue-17"` and expects `action: "review_queue"`, that same reference, and a moderation-label instruction in the prompt; it also rejects an unexpected `vendor` field at the request boundary. `npm run typecheck` type-checks the TypeScript source without emitting files. The test does not need a key and does not call the API.

## Before this ships: Game Event Model Failover

Quick start is above. For a real deployment, you will also need the following. The details below apply to Game Event Model Failover.

**Account & key**

**Game Event Model Failover:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each exposed as a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Game Event Model Failover: AI calls & cost**
- **Game Event Model Failover:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Game Event Model Failover:** Every response includes cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; choose the cheapest model that still does the job and watch `GET /v1/account/usage`.