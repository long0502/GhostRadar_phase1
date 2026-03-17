import * as fs from 'fs';
import { globalStats } from '../core/metrics';
import { getGeminiModel } from '../utils/env';
import { recordAiUsageTokens } from './quota.service';
import { enqueueAiCall } from './ai-queue.service';
import { logAiCall } from './ai-logging.service';

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
  const aiStartTime = Date.now();
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
    logAiCall({
      endpoint,
      model,
      tokensInput: prompt.length,
      tokensOutput: 0,
      latencyMs: Date.now() - aiStartTime,
      success: false,
      errorMessage: `${response.status} - ${errorBody.slice(0, 200)}`,
    });
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

  // Fire-and-forget AI call log
  logAiCall({
    endpoint,
    model: modelVersion,
    tokensInput: prompt.length,
    tokensOutput: typeof totalTokenCount === 'number' ? totalTokenCount : 0,
    latencyMs: Date.now() - aiStartTime,
    success: true,
  });

  return {
    text,
    modelVersion,
    totalTokenCount,
  };
}

/**
 * Queued version of callGemini — all calls go through the global RPM queue.
 * Use this for any user-facing AI calls (scan, expand) to avoid 429 from Google.
 */
export async function callGeminiQueued(params: GeminiCallParams): Promise<GeminiCallResult> {
  return enqueueAiCall(() => callGemini(params));
}

/**
 * Generate an image using gemini-2.5-flash-image model.
 * Returns base64 data URL or null if generation fails.
 */
export type GeminiImageResult = {
  imageBase64: string;
  mimeType: string;
  dataUrl: string;
} | null;

async function callGeminiImage(prompt: string): Promise<GeminiImageResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[GEMINI_IMAGE] Missing GEMINI_API_KEY');
    return null;
  }

  const model = 'gemini-2.5-flash-image';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const aiStartTime = Date.now();

  console.log(`[GEMINI_IMAGE] Generating image with prompt: "${prompt.slice(0, 100)}..."`);

  try {
    const body = {
      contents: [{
        parts: [{ text: prompt }],
      }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        temperature: 0.8,
      },
    };

    const maxAttempts = 3;
    let response: Response | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`[GEMINI_IMAGE] Attempt ${attempt}/${maxAttempts}...`);
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      console.log(`[GEMINI_IMAGE] Response: ${response.status} (attempt ${attempt})`);

      if (response.status === 429 && attempt < maxAttempts) {
        const waitMs = 2000 * attempt * attempt; // 2s, 8s, 18s
        console.log(`[GEMINI_IMAGE] Rate limited, waiting ${waitMs}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      break;
    }

    if (!response) {
      console.error('[GEMINI_IMAGE] No response after retries');
      return null;
    }

    const latencyMs = Date.now() - aiStartTime;

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[GEMINI_IMAGE] Error: ${response.status} - ${errorText.slice(0, 200)}`);
      logAiCall({
        endpoint: 'image',
        model,
        tokensInput: prompt.length,
        tokensOutput: 0,
        latencyMs,
        success: false,
        errorMessage: `${response.status} - ${errorText.slice(0, 200)}`,
      });
      return null;
    }

    const data = await response.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
            inlineData?: {
              mimeType: string;
              data: string;
            };
          }>;
        };
      }>;
    };

    // Find the image part in the response
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find(p => p.inlineData?.data);

    if (!imagePart?.inlineData) {
      console.warn('[GEMINI_IMAGE] No image data in response');
      logAiCall({
        endpoint: 'image',
        model,
        tokensInput: prompt.length,
        tokensOutput: 0,
        latencyMs,
        success: false,
        errorMessage: 'No image data in response',
      });
      return null;
    }

    const { mimeType, data: imageBase64 } = imagePart.inlineData;
    const dataUrl = `data:${mimeType};base64,${imageBase64}`;

    console.log(`[GEMINI_IMAGE] Success: ${mimeType}, base64 length=${imageBase64.length}`);

    logAiCall({
      endpoint: 'image',
      model,
      tokensInput: prompt.length,
      tokensOutput: 1290, // Fixed token cost per image
      latencyMs,
      success: true,
    });

    globalStats.total_ai_calls += 1;

    return { imageBase64, mimeType, dataUrl };
  } catch (error) {
    const latencyMs = Date.now() - aiStartTime;
    console.error('[GEMINI_IMAGE] Exception:', error instanceof Error ? error.message : error);
    logAiCall({
      endpoint: 'image',
      model,
      tokensInput: prompt.length,
      tokensOutput: 0,
      latencyMs,
      success: false,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Queued version of callGeminiImage — goes through the RPM queue.
 */
export async function callGeminiImageQueued(prompt: string): Promise<GeminiImageResult> {
  return enqueueAiCall(() => callGeminiImage(prompt));
}
