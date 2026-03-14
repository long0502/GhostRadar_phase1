"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GridRepository = void 0;
const prisma_1 = require("../db/prisma");
class GridRepository {
    async getCache(gridId) {
        return prisma_1.prisma.grid_cache.findUnique({ where: { grid_id: gridId } });
    }
    async upsertCache(gridId, expiresAt, payload) {
        await prisma_1.prisma.grid_cache.upsert({
            where: { grid_id: gridId },
            update: {
                data: payload,
                expires_at: expiresAt,
            },
            create: {
                grid_id: gridId,
                data: payload,
                expires_at: expiresAt,
            },
        });
    }
}
exports.GridRepository = GridRepository;
