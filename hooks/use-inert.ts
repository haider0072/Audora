import { useLayoutEffect, type RefObject } from "react"

/**
 * Makes the element inert while `inert` holds: out of reach of the pointer,
 * the keyboard and assistive technology alike. React 18 has no `inert` prop,
 * so the attribute is set on the element itself.
 */
export function useInert(ref: RefObject<HTMLElement | null>, inert: boolean) {
  useLayoutEffect(() => {
    ref.current?.toggleAttribute("inert", inert)
  }, [ref, inert])
}
