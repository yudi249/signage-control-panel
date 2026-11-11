import {
  deviceClientMessageSchema,
  syncMessageSchema,
  type SyncMessage,
} from "@signage/shared";
import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import type { Db } from "../../platform/supabase.ts";

const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = 45_000;

interface DevicesApi {
  findById(id: string): Promise<{ id: string; pushedContentId: string | null } | null>;
  setPresence(id: string, status: "online" | "offline"): Promise<unknown>;
}

interface ContentRow {
  id: string;
  judul: string;
  tipe: "text" | "image" | "video" | "url";
  payload: string;
  created_at: string;
}

interface Connection {
  socket: WebSocket;
  timeout: NodeJS.Timeout;
}

export class PresenceService {
  private readonly connections = new Map<string, Connection>();
  private readonly db: Db | null;
  private readonly devices: DevicesApi | null;

  constructor(app: FastifyInstance, db: Db | null, devices: DevicesApi | null) {
    this.db = db;
    this.devices = devices;
    void app;
  }

  async handleDeviceSocket(socket: WebSocket): Promise<void> {
    let deviceId: string | null = null;

    const onFirstMessage = async (raw: unknown) => {
      const text = String(raw ?? "");
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        socket.close(1008, "Invalid JSON");
        return;
      }
      const msg = deviceClientMessageSchema.safeParse(parsed);
      if (!msg.success || msg.data.type !== "hello") {
        socket.close(1008, "Expected hello");
        return;
      }
      if (!this.devices) {
        socket.close(1011, "Database not configured");
        return;
      }
      const device = await this.devices.findById(msg.data.deviceId);
      if (!device) {
        socket.close(1008, "Unknown device");
        return;
      }
      deviceId = device.id;
      this.register(deviceId, socket);
      await this.devices.setPresence(deviceId, "online");
      await this.sendSync(deviceId, device.pushedContentId);

      socket.off("message", onFirstMessage);
      socket.on("message", (data) => void this.onMessage(deviceId!, data));
      socket.on("close", () => void this.onClose(deviceId!));
      socket.on("error", () => void this.onClose(deviceId!));
    };

    socket.on("message", onFirstMessage);
    socket.on("close", () => {
      socket.off("message", onFirstMessage);
    });
  }

  private register(deviceId: string, socket: WebSocket): void {
    const existing = this.connections.get(deviceId);
    if (existing) {
      clearTimeout(existing.timeout);
      try {
        existing.socket.close(1000, "Replaced");
      } catch {
        // ignore
      }
    }
    const timeout = setTimeout(() => void this.onTimeout(deviceId), HEARTBEAT_TIMEOUT_MS);
    this.connections.set(deviceId, { socket, timeout });
  }

  private async onMessage(deviceId: string, raw: unknown): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(raw ?? ""));
    } catch {
      return;
    }
    const msg = deviceClientMessageSchema.safeParse(parsed);
    if (!msg.success) return;
    if (msg.data.type === "heartbeat") {
      const conn = this.connections.get(deviceId);
      if (!conn) return;
      clearTimeout(conn.timeout);
      conn.timeout = setTimeout(() => void this.onTimeout(deviceId), HEARTBEAT_TIMEOUT_MS);
    }
  }

  private async onTimeout(deviceId: string): Promise<void> {
    const conn = this.connections.get(deviceId);
    if (!conn) return;
    try {
      conn.socket.close(1000, "Heartbeat timeout");
    } catch {
      // ignore
    }
    await this.onClose(deviceId);
  }

  private async onClose(deviceId: string): Promise<void> {
    const conn = this.connections.get(deviceId);
    if (!conn) return;
    clearTimeout(conn.timeout);
    if (this.connections.get(deviceId)?.socket === conn.socket) {
      this.connections.delete(deviceId);
      if (this.devices) await this.devices.setPresence(deviceId, "offline");
    }
  }

  private async resolveContent(contentId: string | null): Promise<SyncMessage["content"]> {
    if (!contentId || !this.db) return null;
    const { data, error } = await this.db
      .from("contents")
      .select("id,judul,tipe,payload,created_at")
      .eq("id", contentId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as ContentRow;
    return {
      id: row.id,
      judul: row.judul,
      tipe: row.tipe,
      payload: row.payload,
      createdAt: row.created_at,
    };
  }

  async sendSync(deviceId: string, pushedContentId: string | null): Promise<void> {
    const conn = this.connections.get(deviceId);
    if (!conn || conn.socket.readyState !== 1) return;
    const content = await this.resolveContent(pushedContentId);
    const msg: SyncMessage = syncMessageSchema.parse({ type: "sync", content });
    conn.socket.send(JSON.stringify(msg));
  }

  isOnline(deviceId: string): boolean {
    return this.connections.has(deviceId);
  }

  heartbeatIntervalMs(): number {
    return HEARTBEAT_INTERVAL_MS;
  }
}
