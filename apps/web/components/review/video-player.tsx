"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Maximize,
  Minimize,
  Pause,
  Play,
  Volume2,
  VolumeX,
  ChevronUp,
  Check,
  Repeat,
  Columns2,
  Rows2,
  Layers,
  FlipHorizontal2,
} from "lucide-react";
import { cn, formatTime, formatTimecode, formatFrames } from "@/lib/utils";
import { api } from "@/lib/api";
import { useReviewStore, type TimeFormat } from "@/stores/review-store";
import { useVideoPlayer } from "@/hooks/use-video-player";
import { useHlsVideo } from "@/hooks/use-hls-video";
import { useReview } from "./review-provider";
import { ProgressBar } from "./progress-bar";
import type { Comment } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StreamUrlResponse {
  url: string;
}

interface VideoPlayerProps {
  assetId: string;
  comments?: Comment[];
  overlay?: React.ReactNode;
  className?: string;
  /** Pre-fetched stream URL (for share mode — skips authenticated API call) */
  initialStreamUrl?: string | null;
  /** Version ID to compare against (renders split layout with shared controls) */
  compareVersionId?: string | null;
  /** Version numbers shown as labels in split-screen compare mode */
  currentVersionNumber?: number | null;
  compareVersionNumber?: number | null;
  /** Comments for the compare version — shown in progress bar when compare is the audio source */
  compareComments?: Comment[];
  /** Called whenever the audio source toggles between 'primary' and 'compare' */
  onAudioSourceChange?: (source: 'primary' | 'compare') => void;
}

// ─── Video frame constraint ──────────────────────────────────────────────────

/**
 * Wraps children so they are positioned exactly over the visible video frame,
 * excluding the black letterbox bars created by object-contain.
 */
function VideoFrameConstraint({
  videoRef,
  children,
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
  children: React.ReactNode;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const calc = () => {
      const container = video.parentElement;
      if (!container) return;

      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const vw = video.videoWidth;
      const vh = video.videoHeight;

      if (!vw || !vh) {
        setStyle({ position: "absolute", inset: 0 });
        return;
      }

      const containerAspect = cw / ch;
      const videoAspect = vw / vh;

      let renderW: number, renderH: number, offsetX: number, offsetY: number;

      if (videoAspect > containerAspect) {
        renderW = cw;
        renderH = cw / videoAspect;
        offsetX = 0;
        offsetY = (ch - renderH) / 2;
      } else {
        renderH = ch;
        renderW = ch * videoAspect;
        offsetX = (cw - renderW) / 2;
        offsetY = 0;
      }

      setStyle({
        position: "absolute",
        left: offsetX,
        top: offsetY,
        width: renderW,
        height: renderH,
      });
    };

    calc();
    video.addEventListener("loadedmetadata", calc);
    video.addEventListener("resize", calc);

    const ro = new ResizeObserver(calc);
    if (video.parentElement) ro.observe(video.parentElement);

    return () => {
      video.removeEventListener("loadedmetadata", calc);
      video.removeEventListener("resize", calc);
      ro.disconnect();
    };
  }, [videoRef]);

  return (
    <div ref={wrapperRef} style={style} className="overflow-hidden">
      {children}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function resolveUrl(url: string): string {
  return url.startsWith("/") ? `${API_BASE}${url}` : url;
}

export function VideoPlayer({
  assetId,
  comments = [],
  overlay,
  className,
  initialStreamUrl,
  compareVersionId,
  currentVersionNumber,
  compareVersionNumber,
  compareComments = [],
  onAudioSourceChange,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [compareStreamUrl, setCompareStreamUrl] = useState<string | null>(null);
  const [loop, setLoop] = useState(false);

  const { isDrawingMode, timeFormat, setTimeFormat, setPlayheadTime } =
    useReviewStore();
  const { registerPauseHandler } = useReview();
  const [timeFormatOpen, setTimeFormatOpen] = useState(false);
  const timeFormatRef = useRef<HTMLDivElement>(null);
  const [compareMode, setCompareMode] = useState<'columns' | 'rows' | 'wipe' | 'overlay'>('columns');
  const [wipePosition, setWipePosition] = useState(50);
  const [overlayOpacity, setOverlayOpacity] = useState(50);
  const [audioSource, setAudioSource] = useState<'primary' | 'compare'>('primary');

  useEffect(() => {
    if (!timeFormatOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        timeFormatRef.current &&
        !timeFormatRef.current.contains(e.target as Node)
      )
        setTimeFormatOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [timeFormatOpen]);

  function displayTime(seconds: number): string {
    switch (timeFormat) {
      case "frames":
        return formatFrames(seconds);
      case "standard":
        return formatTime(seconds);
      case "timecode":
        return formatTimecode(seconds);
      default:
        return formatTimecode(seconds);
    }
  }

  // Load primary stream URL
  useEffect(() => {
    setStreamUrl(null);
    if (initialStreamUrl) {
      setStreamUrl(resolveUrl(initialStreamUrl));
      return;
    }
    api
      .get<StreamUrlResponse>(`/assets/${assetId}/stream`)
      .then((data) => setStreamUrl(resolveUrl(data.url)))
      .catch(() => {});
  }, [assetId, initialStreamUrl]);

  // Load compare stream URL
  useEffect(() => {
    if (!compareVersionId) {
      setCompareStreamUrl(null);
      return;
    }
    api
      .get<StreamUrlResponse>(`/assets/${assetId}/stream?version_id=${compareVersionId}`)
      .then((data) => setCompareStreamUrl(resolveUrl(data.url)))
      .catch(() => {});
  }, [assetId, compareVersionId]);

  const player = useVideoPlayer(streamUrl);
  const compare = useHlsVideo(compareStreamUrl);

  const {
    videoRef,
    isPlaying,
    currentTime,
    duration,
    buffered,
    volume,
    isMuted,
    playbackRate,
    qualityLevels,
    currentQuality,
    isLoading,
    isFullscreen,
    error,
    pause: _pause,
    seek: _seek,
    setPlaybackRate: _setPlaybackRate,
    setQuality,
    setVolume,
    toggleMute,
    toggleFullscreen,
  } = player;

  // ─── Synced controls — command both videos ────────────────────────────────

  const play = useCallback(() => {
    videoRef.current?.play().catch(() => {});
    compare.videoRef.current?.play().catch(() => {});
  }, [videoRef, compare.videoRef]);

  const pause = useCallback(() => {
    _pause();
    compare.videoRef.current?.pause();
  }, [_pause, compare.videoRef]);

  const seek = useCallback(
    (time: number) => {
      _seek(time);
      const b = compare.videoRef.current;
      if (b) b.currentTime = Math.max(0, Math.min(time, b.duration || 0));
    },
    [_seek, compare.videoRef],
  );

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      play();
    } else {
      pause();
    }
  }, [videoRef, play, pause]);

  const setPlaybackRate = useCallback(
    (rate: number) => {
      _setPlaybackRate(rate);
      if (compare.videoRef.current)
        compare.videoRef.current.playbackRate = rate;
    },
    [_setPlaybackRate, compare.videoRef],
  );

  // ─── Stall sync — pause both when either buffers, resume when both ready ──

  useEffect(() => {
    if (!compareVersionId) return;
    const a = videoRef.current;
    const b = compare.videoRef.current;
    if (!a || !b) return;

    const s = { a: false, b: false, wasPlaying: false };

    const stallA = () => {
      if (!s.a) {
        s.wasPlaying = !a.paused;
        s.a = true;
        a.pause();
        b.pause();
      }
    };
    const stallB = () => {
      if (!s.b) {
        if (!s.a) s.wasPlaying = !b.paused;
        s.b = true;
        a.pause();
        b.pause();
      }
    };
    const tryResume = () => {
      if (!s.a && !s.b && s.wasPlaying) {
        s.wasPlaying = false;
        a.play().catch(() => {});
        b.play().catch(() => {});
      }
    };
    const unstallA = () => {
      s.a = false;
      tryResume();
    };
    const unstallB = () => {
      s.b = false;
      tryResume();
    };

    a.addEventListener("waiting", stallA);
    b.addEventListener("waiting", stallB);
    a.addEventListener("canplay", unstallA);
    b.addEventListener("canplay", unstallB);

    return () => {
      a.removeEventListener("waiting", stallA);
      b.removeEventListener("waiting", stallB);
      a.removeEventListener("canplay", unstallA);
      b.removeEventListener("canplay", unstallB);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareVersionId]);

  // Sync muted state to whichever video is the audio source
  useEffect(() => {
    const a = videoRef.current;
    const b = compare.videoRef.current;
    if (!compareVersionId) {
      if (b) b.muted = true;
      return;
    }
    if (a) a.muted = audioSource === 'compare';
    if (b) b.muted = audioSource !== 'compare';
  }, [audioSource, compareVersionId, videoRef, compare.videoRef]);

  // Reset audio source when compare is dismissed
  useEffect(() => {
    if (!compareVersionId) setAudioSource('primary');
  }, [compareVersionId]);

  // Notify parent whenever audio source changes
  useEffect(() => {
    onAudioSourceChange?.(audioSource);
  }, [audioSource, onAudioSourceChange]);

  // Register pause handler with review provider
  useEffect(() => {
    registerPauseHandler(pause);
  }, [registerPauseHandler, pause]);

  // Sync video currentTime to review store
  const lastSyncRef = useRef(0);
  useEffect(() => {
    const now = Date.now();
    if (now - lastSyncRef.current > 100) {
      setPlayheadTime(currentTime);
      lastSyncRef.current = now;
    }
  }, [currentTime, setPlayheadTime]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        isDrawingMode
      ) {
        return;
      }

      switch (e.code) {
        case "Space":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          seek(currentTime - 5);
          break;
        case "ArrowRight":
          e.preventDefault();
          seek(currentTime + 5);
          break;
        case "KeyJ":
          seek(currentTime - 10);
          break;
        case "KeyK":
          togglePlay();
          break;
        case "KeyL":
          seek(currentTime + 10);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay, seek, currentTime, isDrawingMode]);

  const handleContainerClick = useCallback(() => {
    if (!isDrawingMode) {
      togglePlay();
    }
  }, [togglePlay, isDrawingMode]);

  const handleFullscreen = useCallback(() => {
    if (containerRef.current) {
      toggleFullscreen(containerRef.current);
    }
  }, [toggleFullscreen]);

  const handleSpeedCycle = useCallback(() => {
    const idx = SPEED_OPTIONS.indexOf(
      playbackRate as (typeof SPEED_OPTIONS)[number],
    );
    const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
    setPlaybackRate(next);
  }, [playbackRate, setPlaybackRate]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex flex-col h-full w-full",
        isFullscreen && "fixed inset-0 z-50",
        className,
      )}
    >
      {/* Video area */}
      <div
        className="flex-1 relative min-h-0 bg-black overflow-hidden cursor-pointer"
        onClick={handleContainerClick}
      >
        {/* Both slots stay in the DOM when comparing — mode is driven by CSS only so videoRefs never remount */}
        <div className={cn("relative flex h-full w-full", compareMode === 'rows' && "flex-col")}>
          {/* Primary slot */}
          <div
            className={cn(
              "relative overflow-hidden",
              !compareVersionId
                ? "w-full"
                : compareMode === 'columns'
                  ? "flex-1 border-r border-white/10"
                  : compareMode === 'rows'
                    ? "flex-1 border-b border-white/10"
                    : "absolute inset-0",
            )}
          >
            {compareVersionId && (
              <button
                onClick={(e) => { e.stopPropagation(); setAudioSource('primary'); }}
                className={cn(
                  "absolute z-10 flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md transition-all",
                  compareMode === 'columns' || compareMode === 'rows' ? "top-2 left-2" : "top-2 right-2",
                  audioSource === 'primary'
                    ? "bg-accent text-white shadow-md shadow-accent/40"
                    : "bg-black/70 text-white/40 border border-white/10 hover:text-white/70 hover:border-white/25",
                )}
                title="Play audio from this version"
              >
                {currentVersionNumber != null ? `v${currentVersionNumber}` : 'A'}
                <Volume2 className="h-3 w-3" />
              </button>
            )}
            <video
              ref={videoRef}
              className={cn(
                "absolute inset-0 w-full h-full object-contain",
                isDrawingMode ? "pointer-events-none" : "",
              )}
              playsInline
              preload="metadata"
            />
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}
            {overlay && (
              <VideoFrameConstraint videoRef={videoRef}>
                {overlay}
              </VideoFrameConstraint>
            )}
          </div>

          {/* Compare slot — always in DOM when compareVersionId is set */}
          {compareVersionId && (
            <div
              className={cn(
                "relative overflow-hidden",
                compareMode === 'columns' || compareMode === 'rows' ? "flex-1" : "absolute inset-0",
              )}
              style={compareMode === 'wipe' ? { clipPath: `inset(0 ${100 - wipePosition}% 0 0)` } : undefined}
            >
              <button
                onClick={(e) => { e.stopPropagation(); setAudioSource('compare'); }}
                className={cn(
                  "absolute top-2 left-2 z-10 flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md transition-all",
                  audioSource === 'compare'
                    ? "bg-accent text-white shadow-md shadow-accent/40"
                    : "bg-black/70 text-white/40 border border-white/10 hover:text-white/70 hover:border-white/25",
                )}
                title="Play audio from this version"
              >
                {compareVersionNumber != null ? `v${compareVersionNumber}` : 'B'}
                <Volume2 className="h-3 w-3" />
              </button>
              <video
                ref={compare.videoRef}
                className="absolute inset-0 w-full h-full object-contain"
                style={{ opacity: compareMode === 'overlay' ? overlayOpacity / 100 : 1 }}
                playsInline
                preload="metadata"
              />
              {compare.isLoading && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin" />
                </div>
              )}
              {compare.error && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                  <p className="text-red-400 text-sm">{compare.error}</p>
                </div>
              )}
            </div>
          )}

          {/* Wipe divider line */}
          {compareVersionId && compareMode === 'wipe' && (
            <div
              className="absolute top-0 bottom-0 w-px bg-white/60 z-20 pointer-events-none"
              style={{ left: `${wipePosition}%` }}
            />
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="shrink-0 bg-bg-primary">
        <ProgressBar
          currentTime={currentTime}
          duration={duration}
          buffered={buffered}
          comments={audioSource === 'compare' ? compareComments : comments}
          streamUrl={streamUrl}
          onSeek={seek}
        />
      </div>

      {/* Bottom transport bar */}
      <div className="flex items-center justify-between h-12 px-4 bg-bg-secondary/80 border-t border-border shrink-0">
        {/* Left: Play, Loop, Speed, Volume */}
        <div className="flex items-center gap-2">
          <button
            onClick={togglePlay}
            className="flex h-7 w-7 items-center justify-center rounded text-text-primary hover:bg-bg-hover transition-colors"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </button>

          <button
            onClick={() => setLoop((p) => !p)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded transition-colors",
              loop
                ? "text-accent bg-accent/10"
                : "text-text-tertiary hover:text-text-secondary hover:bg-bg-hover",
            )}
            aria-label="Loop"
          >
            <Repeat className="h-4 w-4" />
          </button>

          <button
            onClick={handleSpeedCycle}
            className="flex h-7 items-center justify-center rounded px-1.5 text-xs font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors tabular-nums"
            aria-label="Playback speed"
          >
            {playbackRate}x
          </button>

          <button
            onClick={toggleMute}
            className="flex h-7 w-7 items-center justify-center rounded text-text-tertiary hover:text-text-secondary hover:bg-bg-hover transition-colors"
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Center: Timecode display with format picker */}
        <div className="relative" ref={timeFormatRef}>
          <button
            onClick={() => setTimeFormatOpen((p) => !p)}
            className="flex items-center gap-1.5 rounded-md bg-bg-tertiary px-3 py-1 hover:bg-bg-hover transition-colors"
          >
            <span className="font-mono text-sm text-text-primary tabular-nums tracking-wide">
              {timeFormat === "timecode" ? (
                displayTime(currentTime)
              ) : (
                <>
                  {displayTime(currentTime)}{" "}
                  <span className="text-text-tertiary">/</span>{" "}
                  {displayTime(duration)}
                </>
              )}
            </span>
            <ChevronUp
              className={cn(
                "h-3 w-3 text-text-tertiary transition-transform",
                timeFormatOpen && "rotate-180",
              )}
            />
          </button>
          {timeFormatOpen && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-48 rounded-xl border border-white/10 bg-[#2a2a30] shadow-2xl py-1.5 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 py-2 text-[11px] text-text-tertiary uppercase tracking-wider font-medium">
                Time Format
              </div>
              {(
                [
                  { id: "frames" as TimeFormat, label: "Frames" },
                  { id: "standard" as TimeFormat, label: "Standard" },
                  { id: "timecode" as TimeFormat, label: "Timecode" },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  className={cn(
                    "flex w-full items-center justify-between px-3 py-2 text-[13px] transition-colors",
                    timeFormat === item.id
                      ? "text-text-primary"
                      : "text-text-secondary hover:bg-white/5",
                  )}
                  onClick={() => {
                    setTimeFormat(item.id);
                    setTimeFormatOpen(false);
                  }}
                >
                  {item.label}
                  {timeFormat === item.id && (
                    <Check className="h-4 w-4 text-accent" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Compare mode, Quality, Fullscreen */}
        <div className="flex items-center gap-2">
          {compareVersionId && (
            <div className="flex items-center rounded border border-border overflow-hidden">
              <button
                onClick={() => setCompareMode('columns')}
                className={cn(
                  "flex h-7 w-7 items-center justify-center transition-colors",
                  compareMode === 'columns'
                    ? "bg-accent/15 text-accent"
                    : "text-text-tertiary hover:text-text-secondary hover:bg-bg-hover",
                )}
                title="Side by side"
              >
                <Columns2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setCompareMode('rows')}
                className={cn(
                  "flex h-7 w-7 items-center justify-center transition-colors border-l border-border",
                  compareMode === 'rows'
                    ? "bg-accent/15 text-accent"
                    : "text-text-tertiary hover:text-text-secondary hover:bg-bg-hover",
                )}
                title="Stacked"
              >
                <Rows2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setCompareMode('wipe')}
                className={cn(
                  "flex h-7 w-7 items-center justify-center transition-colors border-l border-border",
                  compareMode === 'wipe'
                    ? "bg-accent/15 text-accent"
                    : "text-text-tertiary hover:text-text-secondary hover:bg-bg-hover",
                )}
                title="Wipe"
              >
                <FlipHorizontal2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setCompareMode('overlay')}
                className={cn(
                  "flex h-7 w-7 items-center justify-center transition-colors border-l border-border",
                  compareMode === 'overlay'
                    ? "bg-accent/15 text-accent"
                    : "text-text-tertiary hover:text-text-secondary hover:bg-bg-hover",
                )}
                title="Overlay"
              >
                <Layers className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {compareVersionId && compareMode === 'wipe' && (
            <div className="flex items-center gap-1.5">
              <input
                type="range"
                min={0}
                max={100}
                value={wipePosition}
                onChange={(e) => setWipePosition(Number(e.target.value))}
                className="w-20 accent-accent cursor-pointer"
                title="Wipe position"
              />
              <span className="text-xs text-text-tertiary tabular-nums w-7 text-right">
                {wipePosition}%
              </span>
            </div>
          )}
          {compareVersionId && compareMode === 'overlay' && (
            <div className="flex items-center gap-1.5">
              <input
                type="range"
                min={0}
                max={100}
                value={overlayOpacity}
                onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                className="w-20 accent-accent cursor-pointer"
                title="Overlay opacity"
              />
              <span className="text-xs text-text-tertiary tabular-nums w-7 text-right">
                {overlayOpacity}%
              </span>
            </div>
          )}
          {qualityLevels.length > 0 && (
            <select
              value={currentQuality}
              onChange={(e) => setQuality(parseInt(e.target.value, 10))}
              className="bg-transparent text-text-secondary text-xs border border-border rounded px-1.5 py-1 cursor-pointer shrink-0 hover:text-text-primary transition-colors"
              aria-label="Quality"
            >
              <option value={-1} className="bg-bg-secondary">
                Auto
              </option>
              {qualityLevels.map((level) => (
                <option
                  key={level.index}
                  value={level.index}
                  className="bg-bg-secondary"
                >
                  {level.label}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={handleFullscreen}
            className="flex h-7 w-7 items-center justify-center rounded text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors"
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? (
              <Minimize className="h-4 w-4" />
            ) : (
              <Maximize className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
