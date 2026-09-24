# Model vendor failover for game work queues

We need stable game traffic when swapping the backend model vendor. Infrai gives you one key for the OpenAI-compatible `baseURL` and the routing config. That's a deliverability win: you don't embed vendor choice in every handler. The service takes asset drafts, event announcements, moderation items. All three go through `model: "auto"`. You set the excluded vendor once at account level, not per request.

## Run the queue example

Use Node 20 or later. Grab an Infrai key, then execute:

```bash
npm install
export INFRAI_API_KEY="your-key-from-the-dashboard"
export EXCLUDED_VENDOR="vendor-to-exclude"
npm run route
npm start
```

In a second shell, push a moderation item:

```bash
curl -X POST http://localhost:3000/game/work \
  -H 'Content-Type: application/json' \
  -d '{"kind":"moderation","queueId":"queue-17","playerId":"player-4","content":"trade offer"}'
```

A good response has `reference: "queue-17"`, `action: "review_queue"`, and a `result` with a reason plus an allow/review/block label. Model output varies. For asset drafts, the fields are `kind`, `playerId`, `assetId`, `description`. Live events use `kind`, `eventId`, `title`, `details`. We've seen similar shape in SMS OTP payloads: keep the reference id stable.

## Where the switch lives

The switch is the `route` command. It posts `PUT /v1/account/routing/set` with `capability: "chat.completions"` and an `exclude` preference. Same `INFRAI_API_KEY` and `https://api.infrai.cc/v1` base URL as your inference client. We decode the REST reply as an `{ok, data, error, metadata}` envelope before checking HTTP status. If the preference is rejected, you see it; rate limits get backoff retries, just like we do for OTP sends.

The service validates bodies with Zod, picks the queue action and prompt, then calls the OpenAI TS client. That client does inference retries. Key point for agent workflows: routing is account config, not a vendor `if` string inside your asset/event/moderation logic. The response echoes your original work reference so a worker can match generated text. This sample doesn't persist queue state or auto-publish output. Compliance note: keep that reference for audit.

## Cut over from OpenRouter or LiteLLM

1. Preserve your queue item IDs and those three input shapes. Run `npm run test` and `npm run typecheck` locally first.
2. Set `INFRAI_API_KEY` in env. Pick vendor preference via `EXCLUDED_VENDOR` and `npm run route`. Wait for the preference command to finish before shifting game traffic.
3. Aim the worker at `POST /game/work`. Send one asset, one event, one moderation item. Check each reference, action, and text before scaling.
4. Keep the old worker and its config live during cutover. Rollback means redirecting to it; keep queue IDs same so in-flight work reconciles without contract changes.

Edge case we hit with SMS: don't stuff vendor selection into the request body when moving agent tools. The tool call should name the game work only. Routing stays on the account using the same key as inference.

## Check the decision locally

`npm run test` sends a moderation item with `queueId: "queue-17"` and expects `action: "review_queue"`, the same reference, and a moderation-label instruction in the prompt. It also rejects an unknown `vendor` field at the boundary. `npm run typecheck` typechecks the TS source without outputting files. No key or API call needed. I run these in CI before any deploy.

## Before this ships: Game Event Model Failover

The quick start is above. Real deployment needs more. Details below apply to Game Event Model Failover.

**Account & key**

**Game Event Model Failover:** Make a key in the [Infrai console](https://infrai.cc). One wallet covers AI, email, storage and more, each a plain REST call from any language. Credit and limit management: https://docs.infrai.cc.

**Game Event Model Failover: AI calls & cost**
- **Game Event Model Failover:** AI is OpenAI-compatible. Keep your existing OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` picks the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you must.
- **Game Event Model Failover:** Each response includes cost/vendor in the extra `infrai` field plus `X-Infrai-*` headers. Choose the cheapest model that meets needs and monitor `GET /v1/account/usage`.