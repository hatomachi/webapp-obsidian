export interface MinutesConfig {
  target: string;              // Target folder or meeting folder
  title?: string;              // Custom title
  audio?: string;              // Explicit audio filename (optional)
  transcript?: string;         // Explicit transcript filename (optional)
  minutes?: string;            // Explicit minutes markdown filename (optional)
  defaultSpeed?: number;       // Default playback speed (e.g. 1.0, 1.25)
  showScreenshots?: boolean;   // Whether to show screenshots in timeline (default true)
}

export interface MeetingItem {
  id: string;
  folderPath: string;
  folderName: string;
  displayTitle: string;
  dateStr?: string;
}

export interface TranscriptSegment {
  id: string;
  start: number;               // Starting time in seconds
  end?: number;                // Ending time in seconds
  text: string;                // Transcribed text
  speaker?: string;            // Speaker name if available
  formattedTime: string;       // Formatted time (e.g., "05:12" or "01:23:45")
}

export interface MeetingScreenshot {
  fileName: string;
  filePath: string;
  seconds: number;             // Timestamp in seconds parsed from filename
  formattedTime: string;       // Formatted time (e.g., "05:12")
  rawBase64?: string;
  blobUrl?: string;
  isLoading?: boolean;
}

export interface MeetingData {
  meetingItem: MeetingItem;
  audioPath?: string;
  audioBlobUrl?: string;
  audioLoading: boolean;
  transcriptPath?: string;
  segments: TranscriptSegment[];
  transcriptLoading: boolean;
  screenshots: MeetingScreenshot[];
  screenshotsLoading: boolean;
  minutesPath?: string;
  minutesContent?: string;
  minutesSha?: string;
  minutesLoading: boolean;
}

export type MinutesTab = 'timeline' | 'minutes' | 'split';
