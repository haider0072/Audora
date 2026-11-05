"use client"

import { useRef, type HTMLAttributes } from "react"

import { useInert } from "@/hooks/use-inert"

interface StackLayerProps extends HTMLAttributes<HTMLDivElement> {
  /** Another layer shows over this one. */
  covered: boolean
}

/**
 * One of several layers sharing one place, such as the library list and the
 * pages opened over it. A covered layer stays mounted, so its scroll and its
 * state survive, but is hidden and inert: out of reach of the pointer, the
 * keyboard and assistive technology alike. The hiding is the caller's CSS,
 * keyed on `data-covered`.
 */
export function StackLayer({ covered, children, ...props }: StackLayerProps) {
  const ref = useRef<HTMLDivElement>(null)
  useInert(ref, covered)
  return (
    <div {...props} ref={ref} data-covered={covered || undefined}>
      {children}
    </div>
  )
}
