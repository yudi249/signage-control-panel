import { describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.ts";
import { createEventBus } from "./platform/events.ts";

const AUTH = {
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD_HASH: "$2b$04$WX0Y.QWBAln/wMErhaciGeZKl6h2bkMQ9d769anlyGUNto1lsWQYe", // "adminpass"
  JWT_SECRET: "test-secret-1234567890",
} as const;

async function authHeader(app: any): Promise<{ authorization: string }> {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username: "admin", password: "adminpass" },
  });
  return { authorization: `Bearer ${res.json().token}` };
}

function multipart(
  parts: Array<
    | { name: string; value: string }
    | { name: string; filename: string; contentType: string; data: Buffer }
  >,
): { body: Buffer; contentType: string } {
  const boundary = "----testboundary" + Math.random().toString(16).slice(2);
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if ("filename" in part) {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\n` +
            `Content-Type: ${part.contentType}\r\n\r\n`,
        ),
      );
      chunks.push(part.data);
      chunks.push(Buffer.from("\r\n"));
    } else {
      chunks.push(
        Buffer.from(`Content-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value}\r\n`),
      );
    }
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

function makeStorage(publicUrl = "https://cdn.test/contents/obj.png") {
  return {
    upload: vi.fn(async (_input: { bucket: string; objectName: string; data: Buffer; contentType: string }) => ({
      objectName: _input.objectName,
      publicUrl,
    })),
  };
}

async function build(storage = makeStorage()) {
  const contents = new Map<string, any>();
  const contentsService = {
    list: vi.fn(async () => Array.from(contents.values())),
    get: vi.fn(async (id: string) => {
      const c = contents.get(id);
      if (!c) throw Object.assign(new Error("Content tidak ditemukan"), { statusCode: 404, name: "AppError" });
      return c;
    }),
    findById: vi.fn(async (id: string) => contents.get(id) ?? null),
    create: vi.fn(async (input: any) => {
      const c = { id: crypto.randomUUID(), ...input, createdAt: "2026-11-11T10:00:00.000Z" };
      contents.set(c.id, c);
      return c;
    }),
    update: vi.fn(async () => null),
    delete: vi.fn(async () => false),
  };
  const app = await buildApp({
    config: { HOST: "127.0.0.1", PORT: 0, ...AUTH, SUPABASE_STORAGE_BUCKET: "contents" } as any,
    db: null,
    events: createEventBus(),
    contentsService: contentsService as any,
    storage: storage as any,
  } as any);
  return { app, contentsService, storage, contents };
}

describe("POST /api/contents/upload", () => {
  it("uploads allowed image, creates image content with public URL payload and unique object name", async () => {
    const storage = makeStorage("https://cdn.test/contents/uuid.png");
    const { app, storage: st } = await build(storage);
    const headers = await authHeader(app);
    const form = multipart([
      { name: "judul", value: "Poster" },
      { name: "file", filename: "poster.png", contentType: "image/png", data: Buffer.from("png-bytes") },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/contents/upload",
      headers: { ...headers, "content-type": form.contentType },
      payload: form.body,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.judul).toBe("Poster");
    expect(body.tipe).toBe("image");
    expect(body.payload).toBe("https://cdn.test/contents/uuid.png");
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(st.upload).toHaveBeenCalledTimes(1);
    const call = st.upload.mock.calls[0]![0];
    expect(call.bucket).toBe("contents");
    expect(call.contentType).toBe("image/png");
    expect(call.objectName).toMatch(/^[0-9a-f-]{36}\.png$/i);
    await app.close();
  });

  it("rejects invalid mime, oversized file, and missing file with clear errors", async () => {
    const { app, storage } = await build();
    const headers = await authHeader(app);

    const badMime = multipart([
      { name: "judul", value: "Doc" },
      { name: "file", filename: "doc.pdf", contentType: "application/pdf", data: Buffer.from("pdf") },
    ]);
    const r1 = await app.inject({ method: "POST", url: "/api/contents/upload", headers: { ...headers, "content-type": badMime.contentType }, payload: badMime.body });
    expect(r1.statusCode).toBe(400);
    expect(r1.json().message).toMatch(/(MIME|tipe|format|didukung)/i);

    const big = multipart([
      { name: "judul", value: "Big" },
      { name: "file", filename: "big.mp4", contentType: "video/mp4", data: Buffer.alloc(50 * 1024 * 1024 + 1, 1) },
    ]);
    const r2 = await app.inject({ method: "POST", url: "/api/contents/upload", headers: { ...headers, "content-type": big.contentType }, payload: big.body });
    expect(r2.statusCode).toBe(400);
    expect(r2.json().message).toMatch(/(ukuran|50 ?MB|besar)/i);

    const missing = multipart([{ name: "judul", value: "No file" }]);
    const r3 = await app.inject({ method: "POST", url: "/api/contents/upload", headers: { ...headers, "content-type": missing.contentType }, payload: missing.body });
    expect(r3.statusCode).toBe(400);
    expect(r3.json().message).toMatch(/(file|berkas|gambar|video)/i);

    expect(storage.upload).not.toHaveBeenCalled();
    await app.close();
  });

  it("keeps existing text/URL content creation and listing working", async () => {
    const { app, contentsService } = await build();
    const headers = await authHeader(app);
    const created = await app.inject({
      method: "POST",
      url: "/api/contents",
      headers,
      payload: { judul: "Teks", tipe: "text", payload: "halo" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ judul: "Teks", tipe: "text", payload: "halo" });
    const list = await app.inject({ method: "GET", url: "/api/contents", headers });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(1);
    expect(contentsService.create).toHaveBeenCalled();
    await app.close();
  });
});
