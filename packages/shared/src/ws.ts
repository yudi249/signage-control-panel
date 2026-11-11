import { z } from "zod";
import { contentSchema } from "./content.ts";
import { deviceStatusSchema } from "./device.ts";

export const helloMessageSchema = z.object({
  type: z.literal("hello"),
  deviceId: z.string().uuid(),
  token: z.string().min(1),
});
export type HelloMessage = z.infer<typeof helloMessageSchema>;

export const heartbeatMessageSchema = z.object({
  type: z.literal("heartbeat"),
});
export type HeartbeatMessage = z.infer<typeof heartbeatMessageSchema>;

export const syncPlaylistItemSchema = z.object({
  position: z.number().int().nonnegative(),
  durationSeconds: z.number().int().positive(),
  content: contentSchema,
});
export type SyncPlaylistItem = z.infer<typeof syncPlaylistItemSchema>;

export const syncModeSchema = z.enum(["push", "playlist", "idle"]);
export type SyncMode = z.infer<typeof syncModeSchema>;

export const syncMessageSchema = z.object({
  type: z.literal("sync"),
  mode: syncModeSchema,
  pushed: contentSchema.nullable(),
  playlist: z.array(syncPlaylistItemSchema),
});
export type SyncMessage = z.infer<typeof syncMessageSchema>;

export const deviceClientMessageSchema = z.discriminatedUnion("type", [
  helloMessageSchema,
  heartbeatMessageSchema,
]);
export type DeviceClientMessage = z.infer<typeof deviceClientMessageSchema>;

export const deviceServerMessageSchema = syncMessageSchema;
export type DeviceServerMessage = z.infer<typeof deviceServerMessageSchema>;

export const presenceSnapshotItemSchema = z.object({
  deviceId: z.string().uuid(),
  status: deviceStatusSchema,
  lastSeen: z.string().datetime({ offset: true }).nullable(),
});
export type PresenceSnapshotItem = z.infer<typeof presenceSnapshotItemSchema>;

export const snapshotMessageSchema = z.object({
  type: z.literal("snapshot"),
  devices: z.array(presenceSnapshotItemSchema),
});
export type SnapshotMessage = z.infer<typeof snapshotMessageSchema>;

export const presenceMessageSchema = z.object({
  type: z.literal("presence"),
  deviceId: z.string().uuid(),
  status: deviceStatusSchema,
  lastSeen: z.string().datetime({ offset: true }).nullable(),
});
export type PresenceMessage = z.infer<typeof presenceMessageSchema>;

export const adminServerMessageSchema = z.discriminatedUnion("type", [
  snapshotMessageSchema,
  presenceMessageSchema,
]);
export type AdminServerMessage = z.infer<typeof adminServerMessageSchema>;

export const adminAuthMessageSchema = z.object({
  type: z.literal("auth"),
  token: z.string().min(1),
});
export type AdminAuthMessage = z.infer<typeof adminAuthMessageSchema>;

export const adminClientMessageSchema = adminAuthMessageSchema;
export type AdminClientMessage = z.infer<typeof adminClientMessageSchema>;

export const pushRequestSchema = z.object({
  contentId: z.string().uuid(),
});
export type PushRequest = z.infer<typeof pushRequestSchema>;

/** Koneksi Device sah yang lebih baru telah mengambil alih. */
export const DEVICE_REPLACED_CLOSE_CODE = 4009;
