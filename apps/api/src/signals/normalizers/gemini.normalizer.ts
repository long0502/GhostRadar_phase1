import type { RawSignal } from '../providers/types';
import { normalizedSignalArraySchema, type NormalizedSignal } from '../validators/normalizedSignal.schema';
import { callGemini } from '../../services/gemini.service';

function extractJsonArray(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = fenced.indexOf('[');
  const end = fenced.lastIndexOf(']');

  if (start < 0 || end < 0 || end < start) {
    throw new Error('Gemini response did not contain a JSON array');
  }

  return fenced.slice(start, end + 1);
}

export async function normalizeWithGemini(rawSignals: RawSignal[]): Promise<NormalizedSignal[]> {
  if (rawSignals.length === 0) {
    return [];
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('Gemini API key missing. Skipping Gemini normalization.');
    return [];
  }

  const prompt = `
You are an event normalizer.
Convert the input raw signals into a strict JSON array only.
Return exactly one JSON array and nothing else.
Each element must include:
- title (string)
- summary (string)
- lat (number)
- lon (number)
- event_type (string)
- event_source (string)
- confidence (number between 0 and 1)
If lat/lon is unavailable, infer best estimate as 0.

  Raw signals JSON:
${JSON.stringify(rawSignals)}
`.trim();

  console.log('Calling Gemini with N signals:', rawSignals.length);
  const result = await callGemini({
    endpoint: 'normalization',
    prompt,
    responseMimeType: 'application/json',
    temperature: 0.1,
    aiCallsThisRequest: 1,
  });
  const responseText = result.text;
  console.log('Gemini raw response text:', responseText);

  if (!responseText) {
    console.log('Gemini returned empty response');
    throw new Error('Gemini response missing text');
  }

  console.log('AI raw response:');
  console.log(responseText);

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonArray(responseText));
  } catch (error) {
    console.error('Parsed JSON:');
    console.error('Failed to parse Gemini response as JSON array');
    console.error(error);
    console.log('Validation result: failed');
    return [];
  }

  console.log('Parsed JSON:');
  console.log(parsed);

  const validated = normalizedSignalArraySchema.safeParse(parsed);
  if (!validated.success) {
    console.error('Validation result: failed');
    console.error(validated.error);
    return [];
  }

  console.log('Validation result: success');
  return validated.data;
}
