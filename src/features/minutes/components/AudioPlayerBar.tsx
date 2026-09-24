import React, { useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Gauge,
  Loader2,
  Compass,
} from 'lucide-react';
import { formatSeconds } from '../minutesParser';

interface AudioPlayerBarProps {
  audioBlobUrl: string | null;
  audioLoading: boolean;
  audioError: string | null;
  audioPath?: string;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  playbackRate: number;
  autoScroll: boolean;
  onPlayPause: () => void;
  onSeek: (seconds: number) => void;
  onChangePlaybackRate: (rate: number) => void;
  onToggleAutoScroll: () => void;
}

const PLAYBACK_RATES = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

export const AudioPlayerBar: React.FC<AudioPlayerBarProps> = ({
  audioBlobUrl,
  audioLoading,
  audioError,
  audioPath,
  currentTime,
  duration,
  isPlaying,
  playbackRate,
  autoScroll,
  onPlayPause,
  onSeek,
  onChangePlaybackRate,
  onToggleAutoScroll,
}) => {
  const [isSeekingLocally, setIsSeekingLocally] = useState(false);
  const [localSeekTime, setLocalSeekTime] = useState(0);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // If no audio is available
  if (!audioBlobUrl && !audioLoading) {
    return (
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3 px-4 flex items-center justify-between text-xs text-zinc-400 backdrop-blur-md shadow-md">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-500/80 animate-pulse" />
          <span>音声ファイル未検出 ({audioPath ? audioPath.split('/').pop() : 'mp3 / m4a なし'})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleAutoScroll}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              autoScroll
                ? 'bg-purple-900/40 text-purple-300 border border-purple-700/50'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>追従 {autoScroll ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </div>
    );
  }

  const effectiveTime = isSeekingLocally ? localSeekTime : currentTime;
  const progressPercent = duration > 0 ? Math.min(100, (effectiveTime / duration) * 100) : 0;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setLocalSeekTime(val);
  };

  const handleSliderMouseDown = () => {
    setIsSeekingLocally(true);
    setLocalSeekTime(currentTime);
  };

  const handleSliderMouseUp = (e: React.MouseEvent<HTMLInputElement>) => {
    setIsSeekingLocally(false);
    const val = parseFloat((e.target as HTMLInputElement).value);
    onSeek(val);
  };

  const handleSliderTouchEnd = (e: React.TouchEvent<HTMLInputElement>) => {
    setIsSeekingLocally(false);
    const val = parseFloat((e.target as HTMLInputElement).value);
    onSeek(val);
  };

  const handleSkip = (secondsDelta: number) => {
    const nextTime = Math.max(0, Math.min(duration || 999999, currentTime + secondsDelta));
    onSeek(nextTime);
  };

  return (
    <div className="bg-[#16161a]/95 border border-zinc-800/80 rounded-2xl p-3 sm:p-4 shadow-xl backdrop-blur-md select-none transition-all">
      {/* Top row: progress slider & timestamps */}
      <div className="flex items-center gap-3 mb-2">
        <span className="text-xs font-mono font-medium text-purple-300 min-w-[42px] text-right">
          {formatSeconds(effectiveTime)}
        </span>

        {/* Seekbar Slider */}
        <div className="relative flex-1 flex items-center h-6 group cursor-pointer">
          <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-75"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={effectiveTime}
            onChange={handleSliderChange}
            onMouseDown={handleSliderMouseDown}
            onMouseUp={handleSliderMouseUp}
            onTouchStart={handleSliderMouseDown}
            onTouchEnd={handleSliderTouchEnd}
            disabled={audioLoading || !audioBlobUrl}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          />
        </div>

        <span className="text-xs font-mono font-medium text-zinc-500 min-w-[42px]">
          {formatSeconds(duration)}
        </span>
      </div>

      {/* Bottom row: controls */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* Left: Speed & AutoScroll */}
        <div className="flex items-center gap-1.5 relative">
          {/* Speed Selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSpeedMenu(!showSpeedMenu)}
              disabled={audioLoading}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700/80 text-zinc-300 text-xs font-semibold flex items-center gap-1 border border-zinc-700/50 transition-colors"
              title="再生速度"
            >
              <Gauge className="w-3.5 h-3.5 text-purple-400" />
              <span>{playbackRate.toFixed(2).replace(/\.00$/, '')}x</span>
            </button>

            {showSpeedMenu && (
              <div className="absolute bottom-full left-0 mb-2 py-1 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-30 flex flex-col min-w-[80px]">
                {PLAYBACK_RATES.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => {
                      onChangePlaybackRate(rate);
                      setShowSpeedMenu(false);
                    }}
                    className={`px-3 py-1.5 text-xs text-left font-medium transition-colors ${
                      rate === playbackRate
                        ? 'bg-purple-600/30 text-purple-300 font-bold'
                        : 'text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    {rate.toFixed(2).replace(/\.00$/, '')}x
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Auto Scroll toggle */}
          <button
            type="button"
            onClick={onToggleAutoScroll}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 border ${
              autoScroll
                ? 'bg-purple-900/40 text-purple-300 border-purple-700/50 shadow-inner'
                : 'bg-zinc-800/80 text-zinc-400 border-zinc-700/40 hover:text-zinc-200'
            }`}
            title="再生に合わせて文字起こしを自動スクロール"
          >
            <Compass className={`w-3.5 h-3.5 ${autoScroll ? 'text-purple-400 animate-spin-slow' : ''}`} />
            <span className="hidden sm:inline">追従</span>
            <span>{autoScroll ? 'ON' : 'OFF'}</span>
          </button>
        </div>

        {/* Center: Playback Controls */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Skip -5s */}
          <button
            type="button"
            onClick={() => handleSkip(-5)}
            disabled={audioLoading || !audioBlobUrl}
            className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 rounded-full transition-colors disabled:opacity-40"
            title="5秒戻る"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Main Play / Pause Button */}
          <button
            type="button"
            onClick={onPlayPause}
            disabled={audioLoading || !audioBlobUrl}
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-purple-900/30 transition-all disabled:opacity-50"
            title={isPlaying ? '一時停止 (Space)' : '再生 (Space)'}
          >
            {audioLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current translate-x-0.5" />
            )}
          </button>

          {/* Skip +10s */}
          <button
            type="button"
            onClick={() => handleSkip(10)}
            disabled={audioLoading || !audioBlobUrl}
            className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 rounded-full transition-colors disabled:opacity-40"
            title="10秒進む"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        {/* Right: Audio file label */}
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          {audioLoading ? (
            <span className="flex items-center gap-1.5 text-purple-400 animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>音声読込中...</span>
            </span>
          ) : audioError ? (
            <span className="text-rose-400 text-[11px] truncate max-w-[140px]" title={audioError}>
              {audioError}
            </span>
          ) : audioPath ? (
            <span className="truncate max-w-[140px] sm:max-w-[180px] font-mono text-[11px] text-zinc-400" title={audioPath}>
              🎵 {audioPath.split('/').pop()}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
};
