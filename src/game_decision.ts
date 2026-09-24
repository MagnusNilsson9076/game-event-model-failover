import { z } from "zod";

export const gameRequest = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("asset"), playerId: z.string().min(1), assetId: z.string().min(1), description: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("event"), eventId: z.string().min(1), title: z.string().min(1), details: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("moderation"), queueId: z.string().min(1), playerId: z.string().min(1), content: z.string().min(1) }).strict()
]);

export type GameRequest = z.infer<typeof gameRequest>;

export function decideWork(input: GameRequest): { reference: string; action: string; prompt: string } {
  switch (input.kind) {
    case "asset": return {
      reference: input.assetId,
      action: "draft_asset",
      prompt: `Draft a short in-game item description for player ${input.playerId}. Item ${input.assetId}: ${input.description}. Return plain text.`
    };
    case "event": return {
      reference: input.eventId,
      action: "announce_event",
      prompt: `Write a concise player-facing live event announcement for ${input.eventId}, titled ${input.title}. Details: ${input.details}. Return plain text.`
    };
    case "moderation": return {
      reference: input.queueId,
      action: "review_queue",
      prompt: `Review queued player content ${input.queueId} from ${input.playerId}: ${input.content}. Return a short reason and one label: allow, review, or block.`
    };
  }
}
