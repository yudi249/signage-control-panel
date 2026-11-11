import { z } from "zod";
import { contentSchema } from "./content.ts";

export const playlistItemInputSchema = z.object({
  contentId: z.string().uuid(),
  position: z.number().int().nonnegative().optional(),
  durationSeconds: z.number().int().positive().optional(),
});
export type PlaylistItemInput = z.infer<typeof playlistItemInputSchema>;

export const replacePlaylistRequestSchema = z.object({
  items: z.array(playlistItemInputSchema),
});
export type ReplacePlaylistRequest = z.infer<typeof replacePlaylistRequestSchema>;

export const playlistItemResponseSchema = z.object({
  position: z.number().int().nonnegative(),
  durationSeconds: z.number().int().positive(),
  content: contentSchema,
});
export type PlaylistItemResponse = z.infer<typeof playlistItemResponseSchema>;

export const playlistResponseSchema = z.array(playlistItemResponseSchema);
export type PlaylistResponse = z.infer<typeof playlistResponseSchema>;
