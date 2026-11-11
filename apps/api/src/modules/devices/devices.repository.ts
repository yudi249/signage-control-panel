import type { Device } from "@signage/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface DeviceRow {
  id: string;
  nama: string;
  lokasi: string;
  status: "online" | "offline";
  last_seen: string | null;
  pushed_content_id: string | null;
  token_hash: string;
}

export function toDevice(row: Omit<DeviceRow, "token_hash">): Device {
  return {
    id: row.id,
    nama: row.nama,
    lokasi: row.lokasi,
    status: row.status,
    lastSeen: row.last_seen,
    pushedContentId: row.pushed_content_id,
  };
}

export class DevicesRepository {
  private readonly db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.db = db;
  }

  async list(): Promise<Device[]> {
    const { data, error } = await this.db
      .from("devices")
      .select("id,nama,lokasi,status,last_seen,pushed_content_id")
      .order("nama");
    if (error) throw new Error(error.message);
    return (data as Omit<DeviceRow, "token_hash">[]).map(toDevice);
  }
}
