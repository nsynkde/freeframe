'use client'

import Hls from 'hls.js'
import { useEffect, useRef, useState } from 'react'

/** Thin HLS loader — no store coupling. Used for the secondary compare slot. */
export function useHlsVideo(src: string | null) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) {
      setIsLoading(false)
      return
    }

    setError(null)
    setIsLoading(true)

    const onLoadedMetadata = () => setDuration(video.duration)
    const onCanPlay = () => setIsLoading(false)
    const onError = () => { setError('Playback error'); setIsLoading(false) }

    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('canplay', onCanPlay)
    video.addEventListener('error', onError)

    if (src.includes('.m3u8') && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false })
      hlsRef.current = hls
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => setIsLoading(false))
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) { setError(`HLS error: ${data.type}`); setIsLoading(false) }
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
    } else {
      video.src = src
    }

    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('error', onError)
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [src])

  return { videoRef, hlsRef, isLoading, error, duration }
}
