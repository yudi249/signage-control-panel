import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface UploadInput {
  bucket: string;
  objectName: string;
  data: Buffer;
  contentType: string;
}

export interface UploadResult {
  objectName: string;
  publicUrl: string;
}

export interface ContentStorage {
  upload(input: UploadInput): Promise<UploadResult>;
}

export class SupabaseContentStorage implements ContentStorage {
  private readonly db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.db = db;
  }

  async upload(input: UploadInput): Promise<UploadResult> {
    const { data, error } = await this.db.storage
      .from(input.bucket)
      .upload(input.objectName, input.data, {
        contentType: input.contentType,
        upsert: false,
      });
    if (error) throw new Error(error.message);
    const publicUrl = this.db.storage.from(input.bucket).getPublicUrl(data.path).data.publicUrl;
    return { objectName: data.path, publicUrl };
  }
}

export function createObjectName(filename: string, mime: string): string {
  const extFromMime: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
  };
  const ext =
    extFromMime[mime] ??
    (() => {
      const m = filename.match(/(\.[a-zA-Z0-9]+)$/);
      return m?.[1]?.toLowerCase() ?? "";
    })();
  return `${randomUUID()}${ext}`;
}