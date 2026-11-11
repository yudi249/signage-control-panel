import { replacePlaylistRequestSchema } from "@signage/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError } from "../../platform/errors.ts";
import type { PlaylistsService } from "./playlists.service.ts";

const idParams = z.object({ id: z.string().uuid() });

interface PresenceNotifier {
  sendSync(deviceId: string): Promise<void>;
}

export interface PlaylistsRoutesOptions {
  service: PlaylistsService;
  presenceService?: PresenceNotifier | null;
}

export const playlistsRoutes: FastifyPluginAsync<PlaylistsRoutesOptions> = async (app, opts) => {
  const { service, presenceService } = opts;

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ message: error.message });
    }
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ message: "Data tidak valid", issues: error.issues });
    }
    const message = error instanceof Error ? error.message : "Terjadi kesalahan";
    return reply.status(500).send({ message });
  });

  app.get("/devices/:id/playlist", async (req) => {
    const { id } = idParams.parse(req.params);
    return service.get(id);
  });

  app.put("/devices/:id/playlist", async (req) => {
    const { id } = idParams.parse(req.params);
    const body = replacePlaylistRequestSchema.parse(req.body);
    const result = await service.replace(id, body);
    if (presenceService) await presenceService.sendSync(id);
    return result;
  });
};
