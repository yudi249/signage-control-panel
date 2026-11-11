import { z } from "zod";

const envSchema = z.object({
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(3000),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  ADMIN_USERNAME: z.string().min(1).optional(),
  ADMIN_PASSWORD_HASH: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(1).optional(),
});

export type Config = z.infer<typeof envSchema>;

/** Membaca environment. Supabase opsional agar /health bisa jalan tanpa kredensial (tahap 1). */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Environment tidak valid: ${detail}`);
  }
  return parsed.data;
}
