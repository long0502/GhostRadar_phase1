import * as fs from 'fs';
import { globalStats } from '../core/metrics';
import { getGeminiModel } from '../utils/env';
import { recordAiUsageTokens } from './quota.service';

type GeminiCallParams = {
  endpoint: 'scan' | 'expand' | 'normalization' | 'ai-health';
  prompt: string;
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
  thinkingConfig?: {
    thinkingBudget?: number;
  };
};

type GeminiCallResult = {
  text: string;
  modelVersion: string;
  totalTokenCount?: number;
};

export async function callGemini(params: GeminiCallParams): Promise<GeminiCallResult> {
  const {
    endpoint,
    prompt,
    responseMimeType = 'application/json',
    temperature = 0.2,
    aiCallsThisRequest,
    beforeAttempt,
    usageContext,
    model: modelOverride,
  } = params;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY missing');
  }

  const model = modelOverride || getGeminiModel();
  const maxAttempts = 2;
  let response: Response | null = null;
  let resolvedUsageContext = usageContext;

  if (beforeAttempt) {
    const attemptUsageContext = await beforeAttempt();
    if (attemptUsageContext) {
      resolvedUsageContext = attemptUsageContext;
    }
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const body: any = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        responseMimeType,
        ...(responseMimeType === 'application/json' && params.responseSchema ? { responseSchema: params.responseSchema } : {}),
        ...(params.maxOutputTokens ? { maxOutputTokens: params.maxOutputTokens } : {}),
        ...(params.thinkingConfig ? { thinkingConfig: params.thinkingConfig } : {}),
      },
      tools: params.tools,
    };

    if (params.systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: params.systemInstruction }]
      };
    }

    if (params.safetySettings) {
      body.safetySettings = params.safetySettings;
    }
    // console.log(`[GEMINI_BODY] ${JSON.stringify(body, null, 2)}`);
    console.log(`[GEMINI_REQUEST] URL: https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`);
    console.log(`[GEMINI_REQUEST] Body: ${JSON.stringify(body).slice(0, 500)}...`);

    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    console.log(`[GEMINI_RESPONSE] Status: ${response.status} ${response.statusText}`);
    const statusLog = `[GEMINI_RESPONSE] ${new Date().toISOString()} Status: ${response.status} ${response.statusText}\n`;
    fs.appendFileSync('gemini_debug.log', statusLog);

    if (response.status === 429 && attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      continue;
    }

    break;
  }

  if (!response) {
    throw new Error('No response from Gemini API');
  }

  if (!response.ok) {
    const errorBody = await response.text();
    fs.appendFileSync('gemini_debug.log', `[GEMINI_ERROR] ${errorBody}\n`);
    console.warn(
      `gemini_usage_missing endpoint=${endpoint} modelVersion=${model} totalTokenCount=missing ai_calls_this_request=${aiCallsThisRequest}`
    );
    console.error(`Gemini API Error Body: ${errorBody}`);
    throw new Error(`Gemini API error: ${response.status} - ${errorBody}`);
  }

  const data = (await response.json()) as {
    modelVersion?: string;
    usageMetadata?: {
      totalTokenCount?: number;
    };
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  fs.appendFileSync('gemini_debug.log', `[GEMINI_TEXT] ${text}\n---\n`);
  if (!text) {
    console.error('[GEMINI_BLOCKED] Full response data:', JSON.stringify(data, null, 2));
    fs.appendFileSync('gemini_debug.log', `[GEMINI_BLOCKED] ${JSON.stringify(data)}\n`);
    throw new Error('Gemini response missing text');
  }

  const modelVersion = data.modelVersion ?? model;
  const totalTokenCount = data.usageMetadata?.totalTokenCount;
  globalStats.total_ai_calls += 1;
  if (typeof totalTokenCount === 'number' && Number.isFinite(totalTokenCount)) {
    globalStats.total_tokens += totalTokenCount;
    if (resolvedUsageContext) {
      await recordAiUsageTokens({
        usageDate: resolvedUsageContext.usageDate,
        clientIp: resolvedUsageContext.clientIp,
        tokens: totalTokenCount,
      });
    }
  }
  if (endpoint === 'scan') {
    globalStats.scan_ai_calls += 1;
  } else if (endpoint === 'expand') {
    globalStats.expand_ai_calls += 1;
  }
  console.log(
    `[AI_CALL] route=${endpoint} model=${modelVersion} timestamp=${new Date().toISOString()} totalTokenCount=${typeof totalTokenCount === 'number' ? totalTokenCount : 'unknown'
    }`
  );
  console.log(`[METRICS] endpoint=${endpoint} total_ai_calls=${globalStats.total_ai_calls} total_tokens=${globalStats.total_tokens}`);
  console.log('[DEBUG_METRICS]', globalStats);
  if (typeof totalTokenCount !== 'number') {
    console.warn(
      `gemini_usage_missing endpoint=${endpoint} modelVersion=${modelVersion} ai_calls_this_request=${aiCallsThisRequest}`
    );
  } else {
    console.log(
      `gemini_usage endpoint=${endpoint} modelVersion=${modelVersion} totalTokenCount=${totalTokenCount} ai_calls_this_request=${aiCallsThisRequest}`
    );
  }

  return {
    text,
    modelVersion,
    totalTokenCount,
  };
}
