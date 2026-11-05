import type { ComponentPropsWithoutRef } from "react"
import { cn } from "@/lib/utils"

/**
 * The Audora wordmark: the name in the display face, with its "o" drawn as the headphone ring.
 * Size it with a text-size class. Assistive technology reads it as "Audora"; pass
 * `aria-hidden` when it sits next to an icon that already carries the name.
 */
export function Wordmark({ className, ...props }: ComponentPropsWithoutRef<"span">) {
  return (
    <span className={cn("wordmark", className)} {...props}>
      <span className="sr-only">Audora</span>
      <span aria-hidden="true">
        aud
        <span className="wordmark-ring" />
        ra
      </span>
    </span>
  )
}
