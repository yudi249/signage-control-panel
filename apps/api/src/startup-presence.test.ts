import { createHash } from "node:crypto";
import { once } from "node:events";
import type { Device, SyncPlaylistItem } from "@signage/shared";
import { expect, it, vi } from "vitest";
import WebSocket from "ws";
import { buildApp } from "./app.ts";
import { startServer } from "./startup.ts";
import { createEventBus } from "./platform/events.ts";
import type { DevicesService } from "./modules/devices/index.ts";
import type { ContentsService } from "./modules/contents/index.ts";
import type { PlaylistsService } from "./modules/playlists/index.ts";

it("buildApp tidak mereset Presence; startup mereset sekali dan reconnect sah memulihkan Online serta sync terbaru", async () => {
  const device: Device = {
    id: "11111111-1111-4111-8111-111111111111", nama: "Layar", lokasi: "",
    status: "online", lastSeen: "2026-11-10T10:00:00.000Z", pushedContentId: null,
  };
  const content = {
    id: "22222222-2222-4222-8222-222222222222", judul: "Terbaru", tipe: "text" as const,
    payload: "Push saat Offline", createdAt: "2026-11-11T10:00:00.000Z",
  };
  let playlist: SyncPlaylistItem[] = [];
  const resetAllOffline = vi.fn(async () => { device.status = "offline"; });
  const devicesService = {
    resetAllOffline,
    list: async () => [{ ...device }],
    findById: async () => ({ ...device, tokenHash: createHash("sha256").update("valid-token").digest("hex") }),
    setPresence: async (_id: string, status: "online" | "offline") => {
      device.status = status;
      device.lastSeen = "2026-11-11T10:00:00.000Z";
      return { ...device };
    },
  } as unknown as DevicesService;
  const options = {
    config: { HOST: "127.0.0.1", PORT: 0, SUPABASE_STORAGE_BUCKET: "contents" }, db: null, events: createEventBus(), devicesService,
    contentsService: { findById: async () => content } as unknown as ContentsService,
    playlistsService: { get: async () => playlist } as unknown as PlaylistsService,
  };
  const app = await buildApp(options);
  expect(resetAllOffline).not.toHaveBeenCalled();
  expect(device.status).toBe("online");
  const sockets: WebSocket[] = [];
  async function connect() {
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("Server belum listen");
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws/device`);
    sockets.push(socket);
    await once(socket, "open");
    const message = once(socket, "message");
    socket.send(JSON.stringify({ type: "hello", deviceId: device.id, token: "valid-token" }));
    const [raw] = await message;
    expect(device.status).toBe("online");
    return { socket, sync: JSON.parse(String(raw)) };
  }
  async function disconnect(socket: WebSocket) {
    const closed = once(socket, "close");
    socket.close();
    await closed;
    await vi.waitFor(() => expect(device.status).toBe("offline"));
  }
  try {
    await startServer(options, { buildApp: async () => app });
    expect(device).toMatchObject({ status: "offline", lastSeen: "2026-11-10T10:00:00.000Z" });
    device.pushedContentId = content.id;
    const first = await connect();
    expect(first.sync).toMatchObject({ type: "sync", mode: "push", pushed: content });
    await disconnect(first.socket);

    // Release dan perubahan Playlist saat Offline harus masuk ke sync berikutnya.
    device.pushedContentId = null;
    playlist = [{ position: 0, durationSeconds: 10, content }];
    const second = await connect();
    expect(second.sync).toMatchObject({ type: "sync", mode: "playlist", pushed: null, playlist });
    expect(resetAllOffline).toHaveBeenCalledOnce();
    await disconnect(second.socket);
  } finally {
    sockets.forEach((socket) => socket.terminate());
    await app.close();
  }
});
