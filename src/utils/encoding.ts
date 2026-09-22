import { TextEncoding } from '../types';

/**
 * Browser-safe UTF-8 Base64 Encoder
 */
export function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

/**
 * Convert Base64 string to Uint8Array bytes
 */
export function base64ToBytes(base64: string): Uint8Array {
  const cleanBase64 = base64.replace(/\s/g, '');
  const binary = window.atob(cleanBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decode Uint8Array bytes using specified encoding (e.g., 'utf-8', 'shift_jis', 'euc-jp', 'iso-2022-jp')
 */
export function decodeBytes(bytes: Uint8Array, encoding: TextEncoding | string = 'utf-8'): string {
  try {
    const decoder = new TextDecoder(encoding, { fatal: false });
    return decoder.decode(bytes);
  } catch (e) {
    console.warn(`TextDecoder failed for encoding: ${encoding}, falling back to utf-8`, e);
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
}

/**
 * Browser-safe UTF-8 Base64 Decoder
 */
export function base64ToUtf8(base64: string): string {
  const bytes = base64ToBytes(base64);
  return decodeBytes(bytes, 'utf-8');
}

/**
 * Known binary file extensions
 */
export const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'tiff', 'psd',
  'pdf', 'zip', 'tar', 'gz', 'bz2', '7z', 'rar',
  'mp3', 'wav', 'ogg', 'm4a', 'flac',
  'mp4', 'mov', 'avi', 'mkv', 'webm',
  'docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt',
  'exe', 'dll', 'so', 'dylib', 'bin', 'iso', 'dmg', 'apk',
  'wasm', 'woff', 'woff2', 'ttf', 'otf', 'eot',
]);

/**
 * Image file extensions
 */
export const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']);

/**
 * Check if file path matches known binary extension
 */
export function isBinaryExtension(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * Check if file path matches image extension
 */
export function isImageExtension(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return IMAGE_EXTENSIONS.has(ext);
}

/**
 * Detect binary data by scanning the first 8000 bytes for null bytes (0x00)
 */
export function isBinaryData(bytes: Uint8Array): boolean {
  const checkLen = Math.min(bytes.length, 8000);
  for (let i = 0; i < checkLen; i++) {
    if (bytes[i] === 0) {
      return true;
    }
  }
  return false;
}

/**
 * Get simple MIME type for common extensions
 */
export function getMimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    case 'svg': return 'image/svg+xml';
    case 'bmp': return 'image/bmp';
    case 'ico': return 'image/x-icon';
    case 'pdf': return 'application/pdf';
    case 'zip': return 'application/zip';
    case 'tar': return 'application/x-tar';
    case 'gz': return 'application/gzip';
    case 'json': return 'application/json';
    case 'yaml':
    case 'yml': return 'text/yaml';
    case 'txt': return 'text/plain';
    case 'csv': return 'text/csv';
    case 'html': return 'text/html';
    case 'css': return 'text/css';
    case 'js': return 'text/javascript';
    case 'ts': return 'text/typescript';
    default: return 'application/octet-stream';
  }
}

/**
 * Download file from Base64 string directly in browser
 */
export function downloadBase64File(base64: string, fileName: string, mimeType?: string): void {
  const bytes = base64ToBytes(base64);
  const type = mimeType || getMimeType(fileName);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Format bytes into human-readable size
 */
export function formatFileSize(bytes?: number): string {
  if (bytes === undefined || bytes === null || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Extract title from Markdown content (first # Heading or file basename)
 */
export function extractTitle(content: string, fallbackName: string): string {
  if (!fallbackName.toLowerCase().endsWith('.md')) {
    return fallbackName;
  }
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      return trimmed.replace(/^#\s+/, '').trim();
    }
  }
  return fallbackName.replace(/\.md$/, '');
}
