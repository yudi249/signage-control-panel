import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

const migrationsDir = path.resolve("supabase/migrations");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment ${name} belum diisi. Lihat .env.example.`);
  }
  return value;
}

async function main(): Promise<void> {
  const databaseUrl = requireEnv("DATABASE_URL");
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("Tidak ada file migrasi di supabase/migrations.");
    return;
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`
      create table if not exists public.schema_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      );
    `);

    for (const file of files) {
      const applied = await client.query(
        "select 1 from public.schema_migrations where name = $1",
        [file],
      );
      if ((applied.rowCount ?? 0) > 0) {
        console.log(`skip  ${file}`);
        continue;
      }

      const sql = await readFile(path.join(migrationsDir, file), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query(
          "insert into public.schema_migrations (name) values ($1)",
          [file],
        );
        await client.query("commit");
        console.log(`apply ${file}`);
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Migrasi gagal: ${message}`);
  process.exitCode = 1;
});
