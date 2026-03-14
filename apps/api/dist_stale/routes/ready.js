"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = readyRoutes;
const db_1 = require("../db");
async function readyRoutes(app, opts) {
    app.get('/', async () => {
        const timeoutMs = 800;
        await Promise.race([
            db_1.prisma.$queryRaw `SELECT 1`,
            new Promise((_, reject) => {
                setTimeout(() => reject(app.httpErrors.serviceUnavailable('Database not ready')), timeoutMs);
            }),
        ]);
        return { status: 'ready' };
    });
}
