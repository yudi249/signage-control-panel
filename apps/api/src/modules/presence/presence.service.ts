import {
  DEVICE_REPLACED_CLOSE_CODE,
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
  order: number;
  syncRevision: number;
  presenceReady: boolean;
}

interface PresenceDependencies {
  verifyAdminToken(token: string): unknown;
  reportFailure(error: unknown, deviceId: string, status: "online" | "offline"): void;
}

export class PresenceService {
  private readonly connections = new Map<string, Connection>();
  private readonly adminSockets = new Set<WebSocket>();
  private nextOrder = 0;
  private readonly latestOrders = new Map<string, number>();
  private readonly presenceWrites = new Map<string, Promise<void>>();
  private readonly db: Db | null;
  private readonly devices: DevicesApi | null;
  private readonly contents: ContentsApi | null;
  private readonly playlists: PlaylistsApi | null;
  private readonly dependencies: PresenceDependencies;

  constructor(
    dependencies: PresenceDependencies,
    db: Db | null,
    devices: DevicesApi | null,
    contents: ContentsApi | null = null,
    playlists: PlaylistsApi | null = null,
  ) {
    this.db = db;
    this.dependencies = dependencies;
    this.devices = devices;
    this.contents = contents;
    this.playlists = playlists;
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
        this.dependencies.verifyAdminToken(auth.data.token);
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
    const order = ++this.nextOrder;
    let alive = true;
    let connection: Connection | undefined;
    let deviceId: string | undefined;
    const finish = () => {
      alive = false;
      socket.off("message", onFirstMessage);
      if (deviceId && connection) void this.onClose(deviceId, connection);
    };
    socket.on("close", finish);
    socket.on("error", finish);

    const onFirstMessage = async (raw: unknown) => {
      socket.off("message", onFirstMessage);
      try {
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
        if (!alive || socket.readyState !== 1) return;
        if (!device) {
          socket.close(1008, "Device tidak terdaftar");
          return;
        }
        const token = msg.data.token;
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
        if ((this.latestOrders.get(deviceId) ?? 0) > order) {
          socket.close(DEVICE_REPLACED_CLOSE_CODE, "Device digunakan di tempat lain");
          return;
        }
        connection = this.register(deviceId, socket, order);
        socket.on("message", (data) => void this.onMessage(deviceId!, connection!, data));
        await this.writePresence(deviceId, connection, "online");
        connection.presenceReady = true;
        if (this.connections.get(deviceId) === connection) await this.sendSync(deviceId);
      } catch {
        if (alive && (!connection || this.connections.get(deviceId!) === connection)) {
          socket.close(1011, "Sinkronisasi Device gagal");
          finish();
        }
      }
    };

    socket.on("message", onFirstMessage);
  }

  async disconnectDevice(deviceId: string, reason = "Koneksi diputus"): Promise<void> {
    const conn = this.connections.get(deviceId);
    if (!conn) return;
    try {
      conn.socket.close(1000, reason);
    } catch {
      // ignore
    }
    await this.onClose(deviceId, conn);
  }

  private register(deviceId: string, socket: WebSocket, order: number): Connection {
    const existing = this.connections.get(deviceId);
    if (existing) {
      clearTimeout(existing.timeout);
      try {
        existing.socket.close(DEVICE_REPLACED_CLOSE_CODE, "Device digunakan di tempat lain");
      } catch {
        // ignore
      }
    }
    const conn: Connection = { socket, order, syncRevision: 0, presenceReady: false, timeout: setTimeout(() => void this.onTimeout(deviceId, conn), HEARTBEAT_TIMEOUT_MS) };
    this.connections.set(deviceId, conn);
    this.latestOrders.set(deviceId, order);
    return conn;
  }

  private async onMessage(deviceId: string, conn: Connection, raw: unknown): Promise<void> {
    if (this.connections.get(deviceId) !== conn || !conn.presenceReady || conn.socket.readyState !== 1) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(raw ?? ""));
    } catch {
      return;
    }
    const msg = deviceClientMessageSchema.safeParse(parsed);
    if (!msg.success) return;
    if (msg.data.type === "heartbeat") {
      clearTimeout(conn.timeout);
      conn.timeout = setTimeout(() => void this.onTimeout(deviceId, conn), HEARTBEAT_TIMEOUT_MS);
      conn.socket.send(JSON.stringify(heartbeatAckMessageSchema.parse({ type: "heartbeat_ack" })));
    }
  }

  private async onTimeout(deviceId: string, conn: Connection): Promise<void> {
    if (this.connections.get(deviceId) !== conn) return;
    try {
      conn.socket.close(1000, "Heartbeat timeout");
    } catch {
      // ignore
    }
    await this.onClose(deviceId, conn);
  }

  private async onClose(deviceId: string, conn: Connection): Promise<void> {
    if (this.connections.get(deviceId) !== conn) return;
    clearTimeout(conn.timeout);
    if (this.connections.get(deviceId)?.socket === conn.socket) {
      this.connections.delete(deviceId);
      await this.writePresence(deviceId, conn, "offline");
    }
  }

  private async writePresence(deviceId: string, conn: Connection, status: "online" | "offline"): Promise<void> {
    const current = () => status === "online"
      ? this.connections.get(deviceId) === conn
      : !this.connections.has(deviceId) && this.latestOrders.get(deviceId) === conn.order;
    const write = (this.presenceWrites.get(deviceId) ?? Promise.resolve()).catch(() => {}).then(async () => {
      if (!current()) return;
      const updated = await this.devices?.setPresence(deviceId, status);
      if (current()) this.broadcastPresence(deviceId, status, updated?.lastSeen ?? null);
    });
    this.presenceWrites.set(deviceId, write);
    try { await write; } catch (error) {
      this.dependencies.reportFailure(error, deviceId, status);
      if (status === "online") throw error;
    } finally {
      if (this.presenceWrites.get(deviceId) === write) this.presenceWrites.delete(deviceId);
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
    if (!conn || !conn.presenceReady || conn.socket.readyState !== 1) return;
    const revision = ++conn.syncRevision;
    let pushedId = pushedContentId;
    if (pushedId === undefined) {
      const device = this.devices ? await this.devices.findById(deviceId) : null;
      pushedId = device?.pushedContentId ?? null;
    }
    const pushed = await this.resolveContent(pushedId ?? null);
    const playlist = await this.resolvePlaylist(deviceId);
    const msg = this.buildSync(pushed, playlist);
    if (this.connections.get(deviceId) === conn && conn.syncRevision === revision && conn.socket.readyState === 1) {
      conn.socket.send(JSON.stringify(msg));
    }
  }

  isOnline(deviceId: string): boolean {
    return this.connections.has(deviceId);
  }

  heartbeatIntervalMs(): number {
    return HEARTBEAT_INTERVAL_MS;
  }
}
