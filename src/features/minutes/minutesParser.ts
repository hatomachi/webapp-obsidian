import YAML from 'yaml';
import { MinutesConfig, TranscriptSegment } from './types';

/**
 * Check if a file is considered a Minutes Viewer file
 */
export function isMinutesFile(filePath: string, content?: string): boolean {
  if (!filePath) return false;
  const lower = filePath.toLowerCase();

  // Supported extensions:
  // .minutes, .minutesv, .minute
  // .minutes.yaml, .minutes.yml, .minutes.md
  // .minutesv.yaml, .minutesv.yml, .minutesv.md
  if (
    lower.endsWith('.minutes') ||
    lower.endsWith('.minutesv') ||
    lower.endsWith('.minute') ||
    lower.endsWith('.minutes.yaml') ||
    lower.endsWith('.minutes.yml') ||
    lower.endsWith('.minutes.md') ||
    lower.endsWith('.minutesv.yaml') ||
    lower.endsWith('.minutesv.yml') ||
    lower.endsWith('.minutesv.md')
  ) {
    return true;
  }

  // Frontmatter check for regular markdown: type: minutes or type: meeting or type: minutesv
  if (content && (lower.endsWith('.md') || lower.endsWith('.markdown'))) {
    const fm = extractFrontmatter(content);
    if (fm && (fm.type === 'minutes' || fm.type === 'meeting' || fm.type === 'minutesv')) {
      return true;
    }
  }

  return false;
}

/**
 * Extract YAML frontmatter from Markdown
 */
function extractFrontmatter(content: string): Record<string, any> | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  try {
    return YAML.parse(match[1]);
  } catch {
    return null;
  }
}

/**
 * Parse .minutes definition file
 */
export function parseMinutesConfig(content: string, filePath: string): MinutesConfig {
  let parsed: any = {};
  try {
    // If it's a markdown with frontmatter, parse frontmatter first
    const fm = extractFrontmatter(content);
    if (fm) {
      parsed = fm;
    } else {
      parsed = YAML.parse(content) || {};
    }
  } catch (err) {
    console.warn('[Minutes] Failed to parse YAML config:', err);
  }

  // Extract target path (support target, folder, path, directory)
  let rawTarget = parsed.target || parsed.folder || parsed.path || parsed.directory || '';
  if (typeof rawTarget !== 'string') {
    rawTarget = String(rawTarget);
  }
  rawTarget = rawTarget.trim().replace(/^['"]|['"]$/g, '');

  // If no target specified, default to the folder of this file
  if (!rawTarget) {
    const parts = filePath.split('/');
    parts.pop(); // remove file name
    rawTarget = parts.join('/');
  } else if (rawTarget.startsWith('./')) {
    const parts = filePath.split('/');
    parts.pop();
    const dir = parts.join('/');
    rawTarget = dir ? `${dir}/${rawTarget.substring(2)}` : rawTarget.substring(2);
  } else if (rawTarget.startsWith('/')) {
    rawTarget = rawTarget.replace(/^\/+/, '');
  }

  // Normalize target (remove trailing slashes)
  rawTarget = rawTarget.replace(/\/+$/, '');

  const title = parsed.title || parsed.name || undefined;
  const audio = parsed.audio || parsed.audioFile || undefined;
  const transcript = parsed.transcript || parsed.transcriptFile || parsed.whisper || undefined;
  const minutes = parsed.minutes || parsed.minutesFile || parsed.note || parsed.md || undefined;
  const defaultSpeed = typeof parsed.defaultSpeed === 'number' ? parsed.defaultSpeed : 1.0;
  const showScreenshots = parsed.showScreenshots !== false;

  return {
    target: rawTarget,
    title,
    audio,
    transcript,
    minutes,
    defaultSpeed,
    showScreenshots,
  };
}

/**
 * Format seconds into MM:SS or HH:MM:SS
 */
export function formatSeconds(totalSeconds: number): string {
  if (isNaN(totalSeconds) || totalSeconds < 0) return '00:00';

  const secs = Math.floor(totalSeconds % 60);
  const totalMins = Math.floor(totalSeconds / 60);
  const mins = Math.floor(totalMins % 60);
  const hours = Math.floor(totalMins / 60);

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (hours > 0) {
    return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

/**
 * Parse time string ("05:12", "01:23:45", "120s", 12.5) into seconds (number)
 */
export function parseSeconds(val: string | number | undefined): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : Math.max(0, val);

  const s = String(val).trim();
  if (!s) return 0;

  // Pure number as string: "123.45"
  if (/^\d+(\.\d+)?$/.test(s)) {
    return parseFloat(s);
  }

  // Seconds suffix: "120s" or "120sec"
  const secMatch = s.match(/^(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)$/i);
  if (secMatch) {
    return parseFloat(secMatch[1]);
  }

  // Colon or underscore separated time: "01:23:45" or "01_23_45" or "05:12" or "05_12"
  const colonParts = s.split(/[:_]/);
  if (colonParts.length === 2 && colonParts.every((p) => /^\d+(\.\d+)?$/.test(p.trim()))) {
    const mins = parseFloat(colonParts[0]);
    const secs = parseFloat(colonParts[1]);
    return mins * 60 + secs;
  }
  if (colonParts.length === 3 && colonParts.every((p) => /^\d+(\.\d+)?$/.test(p.trim()))) {
    const hours = parseFloat(colonParts[0]);
    const mins = parseFloat(colonParts[1]);
    const secs = parseFloat(colonParts[2]);
    return hours * 3600 + mins * 60 + secs;
  }

  const num = parseFloat(s);
  return isNaN(num) ? 0 : num;
}

/**
 * Parse timestamp from meeting screenshot filename
 * Examples:
 * - "00_05_12.jpg" -> 312 seconds ("05:12")
 * - "01_23_45_slide.png" -> 5025 seconds ("01:23:45")
 * - "05_12_screen.jpeg" -> 312 seconds ("05:12")
 * - "05-12.jpg" -> 312 seconds ("05:12")
 * - "120s.png" -> 120 seconds ("02:00")
 * - "312.jpeg" -> 312 seconds ("05:12")
 */
export function parseTimestampFromFileName(
  fileName: string
): { seconds: number; formattedTime: string } | null {
  if (!fileName) return null;

  // Remove extension
  const baseName = fileName.replace(/\.[^/.]+$/, '');

  // 1. Check for HH_MM_SS or HH-MM-SS or HH:MM:SS pattern
  const hmsMatch = baseName.match(/(?:^|[^0-9])(\d{1,2})[-_:.](\d{2})[-_:.](\d{2})(?:[^0-9]|$)/);
  if (hmsMatch) {
    const hours = parseInt(hmsMatch[1], 10);
    const mins = parseInt(hmsMatch[2], 10);
    const secs = parseInt(hmsMatch[3], 10);
    if (mins < 60 && secs < 60) {
      const totalSeconds = hours * 3600 + mins * 60 + secs;
      return {
        seconds: totalSeconds,
        formattedTime: formatSeconds(totalSeconds),
      };
    }
  }

  // 2. Check for MM_SS or MM-SS or MM:SS pattern
  const msMatch = baseName.match(/(?:^|[^0-9])(\d{1,2})[-_:.](\d{2})(?:[^0-9]|$)/);
  if (msMatch) {
    const mins = parseInt(msMatch[1], 10);
    const secs = parseInt(msMatch[2], 10);
    if (secs < 60) {
      const totalSeconds = mins * 60 + secs;
      return {
        seconds: totalSeconds,
        formattedTime: formatSeconds(totalSeconds),
      };
    }
  }

  // 3. Check for seconds suffix: e.g. "120s", "300sec", "shot_120s"
  const secMatch = baseName.match(/(?:^|[^0-9])(\d+)(?:s|sec|seconds)(?:[^a-z0-9]|$)/i);
  if (secMatch) {
    const totalSeconds = parseInt(secMatch[1], 10);
    return {
      seconds: totalSeconds,
      formattedTime: formatSeconds(totalSeconds),
    };
  }

  // 4. Check for purely numeric filename (if 1 to 5 digits, treat as seconds)
  const pureNumMatch = baseName.match(/^(\d{1,5})$/);
  if (pureNumMatch) {
    const totalSeconds = parseInt(pureNumMatch[1], 10);
    return {
      seconds: totalSeconds,
      formattedTime: formatSeconds(totalSeconds),
    };
  }

  return null;
}

/**
 * Parse Whisper transcription YAML into standardized TranscriptSegment array
 */
export function parseWhisperYaml(yamlContent: string): TranscriptSegment[] {
  if (!yamlContent || !yamlContent.trim()) return [];

  let data: any;
  try {
    data = YAML.parse(yamlContent);
  } catch (err) {
    console.warn('[Minutes] Failed to parse Whisper YAML directly:', err);
    return [];
  }

  if (!data) return [];

  const segments: TranscriptSegment[] = [];

  // Helper to extract segment fields from an item
  const extractFromObject = (item: any, fallbackId: number | string): TranscriptSegment | null => {
    if (!item || typeof item !== 'object') return null;

    // Extract start time
    let startSec = 0;
    if (item.start !== undefined) startSec = parseSeconds(item.start);
    else if (item.time !== undefined) startSec = parseSeconds(item.time);
    else if (item.timestamp !== undefined) startSec = parseSeconds(item.timestamp);
    else if (item.offset !== undefined) startSec = parseSeconds(item.offset);
    else if (item.seconds !== undefined) startSec = parseSeconds(item.seconds);
    else if (item.sec !== undefined) startSec = parseSeconds(item.sec);
    else if (item.s !== undefined) startSec = parseSeconds(item.s);

    // Extract end time
    let endSec: number | undefined = undefined;
    if (item.end !== undefined) endSec = parseSeconds(item.end);

    // Extract text
    const text = item.text || item.content || item.transcript || item.sentence || item.message || '';
    if (typeof text !== 'string' || !text.trim()) return null;

    // Extract speaker
    const speaker = item.speaker || item.name || item.user || item.person || undefined;

    return {
      id: item.id !== undefined ? String(item.id) : `seg-${fallbackId}`,
      start: startSec,
      end: endSec,
      text: text.trim(),
      speaker: speaker ? String(speaker).trim() : undefined,
      formattedTime: formatSeconds(startSec),
    };
  };

  // Case 1: Array at root (most common: [ { start: 0, text: "..." }, ... ])
  if (Array.isArray(data)) {
    data.forEach((item, idx) => {
      const seg = extractFromObject(item, idx);
      if (seg) segments.push(seg);
    });
  }
  // Case 2: Object with 'segments' or 'items' or 'transcripts' array (Whisper JSON output)
  else if (typeof data === 'object') {
    const list = data.segments || data.items || data.transcripts || data.sentences || data.dialogue;
    if (Array.isArray(list)) {
      list.forEach((item, idx) => {
        const seg = extractFromObject(item, idx);
        if (seg) segments.push(seg);
      });
    } else {
      // Case 3: Map/Dict of timestamps to text: { "00:00": "Hello", "00:15": "Next slide" }
      // or { 0: "Hello", 12.5: "..." }
      let index = 0;
      for (const [key, value] of Object.entries(data)) {
        if (key === 'text' || key === 'title' || key === 'language') continue;

        if (typeof value === 'string' && value.trim()) {
          const startSec = parseSeconds(key);
          segments.push({
            id: `seg-${index++}`,
            start: startSec,
            text: value.trim(),
            formattedTime: formatSeconds(startSec),
          });
        } else if (typeof value === 'object' && value !== null) {
          const seg = extractFromObject(value, index++);
          if (seg) {
            // If object didn't have start, use key as start
            if (seg.start === 0 && key !== '0') {
              seg.start = parseSeconds(key);
              seg.formattedTime = formatSeconds(seg.start);
            }
            segments.push(seg);
          }
        }
      }
    }
  }

  // Sort segments by start time
  segments.sort((a, b) => a.start - b.start);

  return segments;
}

/**
 * Format meeting folder name into display title & date
 * Example: "2026-09-24_定例会議" -> { dateStr: "2026-09-24", displayTitle: "2026-09-24 定例会議" }
 */
export function formatMeetingFolderName(folderName: string): {
  dateStr?: string;
  displayTitle: string;
} {
  const clean = folderName.replace(/^[./]+|[./]+$/g, '');
  const dateMatch = clean.match(/^(\d{4}[-_.]\d{2}[-_.]\d{2})[-_.]?(.*)$/);

  if (dateMatch) {
    const rawDate = dateMatch[1].replace(/[-_.]/g, '-');
    const rest = dateMatch[2].replace(/^[-_.]/, '').trim();
    return {
      dateStr: rawDate,
      displayTitle: rest ? `${rawDate} ${rest}` : rawDate,
    };
  }

  return {
    displayTitle: clean.replace(/_/g, ' '),
  };
}
