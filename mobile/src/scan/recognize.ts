import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { NativeModules } from 'react-native';

import { scanApi } from '@/api/endpoints';
import type { OcrResult } from '@/api/types';

/**
 * On-device OCR uses Google ML Kit (@react-native-ml-kit/text-recognition).
 * It is a native module, so it is only present in a development/production
 * build — not in Expo Go. When it's missing (or fails), a resized copy of the
 * photo is sent to the backend's OCR endpoint instead. Either way the *server*
 * normalises the text into fields, so client-side parsing is never trusted.
 */
export function isOnDeviceOcrAvailable(): boolean {
  return Boolean(NativeModules.TextRecognition);
}

async function recognizeOnDevice(uri: string): Promise<string | null> {
  if (!isOnDeviceOcrAvailable()) return null;
  try {
    const mod = await import('@react-native-ml-kit/text-recognition');
    const result = await mod.default.recognize(uri);
    // Rebuild text line-by-line in reading order (blocks top→bottom).
    const blocks = [...result.blocks].sort((a, b) => (a.frame?.top ?? 0) - (b.frame?.top ?? 0));
    const lines = blocks.flatMap((b) => b.lines.map((l) => l.text));
    return lines.join('\n') || result.text;
  } catch {
    return null;
  }
}

/** Longest side sent to the server. Plenty for label text; keeps uploads ~200–500 KB. */
export const SERVER_OCR_MAX_SIDE = 1600;

export function targetSize(width: number, height: number, maxSide = SERVER_OCR_MAX_SIDE) {
  const longest = Math.max(width, height);
  if (!longest || longest <= maxSide) return null;
  return width >= height ? { width: maxSide, height: null } : { width: null, height: maxSide };
}

/** Resize + JPEG-compress the photo and return it as base64 for the JSON upload. */
export async function prepareForServer(uri: string, width: number, height: number): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  const size = targetSize(width, height);
  if (size) ctx.resize(size);
  const rendered = await ctx.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.75, base64: true });
  if (!saved.base64) throw new Error('Could not prepare the photo for upload.');
  return saved.base64;
}

export type OcrProgress = 'detecting' | 'identifying' | 'dates' | 'organizing';

export async function recognizeLabel(photo: { uri: string; width: number; height: number }, dateOrder: 'dmy' | 'mdy',
                                     onProgress?: (p: OcrProgress) => void): Promise<OcrResult> {
  onProgress?.('detecting');
  const text = await recognizeOnDevice(photo.uri);
  onProgress?.('identifying');
  let result: OcrResult;
  if (text && text.trim()) {
    onProgress?.('dates');
    result = await scanApi.ocrText(text, dateOrder);
  } else {
    const base64 = await prepareForServer(photo.uri, photo.width, photo.height);
    onProgress?.('dates');
    result = await scanApi.ocrImage(base64, dateOrder);
  }
  onProgress?.('organizing');
  return result;
}
