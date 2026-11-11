declare module "@fastify/jwt" {
  import { FastifyPluginCallback } from "fastify";
  const fastifyJwt: FastifyPluginCallback<{ secret: string }>;
  export default fastifyJwt;
}
declare module "bcryptjs" {
  export function compareSync(data: string, encrypted: string): boolean;
  export function hashSync(data: string): string;
}
/* augmentation handled via casts in source */