import { prisma } from './db';

// ─── Dashboard Overview ───
export async function getDashboardStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    scansToday,
    aiCostToday,
    cacheHitRatio,
    totalEvents,
    totalAiCalls,
    expandsToday,
  ] = await Promise.all([
    prisma.usage_logs.count({ where: { action: 'scan', timestamp: { gte: today } } }),
    prisma.ai_call_logs.aggregate({ _sum: { estimated_cost: true }, where: { timestamp: { gte: today } } }),
    prisma.usage_logs.aggregate({ _avg: { events_returned: true }, where: { action: 'scan', cache_hit: true } }),
    prisma.events.count(),
    prisma.ai_call_logs.count({ where: { timestamp: { gte: today } } }),
    prisma.usage_logs.count({ where: { action: 'expand', timestamp: { gte: today } } }),
  ]);

  return {
    scansToday,
    aiCostToday: aiCostToday._sum.estimated_cost || 0,
    cacheHitRatio: cacheHitRatio._avg.events_returned || 0,
    totalEvents,
    totalAiCalls,
    expandsToday,
    expandRate: scansToday > 0 ? ((expandsToday / scansToday) * 100).toFixed(1) : '0',
  };
}

// ─── AI Call & Token Analytics ───
export async function getAiCostDaily(days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = await prisma.$queryRaw<Array<{
    day: Date;
    total_cost: number;
    input_tokens: bigint;
    output_tokens: bigint;
    call_count: bigint;
    error_count: bigint;
  }>>`
    SELECT DATE(timestamp) as day,
           COALESCE(SUM(estimated_cost), 0) as total_cost,
           COALESCE(SUM(tokens_input), 0) as input_tokens,
           COALESCE(SUM(tokens_output), 0) as output_tokens,
           COUNT(*) as call_count,
           COUNT(*) FILTER (WHERE success = false) as error_count
    FROM ai_call_logs
    WHERE timestamp >= ${since}
    GROUP BY DATE(timestamp)
    ORDER BY day
  `;

  return rows.map(r => ({
    day: r.day.toISOString().split('T')[0],
    totalCost: Number(r.total_cost),
    inputTokens: Number(r.input_tokens),
    outputTokens: Number(r.output_tokens),
    callCount: Number(r.call_count),
    errorCount: Number(r.error_count),
  }));
}

export async function getAiCostByModel(days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = await prisma.$queryRaw<Array<{
    model: string;
    input_tokens: bigint;
    output_tokens: bigint;
    total_cost: number;
    call_count: bigint;
    avg_latency: number;
  }>>`
    SELECT model,
           COALESCE(SUM(tokens_input), 0) as input_tokens,
           COALESCE(SUM(tokens_output), 0) as output_tokens,
           COALESCE(SUM(estimated_cost), 0) as total_cost,
           COUNT(*) as call_count,
           COALESCE(AVG(latency_ms), 0) as avg_latency
    FROM ai_call_logs
    WHERE timestamp >= ${since}
    GROUP BY model
    ORDER BY total_cost DESC
  `;

  return rows.map(r => ({
    model: r.model,
    inputTokens: Number(r.input_tokens),
    outputTokens: Number(r.output_tokens),
    totalCost: Number(r.total_cost),
    callCount: Number(r.call_count),
    avgLatency: Math.round(Number(r.avg_latency)),
  }));
}

export async function getAiCostByEndpoint(days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = await prisma.$queryRaw<Array<{
    endpoint: string;
    call_count: bigint;
    total_cost: number;
    total_tokens: bigint;
    avg_latency: number;
  }>>`
    SELECT endpoint,
           COUNT(*) as call_count,
           COALESCE(SUM(estimated_cost), 0) as total_cost,
           COALESCE(SUM(tokens_input + tokens_output), 0) as total_tokens,
           COALESCE(AVG(latency_ms), 0) as avg_latency
    FROM ai_call_logs
    WHERE timestamp >= ${since}
    GROUP BY endpoint
    ORDER BY total_cost DESC
  `;

  return rows.map(r => ({
    endpoint: r.endpoint,
    callCount: Number(r.call_count),
    totalCost: Number(r.total_cost),
    totalTokens: Number(r.total_tokens),
    avgLatency: Math.round(Number(r.avg_latency)),
  }));
}

export async function getAiErrors(limit = 50) {
  return prisma.ai_call_logs.findMany({
    where: { success: false },
    orderBy: { timestamp: 'desc' },
    take: limit,
    select: {
      timestamp: true,
      endpoint: true,
      model: true,
      error_message: true,
      latency_ms: true,
    },
  });
}

// ─── Scan Analytics ───
export async function getScanDaily(days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = await prisma.$queryRaw<Array<{
    day: Date;
    scan_count: bigint;
    expand_count: bigint;
    cache_hits: bigint;
    avg_response: number;
  }>>`
    SELECT DATE(timestamp) as day,
           COUNT(*) FILTER (WHERE action = 'scan') as scan_count,
           COUNT(*) FILTER (WHERE action = 'expand') as expand_count,
           COUNT(*) FILTER (WHERE action = 'scan' AND cache_hit = true) as cache_hits,
           COALESCE(AVG(response_ms) FILTER (WHERE action = 'scan'), 0) as avg_response
    FROM usage_logs
    WHERE timestamp >= ${since}
    GROUP BY DATE(timestamp)
    ORDER BY day
  `;

  return rows.map(r => ({
    day: r.day.toISOString().split('T')[0],
    scanCount: Number(r.scan_count),
    expandCount: Number(r.expand_count),
    cacheHits: Number(r.cache_hits),
    avgResponse: Math.round(Number(r.avg_response)),
  }));
}

export async function getTopLocations(limit = 10) {
  const rows = await prisma.$queryRaw<Array<{
    grid_id: string;
    scan_count: bigint;
  }>>`
    SELECT grid_id, COUNT(*) as scan_count
    FROM usage_logs
    WHERE action = 'scan' AND grid_id IS NOT NULL
    GROUP BY grid_id
    ORDER BY scan_count DESC
    LIMIT ${limit}
  `;

  return rows.map(r => ({
    gridId: r.grid_id,
    scanCount: Number(r.scan_count),
  }));
}

// ─── Event Analytics ───
export async function getEventStats() {
  const [totalEvents, expandedEvents, totalDetails] = await Promise.all([
    prisma.events.count(),
    prisma.events.count({ where: { has_detail: true } }),
    prisma.event_details.count(),
  ]);

  return {
    totalEvents,
    expandedEvents,
    expandRate: totalEvents > 0 ? ((expandedEvents / totalEvents) * 100).toFixed(1) : '0',
    totalDetails,
  };
}
