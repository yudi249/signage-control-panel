import { createDeviceSchema, pushRequestSchema, updateDeviceSchema } from "@signage/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError, notFound } from "../../platform/errors.ts";
import type { DevicesService } from "./devices.service.ts";

const idParams = z.object({ id: z.string().uuid() });

interface ContentsLookup {
  get?(id: string): Promise<unknown>;
  findById?(id: string): Promise<unknown>;
}

interface PresenceNotifier {
  sendSync(deviceId: string, pushedContentId?: string | null): Promise<void>;
  disconnectDevice?(deviceId: string, reason?: string): Promise<void> | void;
}

export interface DevicesRoutesOptions {
  service: DevicesService;
  contentsService?: ContentsLookup | null;
  presenceService?: PresenceNotifier | null;
}

export const devicesRoutes: FastifyPluginAsync<DevicesRoutesOptions> = async (app, opts) => {
  const { service, contentsService, presenceService } = opts;

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

  app.get("/devices", async () => service.list());

  app.post("/devices", async (req, reply) => {
    const body = createDeviceSchema.parse(req.body);
    const deviceWithToken = await service.createWithToken(body);
    return reply.status(201).send(deviceWithToken);
  });

  app.get("/devices/:id", async (req) => {
    const { id } = idParams.parse(req.params);
    return service.get(id);
  });

  app.patch("/devices/:id", async (req) => {
    const { id } = idParams.parse(req.params);
    const body = updateDeviceSchema.parse(req.body);
    return service.update(id, body);
  });

  app.delete("/devices/:id", async (req, reply) => {
    const { id } = idParams.parse(req.params);
    await service.delete(id);
    return reply.status(204).send();
  });

  app.post("/devices/:id/token", async (req) => {
    const { id } = idParams.parse(req.params);
    const rotated = await service.rotateToken(id);
    if (presenceService?.disconnectDevice) {
      await presenceService.disconnectDevice(id, "Token perangkat dirotasi");
    }
    return rotated;
  });

  app.post("/devices/:id/push", async (req) => {
    const { id } = idParams.parse(req.params);
    const { contentId } = pushRequestSchema.parse(req.body);
    const device = await service.findById(id);
    if (!device) throw notFound("Device");
    if (!contentsService) throw notFound("Content");
    const content = contentsService.findById
      ? await contentsService.findById(contentId)
      : await contentsService.get!(contentId).catch((e) => {
          if (e instanceof AppError && e.statusCode === 404) return null;
          throw e;
        });
    if (!content) throw notFound("Content");
    const updated = await service.setActiveContent(id, contentId);
    if (!updated) throw notFound("Device");
    if (presenceService) await presenceService.sendSync(id);
    return updated;
  });

  app.delete("/devices/:id/push", async (req) => {
    const { id } = idParams.parse(req.params);
    const device = await service.findById(id);
    if (!device) throw notFound("Device");
    const updated = await service.setActiveContent(id, null);
    if (!updated) throw notFound("Device");
    if (presenceService) await presenceService.sendSync(id);
    return updated;
  });
};
