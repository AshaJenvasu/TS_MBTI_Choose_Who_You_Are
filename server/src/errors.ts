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

/**
 * The one error body of the API: `{ error: { code, message } }` and nothing else.
 * Generic so the code keeps its literal type ("INVALID_PAGE", not string). A route
 * handler that returns it with a code the route's response schema does not list
 * fails `tsc`. A `defaultHook` is NOT checked (zod-openapi types its return as
 * `any`), so codes returned from hooks are guarded only by src/error-responses.test.ts.
 * Knows no context's codes.
 */
export function errorBody<C extends string>(
  code: C,
  message: string,
): { error: { code: C; message: string } } {
  return { error: { code, message } };
}

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
