import type { FastifyPluginAsync } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import { contentsRoutes } from "./contents.routes.ts";
import { ContentsRepository } from "./contents.repository.ts";
import { ContentsService } from "./contents.service.ts";
import { SupabaseContentStorage, type ContentStorage } from "./contents.storage.ts";

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

export interface ContentsModuleOptions {
  db: SupabaseClient | null;
  service?: ContentsService;
  storage?: ContentStorage | null;
  bucket?: string;
  playlistsService?: PlaylistsIntegrityApi | null;
  devicesService?: DevicesIntegrityApi | null;
  presenceService?: PresenceNotifyApi | null;
}

export const contentsModule: FastifyPluginAsync<ContentsModuleOptions> = async (app, opts) => {
  const service = opts.service ?? (opts.db ? new ContentsService(new ContentsRepository(opts.db)) : null);
  if (!service) {
    app.all("/contents*", async (_req, reply) =>
      reply.status(503).send({ message: "Database belum dikonfigurasi (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY)" }),
    );
    return;
  }
  const storage =
    opts.storage !== undefined
      ? opts.storage
      : opts.db
        ? new SupabaseContentStorage(opts.db)
        : null;
  await app.register(contentsRoutes, {
    service,
    storage: storage ?? null,
    bucket: opts.bucket ?? "contents",
    playlistsService: opts.playlistsService ?? null,
    devicesService: opts.devicesService ?? null,
    presenceService: opts.presenceService ?? null,
  });
};

export { ContentsRepository, ContentsService };
export { SupabaseContentStorage, createObjectName } from "./contents.storage.ts";
export type { ContentStorage, UploadInput, UploadResult } from "./contents.storage.ts";
