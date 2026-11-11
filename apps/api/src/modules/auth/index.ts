import fastifyJwt from "@fastify/jwt";
import { adminLoginRequestSchema, adminLoginResponseSchema } from "@signage/shared";
import bcrypt from "bcryptjs";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { Config } from "../../platform/config.ts";
import { AppError, unauthorized } from "../../platform/errors.ts";

export interface AuthModuleOptions {
  config: Config;
}

export async function verifyAdminRequest(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    throw unauthorized("Token tidak valid atau kedaluwarsa");
  }
}

export const authModule: FastifyPluginAsync<AuthModuleOptions> = async (app, opts) => {
  const { config } = opts;

  app.post("/auth/login", async (req, reply) => {
    const body = adminLoginRequestSchema.parse(req.body ?? {});
    const usernameOk = config.ADMIN_USERNAME && body.username === config.ADMIN_USERNAME;
    const passwordOk =
      usernameOk &&
      !!config.ADMIN_PASSWORD_HASH &&
      bcrypt.compareSync(body.password, config.ADMIN_PASSWORD_HASH);
    if (!usernameOk || !passwordOk) {
      return reply.status(401).send({ message: "Nama pengguna atau kata sandi salah" });
    }
    const token = app.jwt.sign({ role: "admin", username: body.username }, { expiresIn: "30m" });
    return reply.send(adminLoginResponseSchema.parse({ token }));
  });
};

export function verifyAdminTokenString(app: { jwt: { verify: (t: string) => unknown } }, token: string): boolean {
  try {
    app.jwt.verify(token);
    return true;
  } catch {
    return false;
  }
}
