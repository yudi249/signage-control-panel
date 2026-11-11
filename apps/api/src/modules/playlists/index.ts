import type { FastifyPluginAsync } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PlaylistsRepository } from "./playlists.repository.ts";
import { PlaylistsService } from "./playlists.service.ts";
import { playlistsRoutes } from "./playlists.routes.ts";

interface DeviceLookup { findById(id: string): Promise<unknown | null>; }
interface ContentLookup { findById(id: string): Promise<unknown | null>; }
interface PresenceNotifier { sendSync(deviceId: string): Promise<void>; }

export interface PlaylistsModuleOptions {
  db: SupabaseClient | null;
  devicesService?: DeviceLookup | null;
  contentsService?: ContentLookup | null;
  service?: PlaylistsService | null;
  presenceService?: PresenceNotifier | null;
}

export const playlistsModule: FastifyPluginAsync<PlaylistsModuleOptions> = async (app, opts) => {
  let service = opts.service ?? null;
  if (!service && opts.db && opts.devicesService && opts.contentsService) {
    service = new PlaylistsService(new PlaylistsRepository(opts.db), opts.devicesService, opts.contentsService);
  }
  if (!service) {
    app.all("/devices/:id/playlist", async (_req, reply) =>
      reply.status(503).send({ message: "Database belum dikonfigurasi (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY)" }),
    );
    return;
  }
  await app.register(playlistsRoutes, { service, presenceService: opts.presenceService ?? null });
};

export { PlaylistsRepository, PlaylistsService };
