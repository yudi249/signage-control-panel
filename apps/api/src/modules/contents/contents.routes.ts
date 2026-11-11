import {
  ALLOWED_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
  createContentSchema,
  updateContentSchema,
  uploadContentTypeForMime,
} from "@signage/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError, badRequest } from "../../platform/errors.ts";
import type { ContentsService } from "./contents.service.ts";
import { createObjectName, type ContentStorage } from "./contents.storage.ts";

const idParams = z.object({ id: z.string().uuid() });

interface PlaylistsIntegrityApi {
  isContentReferenced?(contentId: string): Promise<boolean>;
}

interface DevicesIntegrityApi {
  listPushedByContent?(contentId: string): Promise<Array<{ id: string }>>;
  setActiveContent?(id: string, pushedContentId: string | null): Promise<unknown | null>;
}

interface PresenceNotifyApi {
  sendSync(deviceId: string): Promise<void>;
}

export interface ContentsRoutesOptions {
  service: ContentsService;
  storage?: ContentStorage | null;
  bucket?: string;
  playlistsService?: PlaylistsIntegrityApi | null;
  devicesService?: DevicesIntegrityApi | null;
  presenceService?: PresenceNotifyApi | null;
}

interface ParsedPart {
  name: string;
  value?: string;
  filename?: string;
  contentType?: string;
  data?: Buffer;
}

function getBoundary(contentType: string | undefined): string | null {
  if (!contentType) return null;
  const m = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

function parseMultipart(body: Buffer, boundary: string): ParsedPart[] {
  const parts: ParsedPart[] = [];
  const delimiter = Buffer.from(`--${boundary}`);
  let start = body.indexOf(delimiter);
  while (start !== -1) {
    start += delimiter.length;
    if (body.slice(start, start + 2).toString() === "--") break;
    if (body.slice(start, start + 2).toString() === "\r\n") start += 2;
    const headerEnd = body.indexOf("\r\n\r\n", start);
    if (headerEnd === -1) break;
    const headerText = body.slice(start, headerEnd).toString("utf8");
    const contentStart = headerEnd + 4;
    const next = body.indexOf(delimiter, contentStart);
    if (next === -1) break;
    let contentEnd = next;
    if (body.slice(contentEnd - 2, contentEnd).toString() === "\r\n") contentEnd -= 2;
    const data = body.slice(contentStart, contentEnd);
    const nameMatch = headerText.match(/name="([^"]*)"/i);
    const filenameMatch = headerText.match(/filename="([^"]*)"/i);
    const ctMatch = headerText.match(/Content-Type:\s*([^\r\n]+)/i);
    const name = nameMatch?.[1] ?? "";
    if (filenameMatch) {
      parts.push({
        name,
        filename: filenameMatch[1],
        contentType: (ctMatch?.[1] ?? "").trim().toLowerCase(),
        data,
      });
    } else {
      parts.push({ name, value: data.toString("utf8") });
    }
    start = next;
  }
  return parts;
}

export const contentsRoutes: FastifyPluginAsync<ContentsRoutesOptions> = async (app, opts) => {
  const { service, storage, bucket = "contents", playlistsService, devicesService, presenceService } = opts;

  app.addContentTypeParser(
    "multipart/form-data",
    { parseAs: "buffer", bodyLimit: MAX_UPLOAD_SIZE_BYTES + 1024 * 1024 },
    (_req, body, done) => {
      done(null, body);
    },
  );

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ message: error.message });
    }
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: "Data tidak valid", issues: error.issues });
    }
    const err = error as any;
    if (err?.code === "FST_ERR_CTP_BODY_TOO_LARGE" || err?.statusCode === 413) {
      return reply.status(400).send({ message: "Ukuran file melebihi batas 50 MB" });
    }
    const message = error instanceof Error ? error.message : "Terjadi kesalahan";
    return reply.status(500).send({ message });
  });

  app.get("/contents", async () => service.list());

  app.post("/contents", async (req, reply) => {
    const body = createContentSchema.parse(req.body);
    const content = await service.create(body);
    return reply.status(201).send(content);
  });

  app.post("/contents/upload", async (req, reply) => {
    if (!storage) {
      throw new AppError(503, "Storage upload belum dikonfigurasi");
    }
    const boundary = getBoundary(req.headers["content-type"]);
    if (!boundary || !Buffer.isBuffer(req.body)) {
      throw new AppError(400, "Format upload tidak valid");
    }
    const parts = parseMultipart(req.body, boundary);
    const judulRaw = parts.find((p) => p.name === "judul")?.value ?? "";
    const judul = judulRaw.trim();
    if (!judul) throw new AppError(400, "Judul wajib diisi");
    const filePart = parts.find((p) => p.name === "file" && p.filename);
    if (!filePart || !filePart.data || !filePart.filename) {
      throw new AppError(400, "File gambar atau video wajib diunggah");
    }
    const mime = (filePart.contentType || "").toLowerCase();
    const tipe = uploadContentTypeForMime(mime);
    if (!tipe || !ALLOWED_UPLOAD_MIME_TYPES.includes(mime as any)) {
      throw new AppError(400, "Tipe file tidak didukung. Gunakan gambar (jpeg, png, webp, gif) atau video (mp4, webm)");
    }
    if (filePart.data.length > MAX_UPLOAD_SIZE_BYTES) {
      throw new AppError(400, "Ukuran file melebihi batas 50 MB");
    }
    const objectName = createObjectName(filePart.filename, mime);
    const uploaded = await storage.upload({
      bucket,
      objectName,
      data: filePart.data,
      contentType: mime,
    });
    const content = await service.create({
      judul,
      tipe,
      payload: uploaded.publicUrl,
    });
    return reply.status(201).send(content);
  });

  app.get("/contents/:id", async (req) => {
    const { id } = idParams.parse(req.params);
    return service.get(id);
  });

  app.patch("/contents/:id", async (req) => {
    const { id } = idParams.parse(req.params);
    const body = updateContentSchema.parse(req.body);
    return service.update(id, body);
  });

  app.delete("/contents/:id", async (req, reply) => {
    const { id } = idParams.parse(req.params);

    if (playlistsService?.isContentReferenced && await playlistsService.isContentReferenced(id)) {
      throw badRequest("Content masih digunakan di playlist. Lepas Content dari semua playlist terlebih dahulu sebelum menghapus.");
    }

    let affectedDeviceIds: string[] = [];
    if (devicesService?.listPushedByContent) {
      const pushedDevices = await devicesService.listPushedByContent(id);
      if (pushedDevices.length > 0) {
        for (const device of pushedDevices) {
          if (devicesService.setActiveContent) {
            await devicesService.setActiveContent(device.id, null);
          }
          affectedDeviceIds.push(device.id);
        }
      }
    }

    await service.delete(id);

    if (affectedDeviceIds.length > 0 && presenceService?.sendSync) {
      await Promise.all(affectedDeviceIds.map((deviceId) => presenceService.sendSync(deviceId)));
    }

    return reply.status(204).send();
  });
};
