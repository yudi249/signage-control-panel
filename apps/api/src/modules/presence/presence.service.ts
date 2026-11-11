import {
  adminClientMessageSchema,
  deviceClientMessageSchema,
  heartbeatAckMessageSchema,
  presenceMessageSchema,
  snapshotMessageSchema,
  syncMessageSchema,
  type PresenceMessage,
  type SnapshotMessage,
  type SyncMessage,
  type SyncPlaylistItem,
} from "@signage/shared";
import type { Content } from "@signage/shared";
import { createHash, timingSafeEqual } from "node:crypto";
import type { WebSocket } from "ws";

function toWs(socket: WebSocket | { socket: WebSocket }): WebSocket {
  return (socket as { socket?: WebSocket }).socket ?? (socket as WebSocket);
}
import type { Db } from "../../platform/supabase.ts";

const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = 45_000;

interface DevicePresenceState {
  id: string;
  status: "online" | "offline";
  lastSeen: string | null;
  pushedContentId?: string | null;
  tokenHash?: string;
}

interface DevicesApi {
  list(): Promise<DevicePresenceState[]>;
  findById(id: string): Promise<DevicePresenceState | null>;
  setPresence(id: string, status: "online" | "offline"): Promise<DevicePresenceState | null>;
}

interface ContentsApi {
  findById?(id: string): Promise<Content | null>;
  get?(id: string): Promise<Content>;
}

interface PlaylistsApi {
  get(deviceId: string): Promise<SyncPlaylistItem[]>;
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
  private readonly adminSockets = new Set<WebSocket>();
  private readonly db: Db | null;
  private readonly devices: DevicesApi | null;
  private readonly contents: ContentsApi | null;
  private readonly playlists: PlaylistsApi | null;
  private readonly app: any;

  constructor(
    app: any,
    db: Db | null,
    devices: DevicesApi | null,
    contents: ContentsApi | null = null,
    playlists: PlaylistsApi | null = null,
  ) {
    this.db = db;
    this.devices = devices;
    this.contents = contents;
    this.playlists = playlists;
    this.app = app;
  }

  async handleAdminSocket(rawSocket: WebSocket): Promise<void> {
    const socket = toWs(rawSocket);

    const onFirstMessage = async (raw: unknown) => {
      socket.off("message", onFirstMessage);
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(raw ?? ""));
      } catch {
        socket.close(1008, "Token tidak valid atau kedaluwarsa");
        return;
      }
      const auth = adminClientMessageSchema.safeParse(parsed);
      if (!auth.success) {
        socket.close(1008, "Token tidak valid atau kedaluwarsa");
        return;
      }
      try {
        (this.app as any).jwt.verify(auth.data.token);
      } catch {
        socket.close(1008, "Token tidak valid atau kedaluwarsa");
        return;
      }

      this.adminSockets.add(socket);
      socket.on("close", () => this.adminSockets.delete(socket));
      socket.on("error", () => this.adminSockets.delete(socket));

      try {
        const devices = this.devices ? await this.devices.list() : [];
        const snapshot: SnapshotMessage = snapshotMessageSchema.parse({
          type: "snapshot",
          devices: devices.map((d) => ({
            deviceId: d.id,
            status: d.status,
            lastSeen: d.lastSeen,
          })),
        });
        if (socket.readyState === 1) socket.send(JSON.stringify(snapshot));
      } catch {
        // ignore snapshot failures
      }
    };

    socket.on("message", onFirstMessage);
    socket.on("close", () => socket.off("message", onFirstMessage));
  }

  private broadcastPresence(deviceId: string, status: "online" | "offline", lastSeen: string | null): void {
    const msg: PresenceMessage = presenceMessageSchema.parse({
      type: "presence",
      deviceId,
      status,
      lastSeen,
    });
    const payload = JSON.stringify(msg);
    for (const socket of this.adminSockets) {
      if (socket.readyState === 1) socket.send(payload);
    }
  }

  async handleDeviceSocket(rawSocket: WebSocket): Promise<void> {
    const socket = toWs(rawSocket);
    let deviceId: string | null = null;

    const onFirstMessage = async (raw: unknown) => {
      const text = String(raw ?? "");
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        socket.close(1008, "Format pesan tidak valid");
        return;
      }
      const msg = deviceClientMessageSchema.safeParse(parsed);
      if (!msg.success || msg.data.type !== "hello") {
        socket.close(1008, "Pesan hello tidak valid");
        return;
      }
      if (!this.devices) {
        socket.close(1011, "Database not configured");
        return;
      }
      const device = await this.devices.findById(msg.data.deviceId);
      if (!device) {
        socket.close(1008, "Device tidak terdaftar");
        return;
      }
      const token = (msg.data as any).token as string | undefined;
      if (!token) {
        socket.close(1008, "Token perangkat tidak valid");
        return;
      }
      const expectedHash = device.tokenHash ?? "";
      const providedHash = createHash("sha256").update(token).digest("hex");
      let ok = false;
      try {
        ok = !!expectedHash && expectedHash.length === providedHash.length &&
          timingSafeEqual(Buffer.from(expectedHash, "hex"), Buffer.from(providedHash, "hex"));
      } catch {
        ok = false;
      }
      if (!ok) {
        socket.close(1008, "Token perangkat tidak valid");
        return;
      }
      deviceId = device.id;
      this.register(deviceId, socket);
      const updated = await this.devices.setPresence(deviceId, "online");
      this.broadcastPresence(deviceId, "online", updated?.lastSeen ?? new Date().toISOString());
      await this.sendSync(deviceId);

      socket.off("message", onFirstMessage);
      socket.on("message", (data) => void this.onMessage(deviceId!, socket, data));
      socket.on("close", () => void this.onClose(deviceId!, socket));
      socket.on("error", () => void this.onClose(deviceId!, socket));
    };

    socket.on("message", onFirstMessage);
    socket.on("close", () => {
      socket.off("message", onFirstMessage);
    });
  }

  async disconnectDevice(deviceId: string, reason = "Koneksi diputus"): Promise<void> {
    const conn = this.connections.get(deviceId);
    if (!conn) return;
    try {
      conn.socket.close(1000, reason);
    } catch {
      // ignore
    }
    await this.onClose(deviceId);
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

  private async onMessage(deviceId: string, socket: WebSocket, raw: unknown): Promise<void> {
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
      if (!conn || conn.socket !== socket || socket.readyState !== 1) return;
      clearTimeout(conn.timeout);
      conn.timeout = setTimeout(() => void this.onTimeout(deviceId), HEARTBEAT_TIMEOUT_MS);
      socket.send(JSON.stringify(heartbeatAckMessageSchema.parse({ type: "heartbeat_ack" })));
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

  private async onClose(deviceId: string, socket?: WebSocket): Promise<void> {
    const conn = this.connections.get(deviceId);
    if (!conn || (socket && conn.socket !== socket)) return;
    clearTimeout(conn.timeout);
    if (this.connections.get(deviceId)?.socket === conn.socket) {
      this.connections.delete(deviceId);
      let lastSeen: string | null = null;
      if (this.devices) {
        const updated = await this.devices.setPresence(deviceId, "offline");
        lastSeen = updated?.lastSeen ?? null;
      }
      this.broadcastPresence(deviceId, "offline", lastSeen);
    }
  }

  private async resolveContent(contentId: string | null): Promise<Content | null> {
    if (!contentId) return null;
    if (this.contents) {
      if (this.contents.findById) return this.contents.findById(contentId);
      if (this.contents.get) {
        try {
          return await this.contents.get(contentId);
        } catch {
          return null;
        }
      }
    }
    if (!this.db) return null;
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

  private async resolvePlaylist(deviceId: string): Promise<SyncPlaylistItem[]> {
    if (this.playlists) {
      try {
        const items = await this.playlists.get(deviceId);
        return Array.isArray(items) ? items : [];
      } catch {
        return [];
      }
    }
    if (!this.db) return [];
    const { data, error } = await this.db
      .from("playlist_items")
      .select("position,duration_seconds,content:contents(id,judul,tipe,payload,created_at)")
      .eq("device_id", deviceId)
      .order("position", { ascending: true });
    if (error || !data) return [];
    const rows = data as any[];
    return rows.map((row) => {
      const contentRow = Array.isArray(row.content) ? row.content[0] : row.content;
      return {
        position: row.position,
        durationSeconds: row.duration_seconds,
        content: {
          id: contentRow.id,
          judul: contentRow.judul,
          tipe: contentRow.tipe,
          payload: contentRow.payload,
          createdAt: contentRow.created_at,
        } as Content,
      };
    });
  }

  private buildSync(pushed: Content | null, playlist: SyncPlaylistItem[]): SyncMessage {
    if (pushed) {
      return syncMessageSchema.parse({ type: "sync", mode: "push", pushed, playlist });
    }
    if (playlist.length > 0) {
      return syncMessageSchema.parse({ type: "sync", mode: "playlist", pushed: null, playlist });
    }
    return syncMessageSchema.parse({ type: "sync", mode: "idle", pushed: null, playlist: [] });
  }

  async sendSync(deviceId: string, pushedContentId?: string | null): Promise<void> {
    const conn = this.connections.get(deviceId);
    if (!conn || conn.socket.readyState !== 1) return;
    let pushedId = pushedContentId;
    if (pushedId === undefined) {
      const device = this.devices ? await this.devices.findById(deviceId) : null;
      pushedId = device?.pushedContentId ?? null;
    }
    const pushed = await this.resolveContent(pushedId ?? null);
    const playlist = await this.resolvePlaylist(deviceId);
    const msg = this.buildSync(pushed, playlist);
    conn.socket.send(JSON.stringify(msg));
  }

  isOnline(deviceId: string): boolean {
    return this.connections.has(deviceId);
  }

  heartbeatIntervalMs(): number {
    return HEARTBEAT_INTERVAL_MS;
  }
}
