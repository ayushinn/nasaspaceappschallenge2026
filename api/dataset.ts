import { createApiFunction } from "../server/vercel.ts";

/** GET /api/dataset?ra&dec&fov&det&release */
export default createApiFunction("/api/dataset");
