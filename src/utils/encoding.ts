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
 * Browser-safe UTF-8 Base64 Decoder
 */
export function base64ToUtf8(base64: string): string {
  const cleanBase64 = base64.replace(/\s/g, '');
  const binary = window.atob(cleanBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * Extract title from Markdown content (first # Heading or file basename)
 */
export function extractTitle(content: string, fallbackName: string): string {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      return trimmed.replace(/^#\s+/, '').trim();
    }
  }
  return fallbackName.replace(/\.md$/, '');
}
