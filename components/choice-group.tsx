"use client"

import { useRef, type KeyboardEvent, type ReactNode } from "react"

import { rovingMove } from "@/lib/roving"

export interface Choice<T extends string> {
  value: T
  label: ReactNode
}

interface ChoiceGroupProps<T extends string> {
  /** What is being chosen, for a screen reader. */
  label: string
  choices: readonly Choice<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
  /** Each choice's class; the chosen one has `aria-checked="true"`. */
  choiceClassName?: string
}

/**
 * One of a few choices, as radio buttons in a row: one stop for Tab, and the
 * arrow keys move through them, choosing as they go.
 */
export function ChoiceGroup<T extends string>({
  label,
  choices,
  value,
  onChange,
  className,
  choiceClassName,
}: ChoiceGroupProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const onKeyDown = (event: KeyboardEvent) => {
    const index = choices.findIndex((choice) => choice.value === value)
    const move = rovingMove(event.key, index, choices.length, "radios")
    if (move === null) return
    event.preventDefault()
    refs.current[move]?.focus()
    onChange(choices[move].value)
  }

  return (
    <div role="radiogroup" aria-label={label} className={className} onKeyDown={onKeyDown}>
      {choices.map((choice, index) => {
        const checked = choice.value === value
        return (
          <button
            key={choice.value}
            ref={(element) => {
              refs.current[index] = element
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className={choiceClassName}
            onClick={() => onChange(choice.value)}
          >
            {choice.label}
          </button>
        )
      })}
    </div>
  )
}
