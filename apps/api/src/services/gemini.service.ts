import { globalStats } from '../core/metrics';
import { getGeminiModel } from '../utils/env';

type GeminiCallParams = {
  endpoint: 'scan' | 'expand' | 'normalization' | 'ai-health';
  prompt: string;
  responseMimeType?: 'application/json' | 'text/plain';
  temperature?: number;
  aiCallsThisRequest: number;
};

type GeminiCallResult = {
  text: string;
  modelVersion: string;
  totalTokenCount?: number;
};

export async function callGemini(params: GeminiCallParams): Promise<GeminiCallResult> {
  const { endpoint, prompt, responseMimeType = 'application/json', temperature = 0.2, aiCallsThisRequest } = params;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY missing');
  }

  const model = getGeminiModel();
  console.log(`gemini_call endpoint=${endpoint} modelVersion=${model} ai_calls_this_request=${aiCallsThisRequest}`);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          responseMimeType,
        },
      }),
    }
  );

  if (!response.ok) {
    console.warn(
      `gemini_usage_missing endpoint=${endpoint} modelVersion=${model} totalTokenCount=missing ai_calls_this_request=${aiCallsThisRequest}`
    );
    throw new Error(`Gemini API error: ${response.status}`);
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
  if (!text) {
    throw new Error('Gemini response missing text');
  }

  const modelVersion = data.modelVersion ?? model;
  const totalTokenCount = data.usageMetadata?.totalTokenCount;
  globalStats.total_ai_calls += 1;
  if (typeof totalTokenCount === 'number' && Number.isFinite(totalTokenCount)) {
    globalStats.total_tokens += totalTokenCount;
  }
  if (endpoint === 'scan') {
    globalStats.scan_ai_calls += 1;
  } else if (endpoint === 'expand') {
    globalStats.expand_ai_calls += 1;
  }
  console.log(
    `[AI_CALL] route=${endpoint} model=${modelVersion} timestamp=${new Date().toISOString()} totalTokenCount=${
      typeof totalTokenCount === 'number' ? totalTokenCount : 'unknown'
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
