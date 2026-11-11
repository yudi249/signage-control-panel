import { z } from "zod";

export const contentTypeSchema = z.enum(["text", "image", "video", "url"]);
export type ContentType = z.infer<typeof contentTypeSchema>;

/** `payload` berisi teks untuk tipe `text`, dan URL untuk tipe lainnya. */
export const contentSchema = z.object({
  id: z.string().uuid(),
  judul: z.string(),
  tipe: contentTypeSchema,
  payload: z.string(),
  createdAt: z.string().datetime({ offset: true }),
});
export type Content = z.infer<typeof contentSchema>;

export const createContentSchema = z.object({
  judul: z.string().trim().min(1).max(200),
  tipe: contentTypeSchema,
  payload: z.string().min(1),
});
export type CreateContent = z.infer<typeof createContentSchema>;

export const updateContentSchema = createContentSchema.partial();
export type UpdateContent = z.infer<typeof updateContentSchema>;

export const ALLOWED_UPLOAD_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
] as const;
export type AllowedUploadMimeType = (typeof ALLOWED_UPLOAD_MIME_TYPES)[number];
export const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;

export function uploadContentTypeForMime(mime: string): "image" | "video" | null {
  if (mime.startsWith("image/")) return ALLOWED_UPLOAD_MIME_TYPES.includes(mime as AllowedUploadMimeType) ? "image" : null;
  if (mime.startsWith("video/")) return ALLOWED_UPLOAD_MIME_TYPES.includes(mime as AllowedUploadMimeType) ? "video" : null;
  return null;
}
