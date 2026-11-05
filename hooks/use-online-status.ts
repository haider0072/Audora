"use client"

import { useSyncExternalStore } from "react"

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange)
  window.addEventListener("offline", onChange)
  return () => {
    window.removeEventListener("online", onChange)
    window.removeEventListener("offline", onChange)
  }
}

const isOnline = () => navigator.onLine
/** The server cannot know, so it renders as online. */
const isOnlineOnServer = () => true

/** Whether the browser believes it has a network connection, kept up to date. */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, isOnline, isOnlineOnServer)
}
