"use client"

import type { ReactNode } from "react"
import Image from "next/image"

import { Wordmark } from "@/components/brand/wordmark"

interface DesktopHeaderProps {
  /** The search field, at the window's centre. */
  search: ReactNode
  /** The header's few tools, at its far end. */
  children: ReactNode
}

/**
 * The desktop's header: the logo, the search at the centre of the window, and
 * a few quiet tools. Styled by `.desktop-header` in app/globals.css.
 */
export function DesktopHeader({ search, children }: DesktopHeaderProps) {
  return (
    <header className="desktop-header">
      <div className="desktop-lockup">
        <Image src="/icon-192x192.png" alt="" width={32} height={32} className="desktop-lockup-icon" />
        <Wordmark />
      </div>
      {search}
      <div className="desktop-header-tools">{children}</div>
    </header>
  )
}
