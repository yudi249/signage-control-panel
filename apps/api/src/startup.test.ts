import Fastify from "fastify";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createEventBus } from "./platform/events.ts";
import { startServer } from "./startup.ts";

const config = { HOST: "127.0.0.1", PORT: 0, SUPABASE_STORAGE_BUCKET: "contents" };

describe("startup Presence satu instance", () => {
  it("menggagalkan startup dengan log jelas dan menutup aplikasi jika reset database gagal", async () => {
    const db = createClient("https://test.supabase.co", "test-key", {
      global: { fetch: async () => new Response(JSON.stringify({ message: "database unavailable" }), {
        status: 503, headers: { "content-type": "application/json" },
      }) },
    });
    const app = Fastify();
    const listen = vi.spyOn(app, "listen");
    const log = vi.spyOn(app.log, "error");
    const closed = vi.fn();
    app.addHook("onClose", closed);
    await expect(startServer({ config, db, events: createEventBus() }, { buildApp: async () => app }))
      .rejects.toThrow("database unavailable");
    expect(listen).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      "Startup gagal: reset Presence Device ke Offline tidak berhasil",
    );
    expect(closed).toHaveBeenCalledOnce();
  });

  it("menunggu reset semua Device ke Offline tanpa mengubah Last Seen sebelum listen", async () => {
    const rows = [
      { id: "a", status: "online", last_seen: "2026-11-10T10:00:00.000Z" },
      { id: "b", status: "offline", last_seen: null },
    ];
    let completeReset!: () => void;
    let resetStarted!: () => void;
    const started = new Promise<void>((resolve) => { resetStarted = resolve; });
    const pending = new Promise<void>((resolve) => { completeReset = resolve; });
    const db = createClient("https://test.supabase.co", "test-key", {
      global: { fetch: async (input, init) => {
        expect(String(input)).toContain("/rest/v1/devices?");
        expect(init?.method).toBe("PATCH");
        const patch = JSON.parse(String(init?.body));
        expect(patch).toEqual({ status: "offline" });
        expect(new URL(String(input)).searchParams.get("status")).toBe("in.(online,offline)");
        resetStarted();
        await pending;
        rows.forEach((row) => Object.assign(row, patch));
        return new Response(null, { status: 204 });
      } },
    });
    const app = Fastify();
    const listen = vi.spyOn(app, "listen").mockImplementation(async () => {
      expect(rows).toEqual([
        { id: "a", status: "offline", last_seen: "2026-11-10T10:00:00.000Z" },
        { id: "b", status: "offline", last_seen: null },
      ]);
      return "http://127.0.0.1:1234";
    });
    try {
      const starting = startServer({ config, db, events: createEventBus() }, { buildApp: async () => app });
      await started;
      expect(listen).not.toHaveBeenCalled();
      completeReset();
      await starting;
      expect(listen).toHaveBeenCalledWith({ host: "127.0.0.1", port: 0 });
    } finally {
      await app.close();
    }
  });
});
