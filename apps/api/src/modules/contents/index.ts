import type { FastifyPluginAsync } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import { contentsRoutes } from "./contents.routes.ts";
import { ContentsRepository } from "./contents.repository.ts";
import { ContentsService } from "./contents.service.ts";

export interface ContentsModuleOptions {
  db: SupabaseClient | null;
}

export const contentsModule: FastifyPluginAsync<ContentsModuleOptions> = async (app, opts) => {
  if (!opts.db) {
    app.all("/contents*", async (_req, reply) =>
      reply.status(503).send({ message: "Database belum dikonfigurasi (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY)" }),
    );
    return;
  }
  const repo = new ContentsRepository(opts.db);
  const service = new ContentsService(repo);
  await app.register(contentsRoutes, { service });
};

export { ContentsRepository, ContentsService };
