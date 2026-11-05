"use client"

interface LedSwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  /** The id of what names the switch. */
  labelledBy: string
  /** The id of what says what it does, if anything. */
  describedBy?: string
}

/**
 * A switch as Audora draws one: how it stands in a word, On or Off, lit by an
 * LED in the song's colour while on, the way the rest of its choices are.
 * Styled by `.led-choice`.
 */
export function LedSwitch({ checked, onCheckedChange, labelledBy, describedBy }: LedSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className="led-choice"
      onClick={() => onCheckedChange(!checked)}
    >
      {checked ? "On" : "Off"}
    </button>
  )
}
