"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = scanRoutes;
const crypto_1 = require("crypto");
const db_1 = require("../db");
function toNumber(value) {
    if (typeof value === 'number')
        return value;
    if (typeof value === 'string' && value.trim().length > 0)
        return Number(value);
    return Number.NaN;
}
function buildStubEvents(lat, lon, grid_id) {
    return Array.from({ length: 5 }, () => {
        const latOffset = (Math.random() - 0.5) * 0.01;
        const lonOffset = (Math.random() - 0.5) * 0.01;
        return {
            id: (0, crypto_1.randomUUID)(),
            title: `Incident near ${grid_id}`,
            lat: Number((lat + latOffset).toFixed(6)),
            lon: Number((lon + lonOffset).toFixed(6)),
            summary: 'Stub event for Phase 1',
            created_at: new Date().toISOString(),
        };
    });
}
async function scanRoutes(app, opts) {
    app.get('/', async (request, reply) => {
        if (process.env.TEST_CRASH === "1") {
            throw new Error("Test 500 crash");
        }
        const query = request.query;
        const lat = toNumber(query.lat);
        const lon = toNumber(query.lon);
        const radiusKm = toNumber(query.radiusKm);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(radiusKm)) {
            throw app.httpErrors.badRequest('lat, lon, radiusKm must be valid numbers');
        }
        const gridLat = lat.toFixed(2);
        const gridLon = lon.toFixed(2);
        const grid_id = `${gridLat}_${gridLon}`;
        const now = new Date();
        const cached = await db_1.prisma.grid_cache.findUnique({ where: { grid_id } });
        if (cached !== null && cached.expires_at > now) {
            reply.header('X-Cache', 'HIT');
            const cachedData = cached.data;
            return {
                grid_id,
                events_json: cachedData.events_json ?? [],
            };
        }
        const events_json = buildStubEvents(lat, lon, grid_id);
        await db_1.prisma.events.createMany({
            data: events_json.map((event) => ({
                grid_id,
                event_type: 'stub',
                event_data: event,
            })),
        });
        await db_1.prisma.grid_cache.upsert({
            where: { grid_id },
            update: {
                data: { events_json },
                expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000),
            },
            create: {
                grid_id,
                data: { events_json },
                expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000),
            },
        });
        reply.header('X-Cache', 'MISS');
        return {
            grid_id,
            events_json,
        };
    });
}
