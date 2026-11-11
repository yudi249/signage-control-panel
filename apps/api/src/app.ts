import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import fastifyJwt from "@fastify/jwt";
import { authModule, verifyAdminRequest } from "./modules/auth/index.ts";
import { contentsModule, ContentsRepository, ContentsService } from "./modules/contents/index.ts";
import type { ContentStorage } from "./modules/contents/index.ts";
import { devicesModule, DevicesRepository, DevicesService } from "./modules/devices/index.ts";
import { playlistsModule, PlaylistsRepository, PlaylistsService } from "./modules/playlists/index.ts";
import { presenceModule, PresenceService } from "./modules/presence/index.ts";
import type { Config } from "./platform/config.ts";
import { AppError } from "./platform/errors.ts";
import type { EventBus } from "./platform/events.ts";
import type { Db } from "./platform/supabase.ts";

export interface BuildAppOptions {
  config: Config;
  db: Db | null;
  events: EventBus;
  devicesService?: DevicesService | null;
  contentsService?: ContentsService | null;
  playlistsService?: PlaylistsService | null;
  presenceService?: PresenceService | null;
  storage?: ContentStorage | null;
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  await app.register(websocket);
  if (opts.config.JWT_SECRET) {
    await app.register(fastifyJwt, { secret: opts.config.JWT_SECRET });
  }

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ message: error.message });
    }
    const err = error as any;
    if (err?.name === "ZodError") {
      return reply.status(400).send({ message: "Data tidak valid", issues: err.issues });
    }
    if (err?.statusCode === 401 || err?.code === "FST_JWT_NO_AUTHORIZATION_IN_HEADER" || err?.code === "FST_JWT_AUTHORIZATION_TOKEN_INVALID" || err?.code === "FST_JWT_AUTHORIZATION_TOKEN_EXPIRED") {
      return reply.status(401).send({ message: "Token tidak valid atau kedaluwarsa" });
    }
    const message = error instanceof Error ? error.message : "Terjadi kesalahan";
    return reply.status(500).send({ message });
  });

  app.addHook("onRequest", async (request, reply) => {
    const url = request.raw.url ?? "";
    if (!url.startsWith("/api/")) return;
    if (url === "/api/auth/login") return;
    if (!opts.config.JWT_SECRET) return; // auth not configured (e.g. legacy contexts)
    await verifyAdminRequest(request, reply);
  });

  app.get("/health", async () => ({ status: "ok" }));

  const devicesService =
    opts.devicesService !== undefined
      ? opts.devicesService
      : opts.db
        ? new DevicesService(new DevicesRepository(opts.db))
        : null;

  const contentsService =
    opts.contentsService !== undefined
      ? opts.contentsService
      : opts.db
        ? new ContentsService(new ContentsRepository(opts.db))
        : null;

  const playlistsService =
    opts.playlistsService !== undefined
      ? opts.playlistsService
      : opts.db && devicesService && contentsService
        ? new PlaylistsService(new PlaylistsRepository(opts.db), devicesService, contentsService)
        : null;

  const presenceService =
    opts.presenceService !== undefined
      ? opts.presenceService
      : devicesService || opts.db
        ? new PresenceService(app, opts.db, devicesService, contentsService, playlistsService)
        : null;

  await app.register(authModule, { prefix: "/api", config: opts.config });
  await app.register(devicesModule, {
    prefix: "/api",
    db: opts.db,
    service: devicesService ?? undefined,
    contentsService,
    presenceService,
  });
  await app.register(contentsModule, {
    prefix: "/api",
    db: opts.db,
    service: contentsService ?? undefined,
    storage: opts.storage ?? undefined,
    bucket: opts.config.SUPABASE_STORAGE_BUCKET ?? "contents",
  });
  await app.register(playlistsModule, {
    prefix: "/api",
    db: opts.db,
    devicesService,
    contentsService,
    service: playlistsService ?? undefined,
    presenceService,
  });

  await app.register(presenceModule, {
    db: opts.db,
    events: opts.events,
    devicesService,
    contentsService,
    playlistsService,
    service: presenceService ?? undefined,
  });

  void opts.config;
  return app;
}
