import * as fs from 'fs/promises';
import * as path from 'path';
import type { GeminiImageResult } from './gemini.service';

const EVENT_IMAGE_DIR = path.resolve(process.cwd(), 'storage', 'event-images');
const EVENT_IMAGE_ROUTE_PREFIX = '/events/images';

type StoredEventImage = {
  filePath: string;
  fileName: string;
  mimeType: string;
  publicUrl: string;
};

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

function sanitizeFileStem(value: string): string {
  const sanitized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  return sanitized.replace(/-+/g, '-').replace(/^-|-$/g, '') || 'event-image';
}

function inferExtensionFromMimeType(mimeType: string | null | undefined): string {
  const normalizedMimeType = mimeType?.trim().toLowerCase() || '';
  return MIME_EXTENSION_MAP[normalizedMimeType] || '.png';
}

function inferExtensionFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const extension = path.extname(pathname).toLowerCase();
    if (extension && extension.length <= 5) {
      return extension;
    }
  } catch (_) {}

  return '.png';
}

function buildStoredImage(fileName: string, mimeType: string): StoredEventImage {
  return {
    fileName,
    filePath: path.join(EVENT_IMAGE_DIR, fileName),
    mimeType,
    publicUrl: `${EVENT_IMAGE_ROUTE_PREFIX}/${encodeURIComponent(fileName)}`,
  };
}

async function ensureEventImageDir(): Promise<void> {
  await fs.mkdir(EVENT_IMAGE_DIR, { recursive: true });
}

async function writeImageBuffer(fileStem: string, imageBuffer: Buffer, mimeType: string, extensionHint?: string): Promise<StoredEventImage> {
  await ensureEventImageDir();

  const extension = extensionHint || inferExtensionFromMimeType(mimeType);
  const fileName = `${sanitizeFileStem(fileStem)}${extension}`;
  const storedImage = buildStoredImage(fileName, mimeType || 'image/png');

  await fs.writeFile(storedImage.filePath, imageBuffer);

  return storedImage;
}

export function getEventImagePath(fileName: string): string {
  const normalizedName = path.basename(fileName);
  return path.join(EVENT_IMAGE_DIR, normalizedName);
}

export function getEventImageMimeType(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  switch (extension) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    default:
      return 'image/png';
  }
}

export function isLocalEventImageUrl(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith(`${EVENT_IMAGE_ROUTE_PREFIX}/`) || trimmed.includes(`${EVENT_IMAGE_ROUTE_PREFIX}/`);
}

export async function persistImageFromUrl(sourceUrl: string, fileStem: string, mimeTypeHint?: string): Promise<StoredEventImage> {
  const response = await fetch(sourceUrl, {
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() || mimeTypeHint || 'image/png';
  const extension = inferExtensionFromMimeType(mimeType) || inferExtensionFromUrl(sourceUrl);

  return writeImageBuffer(fileStem, Buffer.from(arrayBuffer), mimeType, extension);
}

export async function persistDataUrlImage(dataUrl: string, fileStem: string): Promise<StoredEventImage> {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) {
    throw new Error('Invalid data URL image payload');
  }

  const mimeType = match[1] || 'image/png';
  const imageBuffer = Buffer.from(match[2], 'base64');
  return writeImageBuffer(fileStem, imageBuffer, mimeType);
}

export async function persistGeneratedEventImage(imageKey: string, imageResult: Exclude<GeminiImageResult, null>): Promise<StoredEventImage> {
  if (imageResult.imageBase64 && imageResult.imageBase64.trim().length > 0) {
    const imageBuffer = Buffer.from(imageResult.imageBase64, 'base64');
    return writeImageBuffer(imageKey, imageBuffer, imageResult.mimeType);
  }

  if (imageResult.dataUrl.startsWith('data:image/')) {
    return persistDataUrlImage(imageResult.dataUrl, imageKey);
  }

  return persistImageFromUrl(imageResult.dataUrl, imageKey, imageResult.mimeType);
}

export async function localizeExistingEventImage(imageKey: string, imageUrl: string): Promise<StoredEventImage> {
  if (imageUrl.startsWith('data:image/')) {
    return persistDataUrlImage(imageUrl, imageKey);
  }

  return persistImageFromUrl(imageUrl, imageKey);
}
