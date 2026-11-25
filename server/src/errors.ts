import { z } from "@hono/zod-openapi";
import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";

/**
 * Shape of the 401 response from `requireAuth`. Shared: any protected route lists it under
 * `responses[401]`. One fixed body for every reason (no cookie, expired, revoked, tampered).
 */
export const UnauthorizedResponse = z
  .object({
    error: z.object({
      code: z.literal("UNAUTHORIZED"),
      message: z.string(),
    }),
  })
  .openapi("UnauthorizedResponse");

/** Shape of the 500 response. Shared: any route can list it under `responses[500]`. */
export const InternalServerErrorResponse = z
  .object({
    error: z.object({
      code: z.literal("INTERNAL_SERVER_ERROR"),
      message: z.string(),
    }),
  })
  .openapi("InternalServerErrorResponse");

/**
 * Global error handler, shared by the whole app (and by routers that mount their own
 * onError, since Hono routes a sub-app's errors to the sub-app's handler first).
 * Every unhandled error becomes { error: { code, message } } with status 500.
 * The real error is only logged; its message never reaches the client.
 */
export const globalErrorHandler: ErrorHandler = (err, c) => {
  // Hono's own HTTP errors (e.g. thrown with a specific status) keep their response.
  if (err instanceof HTTPException) return err.getResponse();

  console.error(err);
  return c.json(
    {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred",
      },
    },
    500,
  );
};
