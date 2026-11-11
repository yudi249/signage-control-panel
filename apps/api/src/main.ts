import { startServer } from "./startup.ts";
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

  await startServer({ config, db, events });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
