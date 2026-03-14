"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiDailyQuotaExceededError = void 0;
exports.isAiDailyQuotaExceededError = isAiDailyQuotaExceededError;
exports.getUtcUsageDate = getUtcUsageDate;
exports.getClientIp = getClientIp;
exports.ensureAiQuotaPolicyDefaults = ensureAiQuotaPolicyDefaults;
exports.reserveAiQuotaForRequest = reserveAiQuotaForRequest;
exports.enforceAiQuotaForRequest = enforceAiQuotaForRequest;
exports.recordAiUsageTokens = recordAiUsageTokens;
exports.getTodayAiUsageSnapshot = getTodayAiUsageSnapshot;
exports.cleanupAiUsageDailyRetention = cleanupAiUsageDailyRetention;
const client_1 = require("@prisma/client");
const prisma_1 = require("../db/prisma");
const GLOBAL_SCOPE_KEY = 'GLOBAL';
const RETENTION_DAYS = 180;
class AiDailyQuotaExceededError extends Error {
    constructor(scope, dailyLimit, usageDate) {
        super('AI_DAILY_QUOTA_EXCEEDED');
        this.code = 'AI_DAILY_QUOTA_EXCEEDED';
        this.statusCode = 429;
        this.scope = scope;
        this.daily_limit = dailyLimit;
        this.usage_date = usageDate;
    }
}
exports.AiDailyQuotaExceededError = AiDailyQuotaExceededError;
function isAiDailyQuotaExceededError(error) {
    return error instanceof AiDailyQuotaExceededError;
}
function getUtcUsageDate(date = new Date()) {
    return date.toISOString().slice(0, 10);
}
function getClientIp(request) {
    if (typeof request.ip === 'string' && request.ip.trim().length > 0) {
        return request.ip.trim();
    }
    const forwardedFor = request.headers['x-forwarded-for'];
    const headerValue = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    if (typeof headerValue === 'string') {
        const firstIp = headerValue
            .split(',')
            .map((value) => value.trim())
            .find((value) => value.length > 0);
        if (firstIp) {
            return firstIp;
        }
    }
    return request.ip;
}
async function ensureAiQuotaPolicyDefaults() {
    await prisma_1.prisma.$executeRaw(client_1.Prisma.sql `
    INSERT INTO ai_quota_policy (scope, daily_limit)
    VALUES ('global', 2000)
    ON CONFLICT (scope) DO NOTHING
  `);
    await prisma_1.prisma.$executeRaw(client_1.Prisma.sql `
    INSERT INTO ai_quota_policy (scope, daily_limit)
    VALUES ('ip', 20)
    ON CONFLICT (scope) DO NOTHING
  `);
}
async function reserveScopeQuota(params) {
    const { db, scope, scopeKey, usageDate, endpoint } = params;
    console.log('[GUARD_EXECUTED]', scope, scopeKey);
    const scanCalls = endpoint === 'scan' ? 1 : 0;
    const expandCalls = endpoint === 'expand' ? 1 : 0;
    const rows = await db.$queryRaw(client_1.Prisma.sql `
    WITH policy AS (
      SELECT daily_limit
      FROM ai_quota_policy
      WHERE scope = ${scope}
    ),
    reservation AS (
      INSERT INTO ai_usage_daily (
        scope,
        scope_key,
        usage_date,
        ai_calls,
        tokens,
        scan_calls,
        expand_calls,
        updated_at
      )
      SELECT
        ${scope},
        ${scopeKey},
        ${usageDate}::date,
        1,
        0,
        ${scanCalls},
        ${expandCalls},
        now()
      FROM policy
      ON CONFLICT (scope, scope_key, usage_date) DO UPDATE
      SET ai_calls = ai_usage_daily.ai_calls + 1,
          scan_calls = ai_usage_daily.scan_calls + EXCLUDED.scan_calls,
          expand_calls = ai_usage_daily.expand_calls + EXCLUDED.expand_calls,
          updated_at = now()
      WHERE ai_usage_daily.ai_calls < (
        SELECT daily_limit
        FROM policy
      )
      RETURNING ai_calls
    )
    SELECT
      COALESCE((SELECT daily_limit FROM policy), 0)::int AS daily_limit,
      EXISTS(SELECT 1 FROM reservation) AS reserved
  `);
    const row = rows[0];
    return {
        ok: Boolean(row?.reserved),
        daily_limit: typeof row?.daily_limit === 'number' ? row.daily_limit : 0,
    };
}
async function reserveAiQuotaForRequest(request, endpoint) {
    const usageDate = getUtcUsageDate();
    const clientIp = getClientIp(request);
    console.log('guard_enter endpoint=%s client_ip=%s usage_date=%s', endpoint, clientIp, usageDate);
    return prisma_1.prisma.$transaction(async (tx) => {
        const globalResult = await reserveScopeQuota({
            db: tx,
            scope: 'global',
            scopeKey: GLOBAL_SCOPE_KEY,
            usageDate,
            endpoint,
        });
        if (!globalResult.ok) {
            console.log('guard_blocked endpoint=%s scope=global scope_key=%s usage_date=%s daily_limit=%d', endpoint, GLOBAL_SCOPE_KEY, usageDate, globalResult.daily_limit);
            return {
                ok: false,
                scope: 'global',
                daily_limit: globalResult.daily_limit,
                usage_date: usageDate,
                client_ip: clientIp,
            };
        }
        const ipResult = await reserveScopeQuota({
            db: tx,
            scope: 'ip',
            scopeKey: clientIp,
            usageDate,
            endpoint,
        });
        if (!ipResult.ok) {
            console.log('guard_blocked endpoint=%s scope=ip scope_key=%s usage_date=%s daily_limit=%d', endpoint, clientIp, usageDate, ipResult.daily_limit);
            throw new AiDailyQuotaExceededError('ip', ipResult.daily_limit, usageDate);
        }
        console.log('guard_reserved endpoint=%s global_scope_key=%s ip_scope_key=%s usage_date=%s', endpoint, GLOBAL_SCOPE_KEY, clientIp, usageDate);
        return {
            ok: true,
            usage_date: usageDate,
            client_ip: clientIp,
        };
    }).catch((error) => {
        if (error instanceof AiDailyQuotaExceededError) {
            return {
                ok: false,
                scope: error.scope,
                daily_limit: error.daily_limit,
                usage_date: error.usage_date,
                client_ip: clientIp,
            };
        }
        throw error;
    });
}
async function enforceAiQuotaForRequest(request, endpoint) {
    const result = await reserveAiQuotaForRequest(request, endpoint);
    if (!result.ok) {
        throw new AiDailyQuotaExceededError(result.scope, result.daily_limit, result.usage_date);
    }
}
async function recordAiUsageTokens(params) {
    const { usageDate, clientIp, tokens } = params;
    if (!Number.isFinite(tokens) || tokens <= 0) {
        return;
    }
    await prisma_1.prisma.$executeRaw(client_1.Prisma.sql `
    UPDATE ai_usage_daily
    SET tokens = tokens + ${Math.trunc(tokens)},
        updated_at = now()
    WHERE usage_date = ${usageDate}::date
      AND (
        (scope = 'global' AND scope_key = ${GLOBAL_SCOPE_KEY})
        OR (scope = 'ip' AND scope_key = ${clientIp})
      )
  `);
}
async function getTodayAiUsageSnapshot(clientIp) {
    const usageDate = getUtcUsageDate();
    const rows = await prisma_1.prisma.$queryRaw(client_1.Prisma.sql `
    SELECT scope, scope_key, ai_calls, tokens
    FROM ai_usage_daily
    WHERE usage_date = ${usageDate}::date
      AND (
        (scope = 'global' AND scope_key = ${GLOBAL_SCOPE_KEY})
        OR (scope = 'ip' AND scope_key = ${clientIp})
      )
  `);
    const globalRow = rows.find((row) => row.scope === 'global');
    const ipRow = rows.find((row) => row.scope === 'ip' && row.scope_key === clientIp);
    return {
        usage_date: usageDate,
        global: {
            ai_calls: globalRow?.ai_calls ?? 0,
            tokens: globalRow?.tokens ?? 0,
        },
        ip: {
            scope_key: clientIp,
            ai_calls: ipRow?.ai_calls ?? 0,
            tokens: ipRow?.tokens ?? 0,
        },
    };
}
async function cleanupAiUsageDailyRetention() {
    const deletedRows = await prisma_1.prisma.$queryRaw(client_1.Prisma.sql `
    WITH deleted AS (
      DELETE FROM ai_usage_daily
      WHERE usage_date < (((now() AT TIME ZONE 'UTC')::date) - CAST(${RETENTION_DAYS} AS int))
      RETURNING 1
    )
    SELECT COUNT(*)::int AS deleted_count
    FROM deleted
  `);
    return deletedRows[0]?.deleted_count ?? 0;
}
