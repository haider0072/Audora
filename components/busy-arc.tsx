import { cn } from "@/lib/utils"

interface BusyArcProps {
  className?: string
  /** The ring's radius in its 20-unit box: 7 beside words, 9 around an icon. */
  radius?: number
}

/** Work under way: a short arc turning, in the current colour. Styled by `.busy-arc`. */
export function BusyArc({ className, radius = 7 }: BusyArcProps) {
  return (
    <svg className={cn("busy-arc", className)} viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r={radius} />
    </svg>
  )
}
