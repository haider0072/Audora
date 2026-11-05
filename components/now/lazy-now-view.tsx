"use client"

import { lazy, Suspense } from "react"

import type { NowViewProps } from "./now-view"

const NowView = lazy(() => import("./now-view"))

/** One of the song's views, loaded the first time one opens rather than with the player. */
export function LazyNowView(props: NowViewProps) {
  return (
    <Suspense fallback={null}>
      <NowView {...props} />
    </Suspense>
  )
}
