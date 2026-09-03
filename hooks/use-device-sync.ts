"use client"

import { useSyncPlayback, type SyncPlaybackAdapter } from "@/hooks/use-sync-playback"
import { useSyncSession, type UseSyncSessionReturn } from "@/hooks/use-sync-session"

/**
 * Everything a player shell needs to take part in a sync session, behind one
 * call.
 *
 * The desktop and mobile shells differ in layout, not in how synchronized
 * playback works, so the session and the drift controller are composed here
 * once rather than wired twice.
 */

export interface UseDeviceSyncOptions {
  adapter: SyncPlaybackAdapter
}

export interface UseDeviceSyncReturn extends UseSyncSessionReturn {
  /** Host track this device does not hold, when that happens. */
  missingTrackLabel: string | null
  /** Announce local playback to the peer. The host calls this on any change. */
  broadcast: () => void
}

export function useDeviceSync(options: UseDeviceSyncOptions): UseDeviceSyncReturn {
  const session = useSyncSession()
  const { missingTrackLabel, broadcast } = useSyncPlayback({
    session,
    adapter: options.adapter,
  })

  return { ...session, missingTrackLabel, broadcast }
}
