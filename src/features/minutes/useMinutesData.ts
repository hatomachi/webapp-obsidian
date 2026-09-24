import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { VaultConfig } from '../../types';
import { GitService } from '../../services/GitService';
import {
  MeetingItem,
  TranscriptSegment,
  MeetingScreenshot,
} from './types';
import {
  parseMinutesConfig,
  parseTimestampFromFileName,
  parseWhisperYaml,
  formatMeetingFolderName,
} from './minutesParser';
import { saveMinutesMarkdown } from './minutesUpdater';

/**
 * Convert Base64 string to Blob
 */
function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

/**
 * Determine audio MIME type from file extension
 */
function getAudioMimeType(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.webm')) return 'audio/webm';
  if (lower.endsWith('.aac')) return 'audio/aac';
  return 'audio/mpeg';
}

/**
 * Determine image MIME type from file extension
 */
function getImageMimeType(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

interface UseMinutesDataProps {
  vault: VaultConfig;
  minutesFilePath: string;
  minutesContent: string;
  allFilePaths: string[];
}

export function useMinutesData({
  vault,
  minutesFilePath,
  minutesContent,
  allFilePaths,
}: UseMinutesDataProps) {
  // Parse configuration
  const config = useMemo(() => {
    return parseMinutesConfig(minutesContent, minutesFilePath);
  }, [minutesContent, minutesFilePath]);

  // State
  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [meetingFilesMap, setMeetingFilesMap] = useState<Map<string, string[]>>(new Map());
  const [isLoadingMeetings, setIsLoadingMeetings] = useState<boolean>(true);

  // Active meeting detail state
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const [audioPath, setAudioPath] = useState<string | undefined>(undefined);
  const [audioLoading, setAudioLoading] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [transcriptPath, setTranscriptPath] = useState<string | undefined>(undefined);
  const [transcriptLoading, setTranscriptLoading] = useState<boolean>(false);

  const [screenshots, setScreenshots] = useState<MeetingScreenshot[]>([]);
  const [screenshotsLoading] = useState<boolean>(false);

  const [minutesText, setMinutesText] = useState<string>('');
  const [minutesSha, setMinutesSha] = useState<string | undefined>(undefined);
  const [minutesPath, setMinutesPath] = useState<string | undefined>(undefined);
  const [minutesLoading, setMinutesLoading] = useState<boolean>(false);
  const [isSavingMinutes, setIsSavingMinutes] = useState<boolean>(false);

  // Cache for screenshot blob URLs
  const screenshotBlobsRef = useRef<Map<string, string>>(new Map());
  const currentAudioUrlRef = useRef<string | null>(null);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (currentAudioUrlRef.current) {
        URL.revokeObjectURL(currentAudioUrlRef.current);
        currentAudioUrlRef.current = null;
      }
      screenshotBlobsRef.current.forEach((url) => URL.revokeObjectURL(url));
      screenshotBlobsRef.current.clear();
    };
  }, []);

  /**
   * 1. Discover meetings and their sub-files
   */
  useEffect(() => {
    let isCancelled = false;

    async function discoverMeetings() {
      setIsLoadingMeetings(true);
      const target = config.target.trim().replace(/\/+$/, '');
      const filesMap = new Map<string, string[]>();

      // Filter all file paths under target folder
      const targetPrefix = target ? `${target}/` : '';
      let relevantPaths = allFilePaths.filter((p) => {
        if (p === minutesFilePath) return false;
        if (!target) return true;
        return p.startsWith(targetPrefix) || p === target;
      });

      // If no relevant paths found from allFilePaths (e.g. lazy-loaded vault), fetch directory children
      if (relevantPaths.length === 0 && target) {
        try {
          const children = await GitService.fetchDirectoryChildren(vault, target);
          const childPaths: string[] = [];
          for (const child of children) {
            if (child.type === 'blob') {
              childPaths.push(child.path);
            } else if (child.type === 'tree') {
              // Fetch grandchildren
              try {
                const grandChildren = await GitService.fetchDirectoryChildren(vault, child.path);
                grandChildren.forEach((gc) => {
                  if (gc.type === 'blob') childPaths.push(gc.path);
                });
              } catch {
                // ignore
              }
            }
          }
          relevantPaths = childPaths;
        } catch (err) {
          console.warn('[Minutes] Could not fetch directory children directly:', err);
        }
      }

      // Check if target itself is a single meeting folder (contains audio, transcript, or minutes directly)
      const directFiles = relevantPaths.filter((p) => {
        const rel = target ? p.substring(target.length).replace(/^\/+/, '') : p;
        return !rel.includes('/'); // direct children
      });

      const hasDirectAudio = directFiles.some((p) =>
        /\.(mp3|m4a|wav|ogg|webm|aac)$/i.test(p)
      );
      const hasDirectTranscript = directFiles.some((p) =>
        /\.(yaml|yml)$/i.test(p) && /transcript|whisper/i.test(p)
      );

      const items: MeetingItem[] = [];

      if ((hasDirectAudio || hasDirectTranscript) && target) {
        // Mode A: target is a single meeting folder
        const folderName = target.split('/').pop() || target;
        const formatted = formatMeetingFolderName(folderName);
        items.push({
          id: target,
          folderPath: target,
          folderName,
          displayTitle: config.title || formatted.displayTitle,
          dateStr: formatted.dateStr,
        });
        filesMap.set(target, directFiles);
      } else {
        // Mode B: target contains multiple subfolders (one per meeting)
        const subfolderMap = new Map<string, string[]>();

        relevantPaths.forEach((path) => {
          const rel = target ? path.substring(target.length).replace(/^\/+/, '') : path;
          const parts = rel.split('/');
          if (parts.length >= 2) {
            // It is inside a subfolder!
            const subfolder = parts[0];
            const fullSubfolderPath = target ? `${target}/${subfolder}` : subfolder;
            if (!subfolderMap.has(fullSubfolderPath)) {
              subfolderMap.set(fullSubfolderPath, []);
            }
            subfolderMap.get(fullSubfolderPath)!.push(path);
          }
        });

        // Convert subfolders to MeetingItems
        subfolderMap.forEach((files, folderPath) => {
          const folderName = folderPath.split('/').pop() || folderPath;
          const formatted = formatMeetingFolderName(folderName);
          items.push({
            id: folderPath,
            folderPath,
            folderName,
            displayTitle: formatted.displayTitle,
            dateStr: formatted.dateStr,
          });
          filesMap.set(folderPath, files);
        });

        // Sort meetings: newest first (by dateStr if available, else folderName descending)
        items.sort((a, b) => {
          if (a.dateStr && b.dateStr) {
            return b.dateStr.localeCompare(a.dateStr);
          }
          return b.folderName.localeCompare(a.folderName);
        });
      }

      if (!isCancelled) {
        setMeetings(items);
        setMeetingFilesMap(filesMap);
        setIsLoadingMeetings(false);

        // Auto-select first meeting if none selected
        if (items.length > 0) {
          setSelectedMeetingId((prev) => {
            if (prev && items.some((m) => m.id === prev)) return prev;
            return items[0].id;
          });
        }
      }
    }

    discoverMeetings();

    return () => {
      isCancelled = true;
    };
  }, [config.target, config.title, minutesFilePath, allFilePaths, vault]);

  /**
   * 2. Load active meeting details whenever selectedMeetingId changes
   */
  const activeMeeting = useMemo(() => {
    return meetings.find((m) => m.id === selectedMeetingId) || null;
  }, [meetings, selectedMeetingId]);

  useEffect(() => {
    if (!activeMeeting) return;

    let isCancelled = false;
    const folderPath = activeMeeting.folderPath;
    const files = meetingFilesMap.get(folderPath) || [];

    // Reset previous audio Blob URL
    if (currentAudioUrlRef.current) {
      URL.revokeObjectURL(currentAudioUrlRef.current);
      currentAudioUrlRef.current = null;
    }
    setAudioBlobUrl(null);
    setAudioError(null);

    // Identify audio file
    let foundAudio = config.audio
      ? files.find((p) => p.endsWith(config.audio!))
      : files.find((p) => /\.(mp3|m4a|wav|ogg|webm|aac)$/i.test(p));

    setAudioPath(foundAudio);

    // Identify transcript file
    let foundTranscript = config.transcript
      ? files.find((p) => p.endsWith(config.transcript!))
      : files.find((p) => /transcript|whisper/i.test(p) && /\.(yaml|yml)$/i.test(p)) ||
        files.find((p) => /\.(yaml|yml)$/i.test(p));

    setTranscriptPath(foundTranscript);

    // Identify minutes markdown file
    let foundMinutes = config.minutes
      ? files.find((p) => p.endsWith(config.minutes!))
      : files.find((p) => /minute|議事録|readme|notes?/i.test(p) && /\.(md|markdown)$/i.test(p)) ||
        files.find((p) => /\.(md|markdown)$/i.test(p) && p !== minutesFilePath);

    setMinutesPath(foundMinutes);

    // Identify screenshot files
    const screenshotFiles = files.filter((p) => /\.(jpg|jpeg|png|webp)$/i.test(p));
    const parsedScreenshots: MeetingScreenshot[] = [];

    screenshotFiles.forEach((p) => {
      const fileName = p.split('/').pop() || p;
      const ts = parseTimestampFromFileName(fileName);
      if (ts) {
        parsedScreenshots.push({
          fileName,
          filePath: p,
          seconds: ts.seconds,
          formattedTime: ts.formattedTime,
          blobUrl: screenshotBlobsRef.current.get(p),
        });
      }
    });

    // Sort screenshots by seconds
    parsedScreenshots.sort((a, b) => a.seconds - b.seconds);
    setScreenshots(parsedScreenshots);

    // --- Load Transcript ---
    if (foundTranscript) {
      setTranscriptLoading(true);
      GitService.fetchFileContent(vault, foundTranscript)
        .then((res) => {
          if (isCancelled) return;
          const parsed = parseWhisperYaml(res.content);
          setSegments(parsed);
          setTranscriptLoading(false);
        })
        .catch((err) => {
          if (isCancelled) return;
          console.error('[Minutes] Failed to load transcript:', err);
          setSegments([]);
          setTranscriptLoading(false);
        });
    } else {
      setSegments([]);
      setTranscriptLoading(false);
    }

    // --- Load Audio File ---
    if (foundAudio) {
      setAudioLoading(true);
      GitService.fetchFileContent(vault, foundAudio)
        .then((res) => {
          if (isCancelled) return;
          if (res.rawBase64) {
            const mimeType = getAudioMimeType(foundAudio!);
            const blob = base64ToBlob(res.rawBase64, mimeType);
            const blobUrl = URL.createObjectURL(blob);
            currentAudioUrlRef.current = blobUrl;
            setAudioBlobUrl(blobUrl);
          } else {
            setAudioError('音声データの取得に失敗しました');
          }
          setAudioLoading(false);
        })
        .catch((err) => {
          if (isCancelled) return;
          console.error('[Minutes] Failed to load audio file:', err);
          setAudioError('音声ファイルの読み込み中にエラーが発生しました');
          setAudioLoading(false);
        });
    } else {
      setAudioLoading(false);
    }

    // --- Load Minutes Markdown ---
    if (foundMinutes) {
      setMinutesLoading(true);
      GitService.fetchFileContent(vault, foundMinutes)
        .then((res) => {
          if (isCancelled) return;
          setMinutesText(res.content);
          setMinutesSha(res.sha);
          setMinutesLoading(false);
        })
        .catch((err) => {
          if (isCancelled) return;
          console.error('[Minutes] Failed to load minutes markdown:', err);
          setMinutesText('');
          setMinutesLoading(false);
        });
    } else {
      setMinutesText('');
      setMinutesSha(undefined);
      setMinutesLoading(false);
    }

    return () => {
      isCancelled = true;
    };
  }, [activeMeeting, config.audio, config.transcript, config.minutes, minutesFilePath, vault]);

  /**
   * Fetch a screenshot image blob on demand
   */
  const loadScreenshotImage = useCallback(
    async (filePath: string): Promise<string | null> => {
      // Return cached blob URL if available
      if (screenshotBlobsRef.current.has(filePath)) {
        return screenshotBlobsRef.current.get(filePath)!;
      }

      try {
        const res = await GitService.fetchFileContent(vault, filePath);
        if (res.rawBase64) {
          const mimeType = getImageMimeType(filePath);
          const blob = base64ToBlob(res.rawBase64, mimeType);
          const blobUrl = URL.createObjectURL(blob);
          screenshotBlobsRef.current.set(filePath, blobUrl);

          // Update screenshots state with blobUrl
          setScreenshots((prev) =>
            prev.map((s) => (s.filePath === filePath ? { ...s, blobUrl } : s))
          );
          return blobUrl;
        }
      } catch (err) {
        console.warn('[Minutes] Failed to load screenshot image:', filePath, err);
      }
      return null;
    },
    [vault]
  );

  /**
   * Save edited minutes markdown back to Git
   */
  const saveMinutes = useCallback(
    async (newMarkdown: string): Promise<boolean> => {
      if (!minutesPath || !activeMeeting) return false;

      setIsSavingMinutes(true);
      try {
        const res = await saveMinutesMarkdown(
          vault,
          minutesPath,
          newMarkdown,
          minutesSha,
          activeMeeting.displayTitle
        );
        setMinutesText(newMarkdown);
        setMinutesSha(res.newSha);
        setIsSavingMinutes(false);
        return true;
      } catch (err) {
        console.error('[Minutes] Failed to save minutes:', err);
        setIsSavingMinutes(false);
        return false;
      }
    },
    [vault, minutesPath, minutesSha, activeMeeting]
  );

  return {
    config,
    meetings,
    selectedMeetingId,
    setSelectedMeetingId,
    activeMeeting,
    isLoadingMeetings,

    // Audio
    audioPath,
    audioBlobUrl,
    audioLoading,
    audioError,

    // Transcript
    transcriptPath,
    segments,
    transcriptLoading,

    // Screenshots
    screenshots,
    screenshotsLoading,
    loadScreenshotImage,

    // Minutes
    minutesPath,
    minutesText,
    minutesSha,
    minutesLoading,
    isSavingMinutes,
    saveMinutes,
  };
}
