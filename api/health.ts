import { createApiFunction } from "../server/vercel.ts";

/** GET /api/health */
export default createApiFunction("/api/health");
