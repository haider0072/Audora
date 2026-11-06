"use client"

import { useCallback, useState } from "react"

import type { DownloadTarget } from "@/lib/tidal-types"

/**
 * Where online downloads are saved, as chosen in Settings and remembered in
 * this browser. A download to this device is the default, as it was before
 * there was a choice.
 */

const STORAGE_KEY = "audora_download_target"

function savedTarget(): DownloadTarget {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "cloud" ? "cloud" : "device"
  } catch (error) {
    console.warn("Could not read where downloads are saved; saving them on this device:", error)
    return "device"
  }
}

export function useDownloadTarget(): [DownloadTarget, (target: DownloadTarget) => void] {
  const [target, setTargetState] = useState<DownloadTarget>(savedTarget)

  const setTarget = useCallback((next: DownloadTarget) => {
    setTargetState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch (error) {
      console.warn("Could not remember where downloads are saved:", error)
    }
  }, [])

  return [target, setTarget]
}
