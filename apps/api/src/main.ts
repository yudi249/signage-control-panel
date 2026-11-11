import { buildApp } from "./app.ts";
import { loadConfig } from "./platform/config.ts";
import { createEventBus } from "./platform/events.ts";
import { createDb } from "./platform/supabase.ts";

async function main(): Promise<void> {
  const config = loadConfig();
  const events = createEventBus();
  const db =
    config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY
      ? createDb({
          SUPABASE_URL: config.SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: config.SUPABASE_SERVICE_ROLE_KEY,
        })
      : null;

  const app = await buildApp({ config, db, events });
  const address = await app.listen({ host: config.HOST, port: config.PORT });
  app.log.info({ address, supabase: db !== null }, "api listening");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
