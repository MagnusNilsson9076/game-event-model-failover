import assert from "node:assert/strict";
import test from "node:test";
import { decideWork, gameRequest } from "./game_decision.ts";

test("a moderation submission stays in the review workflow", () => {
  const input = gameRequest.parse({ kind: "moderation", queueId: "queue-17", playerId: "player-4", content: "trade offer" });
  const work = decideWork(input);
  assert.equal(work.action, "review_queue");
  assert.equal(work.reference, "queue-17");
  assert.match(work.prompt, /allow, review, or block/);
  assert.equal(gameRequest.safeParse({ ...input, vendor: "other" }).success, false);
});
