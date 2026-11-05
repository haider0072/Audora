import { flushSync } from "react-dom"

import { prefersReducedMotion } from "@/lib/motion"

/**
 * Makes `update`, a React state change that rearranges the page, a view
 * transition where the browser has them and motion is welcome: whatever is
 * named with `view-transition-name` glides from its old place to its new one
 * while the rest cross-fades. Anywhere else the change simply happens.
 */
export function withViewTransition(update: () => void): void {
  if (!("startViewTransition" in document) || prefersReducedMotion()) {
    update()
    return
  }
  // The browser takes the new page's picture once the callback returns, so
  // React has to have committed the change by then.
  document.startViewTransition(() => flushSync(update))
}
