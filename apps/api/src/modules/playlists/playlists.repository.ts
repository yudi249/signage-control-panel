import type { Content, PlaylistItemResponse } from "@signage/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface NormalizedPlaylistItem {
  contentId: string;
  position: number;
  durationSeconds: number;
}

function toContent(row: any): Content {
  return {
    id: row.id,
    judul: row.judul,
    tipe: row.tipe,
    payload: row.payload,
    createdAt: row.created_at,
  };
}

export class PlaylistsRepository {
  private readonly db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.db = db;
  }

  async getResolved(deviceId: string): Promise<PlaylistItemResponse[]> {
    const { data, error } = await this.db
      .from("playlist_items")
      .select("position,duration_seconds,content:contents(id,judul,tipe,payload,created_at)")
      .eq("device_id", deviceId)
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    const rows = (data as any[]) ?? [];
    return rows.map((row) => {
      const contentRow = Array.isArray(row.content) ? row.content[0] : row.content;
      return {
        position: row.position,
        durationSeconds: row.duration_seconds,
        content: toContent(contentRow),
      };
    });
  }

  async getInternal(deviceId: string): Promise<NormalizedPlaylistItem[]> {
    const { data, error } = await this.db
      .from("playlist_items")
      .select("content_id,position,duration_seconds")
      .eq("device_id", deviceId)
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    const rows = (data as any[]) ?? [];
    return rows.map((row) => ({
      contentId: row.content_id,
      position: row.position,
      durationSeconds: row.duration_seconds,
    }));
  }

  async replace(deviceId: string, items: NormalizedPlaylistItem[]): Promise<void> {
    const { error: delError } = await this.db.from("playlist_items").delete().eq("device_id", deviceId);
    if (delError) throw new Error(delError.message);
    if (items.length === 0) return;
    const rows = items.map((it) => ({
      device_id: deviceId,
      content_id: it.contentId,
      position: it.position,
      duration_seconds: it.durationSeconds,
    }));
    const { error: insError } = await this.db.from("playlist_items").insert(rows);
    if (insError) throw new Error(insError.message);
  }
}
