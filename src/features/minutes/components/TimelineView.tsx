import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Play, Clock, Search, User, Image as ImageIcon } from 'lucide-react';
import { TranscriptSegment, MeetingScreenshot } from '../types';

interface TimelineViewProps {
  segments: TranscriptSegment[];
  screenshots: MeetingScreenshot[];
  currentTime: number;
  isPlaying: boolean;
  autoScroll: boolean;
  onSeek: (seconds: number) => void;
  onSelectScreenshot: (screenshot: MeetingScreenshot) => void;
  loadScreenshotImage: (filePath: string) => Promise<string | null>;
}

export const TimelineView: React.FC<TimelineViewProps> = ({
  segments,
  screenshots,
  currentTime,
  isPlaying,
  autoScroll,
  onSeek,
  onSelectScreenshot,
  loadScreenshotImage,
}) => {
  const [searchFilter, setSearchFilter] = useState('');
  const activeSegmentRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Group screenshots by closest transcript segment
  const screenshotsBySegmentId = useMemo(() => {
    const map = new Map<string, MeetingScreenshot[]>();
    if (segments.length === 0 || screenshots.length === 0) return map;

    screenshots.forEach((shot) => {
      // Find segment whose start <= shot.seconds < next segment.start
      let matchedSegId: string | null = null;
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const nextSeg = segments[i + 1];
        if (shot.seconds >= seg.start && (!nextSeg || shot.seconds < nextSeg.start)) {
          matchedSegId = seg.id;
          break;
        }
      }
      // If shot is before the first segment, assign to first
      if (!matchedSegId && segments.length > 0) {
        matchedSegId = segments[0].id;
      }

      if (matchedSegId) {
        if (!map.has(matchedSegId)) map.set(matchedSegId, []);
        map.get(matchedSegId)!.push(shot);
      }
    });

    return map;
  }, [segments, screenshots]);

  // Identify currently active segment based on currentTime
  const activeSegmentId = useMemo(() => {
    if (segments.length === 0) return null;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const nextSeg = segments[i + 1];
      const endTime = seg.end !== undefined ? seg.end : nextSeg ? nextSeg.start : seg.start + 10;
      if (currentTime >= seg.start && currentTime < endTime) {
        return seg.id;
      }
    }
    // If beyond last segment but close
    const lastSeg = segments[segments.length - 1];
    if (currentTime >= lastSeg.start) {
      return lastSeg.id;
    }
    return null;
  }, [segments, currentTime]);

  // Auto scroll to active segment
  useEffect(() => {
    if (!autoScroll || !isPlaying || !activeSegmentId) return;

    if (activeSegmentRef.current && containerRef.current) {
      activeSegmentRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [activeSegmentId, autoScroll, isPlaying]);

  // Filter segments by search query
  const filteredSegments = useMemo(() => {
    if (!searchFilter.trim()) return segments;
    const q = searchFilter.toLowerCase();
    return segments.filter(
      (s) =>
        s.text.toLowerCase().includes(q) ||
        (s.speaker && s.speaker.toLowerCase().includes(q)) ||
        s.formattedTime.includes(q)
    );
  }, [segments, searchFilter]);

  // Lazy load screenshots when rendered
  useEffect(() => {
    screenshots.forEach((shot) => {
      if (!shot.blobUrl) {
        loadScreenshotImage(shot.filePath);
      }
    });
  }, [screenshots, loadScreenshotImage]);

  if (segments.length === 0) {
    return (
      <div className="py-16 text-center text-zinc-500 bg-zinc-900/40 rounded-2xl border border-zinc-800/60 p-8">
        <Clock className="w-10 h-10 mx-auto mb-3 text-zinc-600 opacity-60" />
        <p className="text-sm font-medium text-zinc-400">文字起こしデータ（YAML）がありません</p>
        <p className="text-xs text-zinc-600 mt-1">
          会議フォルダ内に transcript.yaml または whisper.yaml を配置してください
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Search filter bar */}
      <div className="relative flex items-center">
        <Search className="w-4 h-4 absolute left-3 text-zinc-500 pointer-events-none" />
        <input
          type="text"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          placeholder={`文字起こしを検索 (${segments.length} 行)...`}
          className="w-full pl-9 pr-4 py-2 bg-zinc-900/80 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all"
        />
        {searchFilter && (
          <button
            type="button"
            onClick={() => setSearchFilter('')}
            className="absolute right-3 text-xs text-zinc-400 hover:text-zinc-200"
          >
            ✕
          </button>
        )}
      </div>

      {/* Segments timeline list */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar pb-10"
      >
        {filteredSegments.map((segment) => {
          const isActive = segment.id === activeSegmentId;
          const attachedScreenshots = screenshotsBySegmentId.get(segment.id) || [];

          return (
            <div
              key={segment.id}
              ref={isActive ? activeSegmentRef : null}
              className={`group relative rounded-xl p-3 border transition-all duration-150 ${
                isActive
                  ? 'bg-purple-950/30 border-purple-600/70 shadow-md shadow-purple-900/20'
                  : 'bg-zinc-900/40 hover:bg-zinc-900/80 border-zinc-800/60 hover:border-zinc-700/80'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {/* Timestamp Jump Button */}
                <button
                  type="button"
                  onClick={() => onSeek(segment.start)}
                  className={`flex-shrink-0 px-2 py-1 rounded-md text-[11px] font-mono font-medium flex items-center gap-1 transition-all ${
                    isActive
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'bg-zinc-800/80 hover:bg-purple-900/50 text-zinc-400 hover:text-purple-300 border border-zinc-700/50'
                  }`}
                  title={`${segment.formattedTime} から再生`}
                >
                  <Play className={`w-2.5 h-2.5 ${isActive ? 'fill-current' : ''}`} />
                  <span>{segment.formattedTime}</span>
                </button>

                {/* Content body */}
                <div className="flex-1 min-w-0">
                  {/* Speaker name if present */}
                  {segment.speaker && (
                    <div className="flex items-center gap-1 mb-1 text-[11px] font-medium text-purple-400/90">
                      <User className="w-3 h-3" />
                      <span>{segment.speaker}</span>
                    </div>
                  )}

                  {/* Transcribed text */}
                  <p
                    className={`text-sm leading-relaxed select-text cursor-pointer ${
                      isActive ? 'text-zinc-100 font-medium' : 'text-zinc-300'
                    }`}
                    onClick={() => onSeek(segment.start)}
                  >
                    {segment.text}
                  </p>

                  {/* Attached screenshots for this timestamp */}
                  {attachedScreenshots.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2.5 pt-2 border-t border-zinc-800/60">
                      {attachedScreenshots.map((shot) => (
                        <div
                          key={shot.filePath}
                          onClick={() => onSelectScreenshot(shot)}
                          className="group/img relative rounded-lg overflow-hidden border border-zinc-700/70 bg-black/40 hover:border-purple-500/80 cursor-pointer shadow transition-all hover:scale-[1.02]"
                        >
                          {shot.blobUrl ? (
                            <img
                              src={shot.blobUrl}
                              alt={shot.fileName}
                              className="w-36 sm:w-44 h-24 sm:h-28 object-cover rounded-md"
                            />
                          ) : (
                            <div className="w-36 sm:w-44 h-24 sm:h-28 flex flex-col items-center justify-center text-zinc-500 bg-zinc-800/40">
                              <ImageIcon className="w-6 h-6 mb-1 opacity-50" />
                              <span className="text-[10px]">画像読込中...</span>
                            </div>
                          )}

                          {/* Screenshot badge */}
                          <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-xs text-[10px] font-mono text-zinc-300 flex items-center gap-1 border border-white/10">
                            <Clock className="w-2.5 h-2.5 text-purple-400" />
                            <span>{shot.formattedTime}</span>
                          </div>

                          {/* Hover overlay hint */}
                          <div className="absolute inset-0 bg-purple-900/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="p-1 rounded-full bg-black/60 text-white text-xs">
                              🔍 拡大
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
