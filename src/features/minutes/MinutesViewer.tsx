import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ChevronDown,
  FileText,
  Clock,
  Columns,
  Sparkles,
  RefreshCw,
  FolderOpen,
} from 'lucide-react';
import { VaultConfig } from '../../types';
import { useMinutesData } from './useMinutesData';
import { AudioPlayerBar } from './components/AudioPlayerBar';
import { TimelineView } from './components/TimelineView';
import { MinutesMarkdownView } from './components/MinutesMarkdownView';
import { ImageModal } from './components/ImageModal';
import { MeetingScreenshot, MinutesTab } from './types';

interface MinutesViewerProps {
  vault: VaultConfig;
  filePath: string;
  content: string;
  allFilePaths: string[];
  onNavigateFile: (path: string, heading?: string) => void;
  onOpenEditModal?: () => void;
}

export const MinutesViewer: React.FC<MinutesViewerProps> = ({
  vault,
  filePath,
  content,
  allFilePaths,
  onNavigateFile,
}) => {
  const {
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
    segments,

    // Screenshots
    screenshots,
    loadScreenshotImage,

    // Minutes
    minutesPath,
    minutesText,
    minutesLoading,
    isSavingMinutes,
    saveMinutes,
  } = useMinutesData({
    vault,
    minutesFilePath: filePath,
    minutesContent: content,
    allFilePaths,
  });

  // Audio state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(config.defaultSpeed || 1.0);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);

  // Tab state: 'timeline' | 'minutes' | 'split'
  const [activeTab, setActiveTab] = useState<MinutesTab>('timeline');

  // Screenshot modal preview state
  const [activeScreenshot, setActiveScreenshot] = useState<MeetingScreenshot | null>(null);

  // Sync audio duration and current time
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => {
      setDuration(audio.duration || 0);
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime || 0);
    };

    const onEnded = () => {
      setIsPlaying(false);
    };

    const onPlay = () => {
      setIsPlaying(true);
    };

    const onPause = () => {
      setIsPlaying(false);
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, [audioBlobUrl]);

  // Handle Play/Pause
  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audioBlobUrl) return;

    if (audio.paused) {
      audio.play().catch((err) => console.warn('[Minutes] Audio play error:', err));
    } else {
      audio.pause();
    }
  }, [audioBlobUrl]);

  // Handle Seek
  const handleSeek = useCallback(
    (seconds: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = seconds;
      setCurrentTime(seconds);

      // If paused, auto-play on seek for smooth experience
      if (audio.paused && audioBlobUrl) {
        audio.play().catch(() => {});
      }
    },
    [audioBlobUrl]
  );

  // Handle Playback rate change
  const handleChangePlaybackRate = useCallback((rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  }, []);

  // Keyboard shortcut: Space to play/pause (ignore if focused on inputs/textareas)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        handlePlayPause();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePlayPause]);

  return (
    <div className="w-full max-w-6xl mx-auto px-2 sm:px-4 py-4 flex flex-col min-h-[calc(100vh-140px)]">
      {/* Hidden audio element */}
      {audioBlobUrl && (
        <audio
          ref={audioRef}
          src={audioBlobUrl}
          preload="metadata"
          className="hidden"
        />
      )}

      {/* Header bar: Title, meeting picker, tabs */}
      <div className="bg-[#121216]/90 border border-zinc-800/80 rounded-2xl p-3 sm:p-4 mb-4 shadow-lg backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left: Meeting Picker / Title */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-purple-950/60 border border-purple-700/50 flex items-center justify-center text-purple-400 shadow-inner flex-shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold uppercase tracking-wider text-purple-400">
                  議事録ビューア
                </span>
                {meetings.length > 1 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                    全 {meetings.length} 件
                  </span>
                )}
              </div>

              {meetings.length > 1 ? (
                /* Multiple meetings selector */
                <div className="relative mt-0.5">
                  <select
                    value={selectedMeetingId || ''}
                    onChange={(e) => setSelectedMeetingId(e.target.value)}
                    className="w-full max-w-md appearance-none bg-zinc-800/90 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-100 font-semibold text-sm rounded-lg px-2.5 py-1 pr-8 cursor-pointer focus:outline-none focus:ring-1 focus:ring-purple-500 truncate transition-colors"
                  >
                    {meetings.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.displayTitle}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              ) : (
                /* Single meeting title */
                <h1 className="text-base sm:text-lg font-bold text-zinc-100 truncate mt-0.5">
                  {activeMeeting ? activeMeeting.displayTitle : config.title || filePath.split('/').pop()}
                </h1>
              )}
            </div>
          </div>

          {/* Right: Tabs */}
          <div className="flex items-center gap-1 bg-zinc-900/90 border border-zinc-800/80 p-1 rounded-xl self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setActiveTab('timeline')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'timeline'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>タイムライン</span>
              {segments.length > 0 && (
                <span className="text-[10px] px-1 rounded bg-black/30 font-normal">
                  {segments.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('minutes')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'minutes'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>議事録</span>
            </button>

            {/* Split view (available on wide screens) */}
            <button
              type="button"
              onClick={() => setActiveTab('split')}
              className={`hidden md:flex px-3 py-1.5 rounded-lg text-xs font-semibold items-center gap-1.5 transition-all ${
                activeTab === 'split'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
              title="タイムラインと議事録を左右に同時表示"
            >
              <Columns className="w-3.5 h-3.5" />
              <span>分割</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col mb-4 min-h-[450px]">
        {isLoadingMeetings ? (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 py-24">
            <RefreshCw className="w-8 h-8 animate-spin mb-3 text-purple-400" />
            <p className="text-sm font-medium">会議フォルダを探索中...</p>
          </div>
        ) : meetings.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 py-24 bg-zinc-900/30 rounded-2xl border border-zinc-800/60 p-8 text-center">
            <FolderOpen className="w-12 h-12 mb-3 text-zinc-600 opacity-60" />
            <h3 className="text-base font-semibold text-zinc-300">対象フォルダに会議が見つかりません</h3>
            <p className="text-xs text-zinc-500 mt-2 max-w-md">
              設定された <code>target: {config.target}</code> 配下に会議フォルダ（音声、文字起こしyaml、議事録md）を配置してください。
            </p>
          </div>
        ) : activeTab === 'timeline' ? (
          /* Timeline Tab */
          <div className="flex-1 bg-[#121216]/60 border border-zinc-800/60 rounded-2xl p-3 sm:p-4 shadow-md">
            <TimelineView
              segments={segments}
              screenshots={screenshots}
              currentTime={currentTime}
              isPlaying={isPlaying}
              autoScroll={autoScroll}
              onSeek={handleSeek}
              onSelectScreenshot={(shot) => setActiveScreenshot(shot)}
              loadScreenshotImage={loadScreenshotImage}
            />
          </div>
        ) : activeTab === 'minutes' ? (
          /* Minutes Tab */
          <div className="flex-1 bg-[#121216]/60 border border-zinc-800/60 rounded-2xl p-3 sm:p-4 shadow-md">
            <MinutesMarkdownView
              minutesText={minutesText}
              minutesPath={minutesPath}
              minutesLoading={minutesLoading}
              isSaving={isSavingMinutes}
              currentTime={currentTime}
              allFilePaths={allFilePaths}
              onSeek={handleSeek}
              onSaveMinutes={saveMinutes}
              onNavigateFile={onNavigateFile}
            />
          </div>
        ) : (
          /* Split View (Two Columns) */
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left: Timeline */}
            <div className="bg-[#121216]/60 border border-zinc-800/60 rounded-2xl p-3 sm:p-4 shadow-md flex flex-col h-[70vh]">
              <div className="text-xs font-semibold text-purple-400 mb-2 flex items-center gap-1.5 pb-2 border-b border-zinc-800/80">
                <Clock className="w-3.5 h-3.5" />
                <span>文字起こし ＆ 会議スクショ</span>
              </div>
              <div className="flex-1 overflow-hidden">
                <TimelineView
                  segments={segments}
                  screenshots={screenshots}
                  currentTime={currentTime}
                  isPlaying={isPlaying}
                  autoScroll={autoScroll}
                  onSeek={handleSeek}
                  onSelectScreenshot={(shot) => setActiveScreenshot(shot)}
                  loadScreenshotImage={loadScreenshotImage}
                />
              </div>
            </div>

            {/* Right: Minutes */}
            <div className="bg-[#121216]/60 border border-zinc-800/60 rounded-2xl p-3 sm:p-4 shadow-md flex flex-col h-[70vh]">
              <div className="text-xs font-semibold text-purple-400 mb-2 flex items-center gap-1.5 pb-2 border-b border-zinc-800/80">
                <FileText className="w-3.5 h-3.5" />
                <span>議事録（Markdown）</span>
              </div>
              <div className="flex-1 overflow-hidden">
                <MinutesMarkdownView
                  minutesText={minutesText}
                  minutesPath={minutesPath}
                  minutesLoading={minutesLoading}
                  isSaving={isSavingMinutes}
                  currentTime={currentTime}
                  allFilePaths={allFilePaths}
                  onSeek={handleSeek}
                  onSaveMinutes={saveMinutes}
                  onNavigateFile={onNavigateFile}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sticky Bottom Audio Player Bar */}
      <div className="sticky bottom-2 sm:bottom-4 z-30 pt-2">
        <AudioPlayerBar
          audioBlobUrl={audioBlobUrl}
          audioLoading={audioLoading}
          audioError={audioError}
          audioPath={audioPath}
          currentTime={currentTime}
          duration={duration}
          isPlaying={isPlaying}
          playbackRate={playbackRate}
          autoScroll={autoScroll}
          onPlayPause={handlePlayPause}
          onSeek={handleSeek}
          onChangePlaybackRate={handleChangePlaybackRate}
          onToggleAutoScroll={() => setAutoScroll((prev) => !prev)}
        />
      </div>

      {/* Screenshot Lightbox Modal */}
      <ImageModal
        screenshot={activeScreenshot}
        onClose={() => setActiveScreenshot(null)}
        onSeek={handleSeek}
      />
    </div>
  );
};
