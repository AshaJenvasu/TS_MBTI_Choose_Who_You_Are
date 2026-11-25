import { z } from "@hono/zod-openapi";
import type { AuthUser } from "../middleware/require-auth";

/** Public profile of the signed-in user. Whitelist: nothing else from the user row leaves. */
export const MeResponse = z
  .object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    image: z.string().nullable(),
  })
  .openapi("MeResponse");

export type Me = z.infer<typeof MeResponse>;

/** Maps Better Auth's user to the whitelisted DTO (never spread the raw object). */
export const toMe = (user: AuthUser): Me => ({
  id: user.id,
  email: user.email,
  name: user.name,
  image: user.image ?? null,
});
