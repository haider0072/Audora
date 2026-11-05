"use client"

import type { ComponentProps } from "react"

import { ImportProgress } from "./import-progress"
import { LibraryList } from "./library-list"

interface LibraryPanelProps extends ComponentProps<typeof LibraryList> {
  /** Set while new songs are being added. */
  importProgress?: { current: number; total: number } | null
}

/** The library as a player shows it: an import's progress, when one runs, over the list. */
export function LibraryPanel({ importProgress, ...list }: LibraryPanelProps) {
  return (
    <div className="library-panel" data-layout={list.layout}>
      {importProgress && importProgress.total > 0 && <ImportProgress {...importProgress} />}
      <LibraryList {...list} />
    </div>
  )
}
