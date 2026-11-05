"use client"

import { useEffect, type KeyboardEvent, type ReactNode, type RefObject } from "react"
import { ChevronLeft } from "lucide-react"

import { ScrollArea } from "@/components/ui/scroll-area"
import type { LibraryLayout } from "./song-row"

interface PageFrameProps {
  layout: LibraryLayout
  /** The page's title: it names the page, and takes focus as the page opens. */
  titleId: string
  headingRef: RefObject<HTMLHeadingElement>
  /** Where Back goes: the list, or the page underneath. */
  backLabel: string
  onBack: () => void
  children: ReactNode
}

/**
 * A page over a list, an artist's or an album's, in the library or online:
 * Back above, the page scrolling under it. It takes focus as it opens, and
 * Escape goes back. Styled by `.library-page` in app/globals.css.
 */
export function PageFrame({ layout, titleId, headingRef, backLabel, onBack, children }: PageFrameProps) {
  // Pages only open because someone asked for one, so focus follows.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [headingRef])

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // A menu opened from this page is portalled elsewhere and closes on Escape itself.
    if (event.key !== "Escape" || !event.currentTarget.contains(event.target as Node)) return
    event.preventDefault()
    onBack()
  }

  return (
    <section className="library-page" data-layout={layout} aria-labelledby={titleId} onKeyDown={onKeyDown}>
      <div className="library-page-bar">
        <button type="button" className="library-page-back" onClick={onBack}>
          <ChevronLeft aria-hidden="true" />
          <span className="library-page-back-label">{backLabel}</span>
        </button>
      </div>
      <ScrollArea className="library-page-scroll">
        <div className="library-page-body">{children}</div>
      </ScrollArea>
    </section>
  )
}
