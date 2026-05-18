import * as fs from 'fs';
import { globalStats } from '../core/metrics';
import { recordAiUsageTokens } from './quota.service';
import { enqueueAiCall } from './ai-queue.service';
import { logAiCall } from './ai-logging.service';
import {
  getAiGatewayApiKey,
  getAiImageGatewayProvider,
  getAiImageJobTimeoutSeconds,
  getAiImagePollTimeoutMs,
  getAiImageGatewayUrl,
  getAiGatewayProvider,
  getAiGatewayUrl,
  getAiPollIntervalMs,
  getAiPollTimeoutMs,
} from '../utils/env';

type GeminiCallParams = {
  endpoint: 'scan' | 'expand' | 'normalization' | 'ai-health' | 'image';
  prompt: string;
  provider?: string;
  requestType?: 'text' | 'image';
  responseMimeType?: 'application/json' | 'text/plain';
  responseSchema?: any;
  temperature?: number;
  aiCallsThisRequest: number;
  beforeAttempt?: () => Promise<
    | void
    | {
      usageDate: string;
      clientIp: string;
    }
  >;
  usageContext?: {
    usageDate: string;
    clientIp: string;
  };
  tools?: any[];
  model?: string;
  maxOutputTokens?: number;
  systemInstruction?: string;
  safetySettings?: Array<{
    category: string;
    threshold: string;
  }>;
  pollTimeoutMs?: number;
  gatewayTimeoutSecs?: number;
  thinkingConfig?: {
    thinkingBudget?: number;
  };
};

type GeminiCallResult = {
  text: string;
  modelVersion: string;
  totalTokenCount?: number;
};

function buildGatewayHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  return headers;
}

function parseGatewayData(data: unknown): string {
  if (typeof data !== 'string') {
    if (data == null) {
      return '';
    }
    return JSON.stringify(data);
  }

  const trimmed = data.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === 'string') {
      return parsed;
    }
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      const textCandidates = [
        record.text,
        record.output_text,
        record.output,
        record.answer,
        record.response,
        record.content,
      ];
      const firstText = textCandidates.find((value) => typeof value === 'string' && value.trim().length > 0);
      if (typeof firstText === 'string') {
        return firstText;
      }
    }
  } catch (_) {
    return data;
  }

  return trimmed;
}

function parseGatewayPayload(data: unknown): unknown {
  if (typeof data !== 'string') {
    return data;
  }

  const trimmed = data.trim();
  if (!trimmed) {
    return '';
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch (_) {
    return trimmed;
  }
}

function buildAbsoluteGatewayUrl(pathOrUrl: string, baseUrl: string = getAiGatewayUrl()): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  if (pathOrUrl.startsWith('/')) {
    return `${normalizedBaseUrl}${pathOrUrl}`;
  }

  return `${normalizedBaseUrl}/${pathOrUrl}`;
}

function isPrivateChatgptAssetUrl(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.includes('chatgpt.com/backend-api/');
}

function isScreenshotFallbackPayload(record: Record<string, unknown>): boolean {
  const captureMethodCandidates = [
    record.capture_method,
    record.captureMethod,
    record.result_type,
    record.resultType,
  ];

  return captureMethodCandidates.some(
    (value) => typeof value === 'string' && value.trim().toLowerCase().includes('screenshot')
  );
}

function parseGatewayImageResult(data: unknown): GeminiImageResult {
  const imageGatewayBaseUrl = getAiImageGatewayUrl();
  const payload = parseGatewayPayload(data);

  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) {
      return null;
    }

    if (trimmed.startsWith('data:image/')) {
      const mimeMatch = trimmed.match(/^data:([^;]+);base64,/i);
      const imageBase64 = trimmed.replace(/^data:[^;]+;base64,/i, '');
      return {
        imageBase64,
        mimeType: mimeMatch?.[1] || 'image/png',
        dataUrl: trimmed,
      };
    }

    if (isPrivateChatgptAssetUrl(trimmed)) {
      return null;
    }

    if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('/downloads/')) {
      return {
        imageBase64: '',
        mimeType: 'image/png',
        dataUrl: buildAbsoluteGatewayUrl(trimmed, imageGatewayBaseUrl),
      };
    }

    return null;
  }

  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (isScreenshotFallbackPayload(record)) {
    return null;
  }

  const urlCandidates = [
    record.download_url,
    record.downloadUrl,
    record.artifact_url,
    record.artifactUrl,
    record.dataUrl,
    record.data_url,
    record.image_url,
    record.imageUrl,
    record.url,
  ];
  const firstUrl = urlCandidates.find((value) => typeof value === 'string' && value.trim().length > 0);
  const mimeType =
    (typeof record.mimeType === 'string' && record.mimeType) ||
    (typeof record.mime_type === 'string' && record.mime_type) ||
    (typeof record.content_type === 'string' && record.content_type) ||
    'image/png';

  if (typeof firstUrl === 'string') {
    const trimmedUrl = firstUrl.trim();
    if (trimmedUrl.startsWith('data:image/')) {
      const imageBase64 = trimmedUrl.replace(/^data:[^;]+;base64,/i, '');
      return {
        imageBase64,
        mimeType,
        dataUrl: trimmedUrl,
      };
    }

    if (isPrivateChatgptAssetUrl(trimmedUrl)) {
      return null;
    }

    return {
      imageBase64: '',
      mimeType,
      dataUrl: buildAbsoluteGatewayUrl(trimmedUrl, imageGatewayBaseUrl),
    };
  }

  const base64Candidates = [
    record.b64_json,
    record.base64,
    record.image_base64,
    record.imageBase64,
  ];
  const firstBase64 = base64Candidates.find((value) => typeof value === 'string' && value.trim().length > 0);

  if (typeof firstBase64 === 'string') {
    const trimmedBase64 = firstBase64.trim();
    return {
      imageBase64: trimmedBase64,
      mimeType,
      dataUrl: `data:${mimeType};base64,${trimmedBase64}`,
    };
  }

  return null;
}

export async function callGemini(params: GeminiCallParams): Promise<GeminiCallResult> {
  const {
    endpoint,
    prompt: originalPrompt,
    aiCallsThisRequest,
    beforeAttempt,
    usageContext,
    systemInstruction,
  } = params;

  const aiStartTime = Date.now();
  let resolvedUsageContext = usageContext;

  if (beforeAttempt) {
    const attemptUsageContext = await beforeAttempt();
    if (attemptUsageContext) {
      resolvedUsageContext = attemptUsageContext;
    }
  }

  const apiBaseUrl = getAiGatewayUrl().replace(/\/+$/, '');
  const apiKey = getAiGatewayApiKey();
  const aiGatewayProvider = params.provider?.trim() || getAiGatewayProvider();
  const requestType = params.requestType || 'text';
  const resolvedApiBaseUrl =
    requestType === 'image' ? getAiImageGatewayUrl().replace(/\/+$/, '') : apiBaseUrl;
  const modelVersion = `${aiGatewayProvider}-gateway`;

  let prompt = originalPrompt;
  if (systemInstruction) {
    prompt = `${systemInstruction}\n\n${originalPrompt}`;
  }

  const timeoutMs = params.pollTimeoutMs ?? getAiPollTimeoutMs();
  const pollIntervalMs = getAiPollIntervalMs();
  const gatewayTimeoutSecs = params.gatewayTimeoutSecs ?? Math.floor(timeoutMs / 1000);
  const includeTimeoutOnAsk = (process.env.AI_GATEWAY_INCLUDE_TIMEOUT ?? 'false').toLowerCase() === 'true';
  const shouldIncludeTimeoutOnAsk = includeTimeoutOnAsk || requestType === 'image';

  console.log(`[GATEWAY_REQUEST] Submitting prompt to ${resolvedApiBaseUrl}/ask with provider=${aiGatewayProvider} type=${requestType} timeout=${gatewayTimeoutSecs}s`);
  
  let askResponse: Response;
  try {
    const askPayload: Record<string, unknown> = {
      prompt,
      provider: aiGatewayProvider,
      type: requestType,
    };
    if (shouldIncludeTimeoutOnAsk) {
      askPayload.timeout = gatewayTimeoutSecs;
    }

    askResponse = await fetch(`${resolvedApiBaseUrl}/ask`, {
      method: 'POST',
      headers: buildGatewayHeaders(apiKey),
      body: JSON.stringify(askPayload),
    });
  } catch (err: any) {
    logAiCall({
      endpoint,
      model: modelVersion,
      tokensInput: prompt.length,
      tokensOutput: 0,
      latencyMs: Date.now() - aiStartTime,
      success: false,
      errorMessage: `Gateway fetch error: ${err.message}`,
    });
    throw new Error(`Failed to connect to AI Gateway: ${err.message}`);
  }

  if (!askResponse.ok) {
    const errorBody = await askResponse.text();
    fs.appendFileSync('gemini_debug.log', `[GATEWAY_ERROR] ${askResponse.status} ${errorBody}\n`);
    logAiCall({
      endpoint,
      model: modelVersion,
      tokensInput: prompt.length,
      tokensOutput: 0,
      latencyMs: Date.now() - aiStartTime,
      success: false,
      errorMessage: `Status ${askResponse.status} - ${errorBody.slice(0, 200)}`,
    });
    throw new Error(`AI Gateway error: ${askResponse.status} - ${errorBody}`);
  }

  const askData = await askResponse.json() as any;
  if (askData.status === 'error' || askData.status === 'failed') {
    throw new Error(`Gateway Error on submission: ${askData.error}`);
  }

  const jobId = askData.request_id;
  if (!jobId || typeof jobId !== 'string') {
    throw new Error('Gateway Error on submission: missing request_id');
  }
  console.log(`[GATEWAY_JOB] Received Job ID: ${jobId}. Waiting for processing...`);

  const startTime = Date.now();
  
  let finalData: string | null = null;
  let hasTimeout = false;

  while (true) {
    if (Date.now() - startTime > timeoutMs) {
      hasTimeout = true;
      break;
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

    let statusRes: Response;
    try {
      statusRes = await fetch(`${resolvedApiBaseUrl}/jobs/${jobId}`, {
        headers: apiKey ? { 'x-api-key': apiKey } : undefined,
      });
    } catch (err: any) {
      console.error(`[GATEWAY_POLL_ERROR] ${err.message}`);
      continue;
    }

    if (!statusRes.ok) {
      console.error(`[GATEWAY_POLL_ERROR] HTTP ${statusRes.status}`);
      continue;
    }

    const statusData = await statusRes.json() as any;
    const status = statusData.status;

    if (status === 'success') {
      finalData = parseGatewayData(statusData.data);
      break;
    } else if (status === 'error' || status === 'failed') {
      const errMessage = statusData.error || 'Unknown error during processing';
      logAiCall({
        endpoint,
        model: modelVersion,
        tokensInput: prompt.length,
        tokensOutput: 0,
        latencyMs: Date.now() - aiStartTime,
        success: false,
        errorMessage: errMessage,
      });
      throw new Error(`Job failed: ${errMessage}`);
    }

    console.log(`[GATEWAY_JOB] Job ${jobId} still processing (${Math.round((Date.now() - startTime)/1000)}s elapsed)...`);
  }

  if (hasTimeout || finalData === null) {
    logAiCall({
      endpoint,
      model: modelVersion,
      tokensInput: prompt.length,
      tokensOutput: 0,
      latencyMs: Date.now() - aiStartTime,
      success: false,
      errorMessage: `Timeout waiting for ChatGPT answer after ${Math.round(timeoutMs / 1000)}s`,
    });
    throw new Error(`Error: Timeout waiting for ChatGPT answer (Exceeded ${Math.round(timeoutMs / 1000)}s)`);
  }

  fs.appendFileSync('gemini_debug.log', `[GATEWAY_TEXT] ${finalData}\n---\n`);
  
  // Fake tokens since ChatGPT gateway doesn't provide token counts
  const totalTokenCount = Math.round(finalData.length / 4); 

  globalStats.total_ai_calls += 1;
  globalStats.total_tokens += totalTokenCount;
  
  if (resolvedUsageContext) {
    await recordAiUsageTokens({
      usageDate: resolvedUsageContext.usageDate,
      clientIp: resolvedUsageContext.clientIp,
      tokens: totalTokenCount,
    });
  }

  if (endpoint === 'scan') {
    globalStats.scan_ai_calls += 1;
  } else if (endpoint === 'expand') {
    globalStats.expand_ai_calls += 1;
  }

  console.log(`[AI_CALL] route=${endpoint} model=${modelVersion} timestamp=${new Date().toISOString()} totalTokenCount=${totalTokenCount}`);
  
  logAiCall({
    endpoint,
    model: modelVersion,
    tokensInput: prompt.length,
    tokensOutput: totalTokenCount,
    latencyMs: Date.now() - aiStartTime,
    success: true,
  });

  return {
    text: finalData,
    modelVersion,
    totalTokenCount,
  };
}

export async function callGeminiQueued(params: GeminiCallParams): Promise<GeminiCallResult> {
  return enqueueAiCall(() => callGemini(params));
}

export type GeminiImageResult = {
  imageBase64: string;
  mimeType: string;
  dataUrl: string;
} | null;

export async function callGeminiImageQueued(prompt: string): Promise<GeminiImageResult> {
  const result = await enqueueAiCall(() =>
    callGemini({
      endpoint: 'image',
      prompt,
      provider: getAiImageGatewayProvider(),
      requestType: 'image',
      aiCallsThisRequest: 1,
      pollTimeoutMs: getAiImagePollTimeoutMs(),
      gatewayTimeoutSecs: getAiImageJobTimeoutSeconds(),
    })
  );

  const imageResult = parseGatewayImageResult(result.text);
  if (!imageResult) {
    fs.appendFileSync('gemini_debug.log', `[GATEWAY_IMAGE_PARSE_FAILED] ${result.text}\n---\n`);
    return null;
  }

  return imageResult;
}
