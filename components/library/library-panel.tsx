"use client"

import { useCallback, useLayoutEffect, useRef, type ComponentProps, type ReactNode } from "react"

import { StackLayer } from "@/components/stack-layer"
import type { LibraryNavigation } from "@/hooks/use-library-navigation"
import { pageKey, pageTitle, type LibraryPage } from "@/lib/library-pages"
import { ImportProgress } from "./import-progress"
import { LibraryList } from "./library-list"
import { LibraryPageView } from "./library-page"

interface LibraryPanelProps extends Omit<ComponentProps<typeof LibraryList>, "onOpen"> {
  /** Set while new songs are being added. */
  importProgress?: { current: number; total: number } | null
  navigation: LibraryNavigation
}

/** One layer of the panel: the list, or a page. Focused only when Back has nothing better to focus. */
function Layer({ covered, kind, children }: { covered: boolean; kind: "list" | "page"; children: ReactNode }) {
  return (
    <StackLayer covered={covered} className="library-layer" data-kind={kind} tabIndex={-1}>
      {children}
    </StackLayer>
  )
}

/**
 * The library as a player shows it: an import's progress when one runs, and
 * the list with any artist and album pages opened over it. Back hands focus
 * to whatever opened the page, or failing that to the layer beneath.
 */
export function LibraryPanel({ importProgress, navigation, ...list }: LibraryPanelProps) {
  const { stack, open, back } = navigation
  const root = useRef<HTMLDivElement>(null)
  /** What had focus when each open page was opened from inside the library. */
  const openers = useRef(new Map<string, HTMLElement>())
  /** Set by Back: focus goes here, or to the layer beneath, once it shows. */
  const refocus = useRef<{ opener?: HTMLElement } | null>(null)

  const openFromLibrary = useCallback(
    (page: LibraryPage) => {
      const opener = document.activeElement
      if (opener instanceof HTMLElement) openers.current.set(pageKey(page), opener)
      open(page)
    },
    [open],
  )

  const goBack = useCallback(() => {
    const top = stack[stack.length - 1]
    refocus.current = { opener: top && openers.current.get(pageKey(top)) }
    back()
  }, [stack, back])

  // Runs after the layers' own effects, so the one Back uncovered is no
  // longer inert by now.
  useLayoutEffect(() => {
    for (const key of openers.current.keys()) {
      if (!stack.some((page) => pageKey(page) === key)) openers.current.delete(key)
    }
    const request = refocus.current
    if (!request) return
    refocus.current = null
    const { opener } = request
    const target =
      opener?.isConnected && !opener.closest("[inert]")
        ? opener
        : root.current?.querySelector<HTMLElement>(".library-layer:not([data-covered])")
    target?.focus({ preventScroll: true })
  }, [stack])

  return (
    <div ref={root} className="library-panel" data-layout={list.layout}>
      {importProgress && importProgress.total > 0 && <ImportProgress {...importProgress} />}
      <div className="library-stack">
        <Layer covered={stack.length > 0} kind="list">
          <LibraryList {...list} onOpen={openFromLibrary} />
        </Layer>
        {stack.map((page, i) => (
          <Layer key={pageKey(page)} covered={i < stack.length - 1} kind="page">
            <LibraryPageView
              page={page}
              songs={list.songs}
              layout={list.layout}
              currentSongId={list.currentSongId}
              playback={list.playback}
              onSelect={list.onSelect}
              actions={list.actions}
              onOpen={openFromLibrary}
              onBack={goBack}
              backLabel={i === 0 ? "Library" : pageTitle(stack[i - 1])}
            />
          </Layer>
        ))}
      </div>
    </div>
  )
}
