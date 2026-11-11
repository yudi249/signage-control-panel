import { z } from "zod";

export const adminLoginRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type AdminLoginRequest = z.infer<typeof adminLoginRequestSchema>;

export const adminLoginResponseSchema = z.object({
  token: z.string().min(1),
});
export type AdminLoginResponse = z.infer<typeof adminLoginResponseSchema>;
