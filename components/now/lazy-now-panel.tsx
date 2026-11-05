"use client"

import { lazy, Suspense } from "react"

import type { NowPanelProps } from "./now-panel"

const NowPanel = lazy(() => import("./now-panel"))

/** The Now panel, loaded the first time one opens rather than with the player. */
export function LazyNowPanel(props: NowPanelProps) {
  return (
    // The panel's place is held while its code loads, so nothing around it moves.
    <Suspense fallback={<div className="now" data-layout={props.layout} />}>
      <NowPanel {...props} />
    </Suspense>
  )
}
