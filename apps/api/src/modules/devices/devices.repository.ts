import { createHash, randomBytes } from "node:crypto";
import type { CreateDevice, Device, UpdateDevice } from "@signage/shared";
type DeviceWithToken = { device: Device; token: string };
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

export interface DeviceWithHash extends Device {
  tokenHash: string;
}

const DEVICE_COLUMNS = "id,nama,lokasi,status,last_seen,pushed_content_id";

function toDevice(row: Omit<DeviceRow, "token_hash">): Device {
  return {
    id: row.id,
    nama: row.nama,
    lokasi: row.lokasi,
    status: row.status,
    lastSeen: row.last_seen,
    pushedContentId: row.pushed_content_id,
  };
}

function toDeviceWithHash(row: DeviceRow): DeviceWithHash {
  return { ...toDevice(row), tokenHash: row.token_hash };
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class DevicesRepository {
  private readonly db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.db = db;
  }

  async list(): Promise<Device[]> {
    const { data, error } = await this.db
      .from("devices")
      .select(DEVICE_COLUMNS)
      .order("nama");
    if (error) throw new Error(error.message);
    return (data as Omit<DeviceRow, "token_hash">[]).map(toDevice);
  }

  async findById(id: string): Promise<Device | null> {
    const { data, error } = await this.db
      .from("devices")
      .select(DEVICE_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toDevice(data as Omit<DeviceRow, "token_hash">) : null;
  }

  async findByIdWithHash(id: string): Promise<DeviceWithHash | null> {
    const { data, error } = await this.db
      .from("devices")
      .select(`${DEVICE_COLUMNS},token_hash`)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toDeviceWithHash(data as DeviceRow) : null;
  }

  async createWithToken(input: CreateDevice): Promise<DeviceWithToken> {
    const token = generateToken();
    const token_hash = hashDeviceToken(token);
    const { data, error } = await this.db
      .from("devices")
      .insert({ nama: input.nama, lokasi: input.lokasi ?? "", token_hash })
      .select(DEVICE_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { device: toDevice(data as Omit<DeviceRow, "token_hash">), token };
  }

  async rotateToken(id: string): Promise<DeviceWithToken | null> {
    const token = generateToken();
    const token_hash = hashDeviceToken(token);
    const { data, error } = await this.db
      .from("devices")
      .update({ token_hash })
      .eq("id", id)
      .select(DEVICE_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? { device: toDevice(data as Omit<DeviceRow, "token_hash">), token } : null;
  }

  async update(id: string, input: UpdateDevice): Promise<Device | null> {
    const patch: Record<string, unknown> = {};
    if (input.nama !== undefined) patch.nama = input.nama;
    if (input.lokasi !== undefined) patch.lokasi = input.lokasi;
    if (Object.keys(patch).length === 0) return this.findById(id);
    const { data, error } = await this.db
      .from("devices")
      .update(patch)
      .eq("id", id)
      .select(DEVICE_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toDevice(data as Omit<DeviceRow, "token_hash">) : null;
  }

  async delete(id: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("devices")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data !== null;
  }

  async setPresence(id: string, status: "online" | "offline"): Promise<Device | null> {
    const { data, error } = await this.db
      .from("devices")
      .update({ status, last_seen: new Date().toISOString() })
      .eq("id", id)
      .select(DEVICE_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toDevice(data as Omit<DeviceRow, "token_hash">) : null;
  }

  async setActiveContent(id: string, pushedContentId: string | null): Promise<Device | null> {
    const { data, error } = await this.db
      .from("devices")
      .update({ pushed_content_id: pushedContentId })
      .eq("id", id)
      .select(DEVICE_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toDevice(data as Omit<DeviceRow, "token_hash">) : null;
  }

  async listPushedByContent(contentId: string): Promise<Device[]> {
    const { data, error } = await this.db
      .from("devices")
      .select(DEVICE_COLUMNS)
      .eq("pushed_content_id", contentId);
    if (error) throw new Error(error.message);
    return (data as Omit<DeviceRow, "token_hash">[]).map(toDevice);
  }
}
