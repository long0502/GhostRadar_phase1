"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeExpirationTimestamp = computeExpirationTimestamp;
function computeExpirationTimestamp(now, ttlSeconds) {
    return new Date(now.getTime() + ttlSeconds * 1000);
}
