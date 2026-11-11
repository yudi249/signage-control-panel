import { z } from "zod";
import { contentSchema } from "./content.ts";

export const helloMessageSchema = z.object({
  type: z.literal("hello"),
  deviceId: z.string().uuid(),
});
export type HelloMessage = z.infer<typeof helloMessageSchema>;

export const heartbeatMessageSchema = z.object({
  type: z.literal("heartbeat"),
});
export type HeartbeatMessage = z.infer<typeof heartbeatMessageSchema>;

export const syncMessageSchema = z.object({
  type: z.literal("sync"),
  content: contentSchema.nullable(),
});
export type SyncMessage = z.infer<typeof syncMessageSchema>;

export const deviceClientMessageSchema = z.discriminatedUnion("type", [
  helloMessageSchema,
  heartbeatMessageSchema,
]);
export type DeviceClientMessage = z.infer<typeof deviceClientMessageSchema>;

export const deviceServerMessageSchema = syncMessageSchema;
export type DeviceServerMessage = z.infer<typeof deviceServerMessageSchema>;
