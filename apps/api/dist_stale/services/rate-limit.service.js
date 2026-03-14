"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitExceededError = void 0;
exports.enforceRouteRateLimit = enforceRouteRateLimit;
const metrics_1 = require("../core/metrics");
const env_1 = require("../utils/env");
const UUID_V4ISH_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const counters = new Map();
class RateLimitExceededError extends Error {
    constructor(message, details) {
        super(message);
        this.statusCode = 429;
        this.code = 'RATE_LIMITED';
        this.details = details;
    }
}
exports.RateLimitExceededError = RateLimitExceededError;
function getLimitForRoute(route) {
    return route === 'scan' ? (0, env_1.getScanRateLimitMax)() : (0, env_1.getExpandRateLimitMax)();
}
function getCounterKey(route, dimension, value) {
    return `${route}:${dimension}:${value}`;
}
function normalizeClientId(headerValue) {
    if (typeof headerValue !== 'string') {
        return null;
    }
    const trimmed = headerValue.trim();
    if (!UUID_V4ISH_REGEX.test(trimmed)) {
        return null;
    }
    return trimmed.toLowerCase();
}
function consumeRateLimit(key, limit, now) {
    const windowMs = (0, env_1.getRateLimitWindowMs)();
    const current = counters.get(key);
    if (!current || current.resetAt <= now) {
        const next = {
            count: 1,
            resetAt: now + windowMs,
        };
        counters.set(key, next);
        return {
            limit,
            count: next.count,
            remaining: Math.max(0, limit - next.count),
            resetAt: next.resetAt,
            exceeded: next.count > limit,
        };
    }
    current.count += 1;
    return {
        limit,
        count: current.count,
        remaining: Math.max(0, limit - current.count),
        resetAt: current.resetAt,
        exceeded: current.count > limit,
    };
}
function setRateHeaders(reply, result) {
    const retryAfterSeconds = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
    reply.header('X-RateLimit-Limit', String(result.limit));
    reply.header('X-RateLimit-Remaining', String(result.remaining));
    reply.header('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));
    reply.header('Retry-After', String(retryAfterSeconds));
}
function enforceRouteRateLimit(request, reply, route) {
    const now = Date.now();
    const limit = getLimitForRoute(route);
    const ip = request.ip;
    const clientId = normalizeClientId(request.headers['x-client-id']);
    const results = [
        {
            dimension: 'ip',
            value: ip,
            result: consumeRateLimit(getCounterKey(route, 'ip', ip), limit, now),
        },
    ];
    if (clientId) {
        results.push({
            dimension: 'client',
            value: clientId,
            result: consumeRateLimit(getCounterKey(route, 'client', clientId), limit, now),
        });
    }
    const strictest = results.reduce((acc, entry) => entry.result.remaining < acc.result.remaining ? entry : acc);
    setRateHeaders(reply, strictest.result);
    const limited = results.find((entry) => entry.result.exceeded);
    if (!limited) {
        return;
    }
    metrics_1.globalStats.rate_limited_count += 1;
    request.__obs = {
        ...(request.__obs ?? {}),
        rate_limited: true,
    };
    throw new RateLimitExceededError('Too many requests. Try again soon.', {
        route,
        dimension: limited.dimension,
        limit: limited.result.limit,
        reset_at: new Date(limited.result.resetAt).toISOString(),
    });
}
