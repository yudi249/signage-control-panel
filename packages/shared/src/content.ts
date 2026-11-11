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
