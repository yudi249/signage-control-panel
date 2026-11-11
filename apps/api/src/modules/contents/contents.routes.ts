import { createContentSchema, updateContentSchema } from "@signage/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError } from "../../platform/errors.ts";
import type { ContentsService } from "./contents.service.ts";

const idParams = z.object({ id: z.string().uuid() });

export interface ContentsRoutesOptions {
  service: ContentsService;
}

export const contentsRoutes: FastifyPluginAsync<ContentsRoutesOptions> = async (app, opts) => {
  const { service } = opts;

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

  app.get("/contents", async () => service.list());

  app.post("/contents", async (req, reply) => {
    const body = createContentSchema.parse(req.body);
    const content = await service.create(body);
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
    await service.delete(id);
    return reply.status(204).send();
  });
};
