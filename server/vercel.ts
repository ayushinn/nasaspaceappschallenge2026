/**
 * Vercel Node.js function adapter for the shared API surface.
 *
 * `handleApi` is transport-agnostic, so only the plumbing differs between
 * environments: the Vite dev server calls it from `configureServer` middleware,
 * and Vercel calls it from one function per route under `api/`. Keeping the
 * plumbing here means each function file stays a one-liner and the route list
 * cannot drift from the dev server's behaviour (same status codes, same JSON
 * shape, same headers).
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { handleApi } from "./api.ts";

export type ApiFunction = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<void>;

export function createApiFunction(route: string): ApiFunction {
  return async function handler(req, res) {
    // Vercel decorates the request with helpers such as `req.query`, but the
    // plain Node type does not carry them and the URL already has the query
    // string, so both runtimes parse it the same way.
    const url = new URL(req.url ?? route, "http://localhost");
    const result = await handleApi(route, url.searchParams);
    res.statusCode = result.status;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.end(JSON.stringify(result.body));
  };
}
