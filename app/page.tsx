"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"

const EnhancedMusicPlayer = dynamic(() => import("@/components/players/enhanced-music-player"), {
  ssr: false,
})
const MobileMusicPlayer = dynamic(() => import("@/components/players/mobile-music-player"), {
  ssr: false,
})

export default function Page() {
  const [isMobile, setIsMobile] = useState<boolean | null>(null)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024) // lg breakpoint
    }

    checkMobile()
    window.addEventListener("resize", checkMobile)

    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  if (isMobile === null) return null

  return isMobile ? <MobileMusicPlayer /> : <EnhancedMusicPlayer />
}
