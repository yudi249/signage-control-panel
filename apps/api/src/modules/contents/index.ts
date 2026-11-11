import type { FastifyPluginAsync } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import { contentsRoutes } from "./contents.routes.ts";
import { ContentsRepository } from "./contents.repository.ts";
import { ContentsService } from "./contents.service.ts";

export interface ContentsModuleOptions {
  db: SupabaseClient | null;
  service?: ContentsService;
}

export const contentsModule: FastifyPluginAsync<ContentsModuleOptions> = async (app, opts) => {
  const service = opts.service ?? (opts.db ? new ContentsService(new ContentsRepository(opts.db)) : null);
  if (!service) {
    app.all("/contents*", async (_req, reply) =>
      reply.status(503).send({ message: "Database belum dikonfigurasi (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY)" }),
    );
    return;
  }
  await app.register(contentsRoutes, { service });
};

export { ContentsRepository, ContentsService };
