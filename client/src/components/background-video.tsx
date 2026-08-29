import { useState } from 'react'

const HERO_VIDEO = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4'

export function BackgroundVideo() {
  const [videoFailed, setVideoFailed] = useState(false)

  return (
    <video
      aria-hidden="true"
      tabIndex={-1}
      autoPlay
      loop
      muted
      playsInline
      src={HERO_VIDEO}
      data-video-state={videoFailed ? 'error' : 'ready'}
      onError={() => setVideoFailed(true)}
      className={`pointer-events-none absolute inset-0 z-0 h-full w-full object-cover transition-opacity duration-500 ${videoFailed ? 'opacity-0' : 'opacity-100'}`}
    />
  )
}
