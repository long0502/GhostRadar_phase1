import type { FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';

const GLOBAL_SCOPE_KEY = 'GLOBAL';
const RETENTION_DAYS = 180;

export type QuotaScope = 'global' | 'ip';
type QuotaEndpoint = 'scan' | 'expand';

type ReserveQuotaSuccess = {
  ok: true;
  usage_date: string;
  client_ip: string;
};

type ReserveQuotaFailure = {
  ok: false;
  scope: QuotaScope;
  daily_limit: number;
  usage_date: string;
  client_ip: string;
};

type UsageSnapshot = {
  ai_calls: number;
  tokens: number;
};

type QuotaDbClient = Prisma.TransactionClient | typeof prisma;

export class AiDailyQuotaExceededError extends Error {
  code = 'AI_DAILY_QUOTA_EXCEEDED' as const;
  statusCode = 429;
  scope: QuotaScope;
  daily_limit: number;
  usage_date: string;

  constructor(scope: QuotaScope, dailyLimit: number, usageDate: string) {
    super('AI_DAILY_QUOTA_EXCEEDED');
    this.scope = scope;
    this.daily_limit = dailyLimit;
    this.usage_date = usageDate;
  }
}

export function isAiDailyQuotaExceededError(error: unknown): error is AiDailyQuotaExceededError {
  return error instanceof AiDailyQuotaExceededError;
}

export function getUtcUsageDate(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function getClientIp(request: FastifyRequest): string {
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

export async function ensureAiQuotaPolicyDefaults(): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO ai_quota_policy (scope, daily_limit)
    VALUES ('global', 2000)
    ON CONFLICT (scope) DO NOTHING
  `);

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO ai_quota_policy (scope, daily_limit)
    VALUES ('ip', 20)
    ON CONFLICT (scope) DO NOTHING
  `);
}

async function reserveScopeQuota(params: {
  db: QuotaDbClient;
  scope: QuotaScope;
  scopeKey: string;
  usageDate: string;
  endpoint: QuotaEndpoint;
}): Promise<{ ok: boolean; daily_limit: number }> {
  const { db, scope, scopeKey, usageDate, endpoint } = params;
  console.log('[GUARD_EXECUTED]', scope, scopeKey);
  const scanCalls = endpoint === 'scan' ? 1 : 0;
  const expandCalls = endpoint === 'expand' ? 1 : 0;
  const rows = await db.$queryRaw<Array<{ daily_limit: number; reserved: boolean }>>(Prisma.sql`
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

export async function reserveAiQuotaForRequest(
  request: FastifyRequest,
  endpoint: QuotaEndpoint
): Promise<ReserveQuotaSuccess | ReserveQuotaFailure> {
  const usageDate = getUtcUsageDate();
  const clientIp = getClientIp(request);
  console.log('guard_enter endpoint=%s client_ip=%s usage_date=%s', endpoint, clientIp, usageDate);

  return prisma.$transaction(async (tx) => {
    const globalResult = await reserveScopeQuota({
      db: tx,
      scope: 'global',
      scopeKey: GLOBAL_SCOPE_KEY,
      usageDate,
      endpoint,
    });
    if (!globalResult.ok) {
      console.log(
        'guard_blocked endpoint=%s scope=global scope_key=%s usage_date=%s daily_limit=%d',
        endpoint,
        GLOBAL_SCOPE_KEY,
        usageDate,
        globalResult.daily_limit
      );
      return {
        ok: false as const,
        scope: 'global' as const,
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
      console.log(
        'guard_blocked endpoint=%s scope=ip scope_key=%s usage_date=%s daily_limit=%d',
        endpoint,
        clientIp,
        usageDate,
        ipResult.daily_limit
      );
      throw new AiDailyQuotaExceededError('ip', ipResult.daily_limit, usageDate);
    }

    console.log(
      'guard_reserved endpoint=%s global_scope_key=%s ip_scope_key=%s usage_date=%s',
      endpoint,
      GLOBAL_SCOPE_KEY,
      clientIp,
      usageDate
    );
    return {
      ok: true as const,
      usage_date: usageDate,
      client_ip: clientIp,
    };
  }).catch((error: unknown) => {
    if (error instanceof AiDailyQuotaExceededError) {
      return {
        ok: false as const,
        scope: error.scope,
        daily_limit: error.daily_limit,
        usage_date: error.usage_date,
        client_ip: clientIp,
      };
    }
    throw error;
  });
}

export async function enforceAiQuotaForRequest(request: FastifyRequest, endpoint: QuotaEndpoint): Promise<void> {
  const result = await reserveAiQuotaForRequest(request, endpoint);
  if (!result.ok) {
    throw new AiDailyQuotaExceededError(result.scope, result.daily_limit, result.usage_date);
  }
}

export async function recordAiUsageTokens(params: {
  usageDate: string;
  clientIp: string;
  tokens: number;
}): Promise<void> {
  const { usageDate, clientIp, tokens } = params;
  if (!Number.isFinite(tokens) || tokens <= 0) {
    return;
  }

  await prisma.$executeRaw(Prisma.sql`
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

export async function getTodayAiUsageSnapshot(clientIp: string): Promise<{
  usage_date: string;
  global: UsageSnapshot;
  ip: UsageSnapshot & { scope_key: string };
}> {
  const usageDate = getUtcUsageDate();
  const rows = await prisma.$queryRaw<
    Array<{ scope: string; scope_key: string; ai_calls: number; tokens: number }>
  >(Prisma.sql`
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

export async function cleanupAiUsageDailyRetention(): Promise<number> {
  const deletedRows = await prisma.$queryRaw<Array<{ deleted_count: number }>>(Prisma.sql`
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
