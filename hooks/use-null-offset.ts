"use client"

import { useSyncExternalStore } from "react"

import {
  getNullOffsetMs,
  getServerNullOffsetMs,
  subscribeToNullOffset,
} from "@/lib/sync/null-offset"

/**
 * Read the manual timing trim. Only the control that displays and edits it
 * should subscribe — everything else reads the value through
 * `getNullOffsetSec` at the moment it needs it.
 */
export function useNullOffsetMs(): number {
  return useSyncExternalStore(subscribeToNullOffset, getNullOffsetMs, getServerNullOffsetMs)
}
