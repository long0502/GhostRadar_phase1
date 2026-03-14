"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildStubEvents = buildStubEvents;
const crypto_1 = require("crypto");
function buildStubEvents(lat, lon, gridId) {
    return Array.from({ length: 5 }, () => {
        const latOffset = (Math.random() - 0.5) * 0.01;
        const lonOffset = (Math.random() - 0.5) * 0.01;
        return {
            id: (0, crypto_1.randomUUID)(),
            title: `Incident near ${gridId}`,
            lat: Number((lat + latOffset).toFixed(6)),
            lon: Number((lon + lonOffset).toFixed(6)),
            summary: 'Stub event for Phase 1',
            created_at: new Date().toISOString(),
        };
    });
}
