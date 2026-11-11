import { z } from "zod";

export const deviceStatusSchema = z.enum(["online", "offline"]);
export type DeviceStatus = z.infer<typeof deviceStatusSchema>;

/** Device seperti yang dilihat klien. Hash token tidak pernah keluar dari server. */
export const deviceSchema = z.object({
  id: z.string().uuid(),
  nama: z.string(),
  lokasi: z.string(),
  status: deviceStatusSchema,
  lastSeen: z.string().datetime({ offset: true }).nullable(),
  pushedContentId: z.string().uuid().nullable(),
});
export type Device = z.infer<typeof deviceSchema>;

export const createDeviceSchema = z.object({
  nama: z.string().trim().min(1).max(100),
  lokasi: z.string().trim().max(200).default(""),
});
export type CreateDevice = z.infer<typeof createDeviceSchema>;

export const updateDeviceSchema = createDeviceSchema.partial();
export type UpdateDevice = z.infer<typeof updateDeviceSchema>;

export const deviceWithTokenSchema = z.object({
  device: deviceSchema,
  token: z.string().min(1),
});
export type DeviceWithToken = z.infer<typeof deviceWithTokenSchema>;
