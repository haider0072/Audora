/** Radius of the ring, inside its 16-unit box. */
const RADIUS = 6
const LENGTH = 2 * Math.PI * RADIUS

/**
 * A ring that fills as something goes up or comes down, from the top,
 * clockwise. `progress` runs from 0 to 1. Styled by `.progress-ring`.
 */
export function ProgressRing({ progress }: { progress: number }) {
  const filled = Math.min(Math.max(progress, 0), 1)
  return (
    <svg className="progress-ring" viewBox="0 0 16 16" aria-hidden="true">
      <circle className="progress-ring-track" cx="8" cy="8" r={RADIUS} />
      <circle
        className="progress-ring-fill"
        cx="8"
        cy="8"
        r={RADIUS}
        strokeDasharray={LENGTH}
        strokeDashoffset={LENGTH * (1 - filled)}
      />
    </svg>
  )
}
