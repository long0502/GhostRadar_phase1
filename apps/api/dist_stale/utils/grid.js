"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeGridId = computeGridId;
exports.computeScanGridId = computeScanGridId;
const crypto_1 = require("crypto");
function computeGridId(lat, lon) {
    return `${lat.toFixed(2)}_${lon.toFixed(2)}`;
}
function computeScanGridId(lat, lon, radiusKm) {
    const roundedLat = lat.toFixed(2);
    const roundedLon = lon.toFixed(2);
    const roundedRadius = radiusKm.toFixed(2);
    const base = `${roundedLat}:${roundedLon}:${roundedRadius}`;
    return (0, crypto_1.createHash)('sha256').update(base).digest('hex').slice(0, 20);
}
