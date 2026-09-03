"use client"

import { useSyncExternalStore } from "react"

import {
  getServerSyncStats,
  getSyncStats,
  subscribeToSyncStats,
  type SyncStats,
} from "@/lib/sync/sync-stats-store"

/**
 * Subscribe to the live sync measurements.
 *
 * Only components that display these numbers should call this — subscribing
 * puts the caller back in the render path several times a second, which is
 * exactly what keeping them out of React state avoids for everyone else.
 */
export function useSyncStats(): SyncStats {
  return useSyncExternalStore(subscribeToSyncStats, getSyncStats, getServerSyncStats)
}
