"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = gridCacheRoutes;
const db_1 = require("../db");
const zod_1 = require("zod");
async function gridCacheRoutes(app, opts) {
    app.get('/', async (request) => {
        const schema = zod_1.z.object({ grid_id: zod_1.z.string() });
        const params = schema.parse(request.query);
        const cache = await db_1.prisma.grid_cache.findUnique({ where: { grid_id: params.grid_id } });
        if (!cache)
            throw app.httpErrors.notFound('Not found');
        return cache;
    });
}
