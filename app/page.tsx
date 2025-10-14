"use client"

import { useEffect, useState } from "react"
import EnhancedMusicPlayer from "@/components/players/enhanced-music-player"
import MobileMusicPlayer from "@/components/players/mobile-music-player"

export default function Page() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024) // lg breakpoint
    }

    checkMobile()
    window.addEventListener("resize", checkMobile)

    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  return isMobile ? <MobileMusicPlayer /> : <EnhancedMusicPlayer />
}
