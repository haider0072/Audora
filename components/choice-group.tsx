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
  /** Each choice's id, so focus can be handed to it from elsewhere. */
  choiceId?: (value: T) => string
  /** A choice clicked, rather than reached with the arrow keys: focus may move on. */
  onPick?: (value: T) => void
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
  choiceId,
  onPick,
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
            id={choiceId?.(choice.value)}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className={choiceClassName}
            onClick={() => {
              onChange(choice.value)
              onPick?.(choice.value)
            }}
          >
            {choice.label}
          </button>
        )
      })}
    </div>
  )
}
