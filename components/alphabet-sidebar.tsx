"use client"

import { useCallback, useRef, useState } from "react"

const ALPHABET = [
  "#",
  ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)),
]

interface AlphabetSidebarProps {
  availableLetters: ReadonlySet<string>
  activeLetter: string
  onLetterClick: (letter: string) => void
  /** Shown while the list scrolls; otherwise it waits, hidden, for a pointer to come near. */
  visible: boolean
}

/**
 * The A–Z scrubber beside the library: tap a letter, or slide a finger down
 * it. It stays up for as long as a finger is on it. Styled by
 * `.library-scrubber` in app/globals.css.
 */
export function AlphabetSidebar({ availableLetters, activeLetter, onLetterClick, visible }: AlphabetSidebarProps) {
  const [scrubbing, setScrubbing] = useState(false)
  const lastTouchLetter = useRef<string | null>(null)

  const handleLetterFromPoint = useCallback(
    (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)
      const letter = el?.getAttribute("data-sidebar-letter")
      if (letter && letter !== lastTouchLetter.current && availableLetters.has(letter)) {
        lastTouchLetter.current = letter
        onLetterClick(letter)
      }
    },
    [availableLetters, onLetterClick],
  )

  // `touch-action: none` keeps the page from panning, so these need not cancel anything.
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      setScrubbing(true)
      lastTouchLetter.current = null
      const touch = e.touches[0]
      handleLetterFromPoint(touch.clientX, touch.clientY)
    },
    [handleLetterFromPoint],
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0]
      handleLetterFromPoint(touch.clientX, touch.clientY)
    },
    [handleLetterFromPoint],
  )

  const handleTouchEnd = useCallback(() => setScrubbing(false), [])

  return (
    <div
      className="library-scrubber"
      data-visible={visible || undefined}
      data-scrubbing={scrubbing || undefined}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {ALPHABET.map((letter) => (
        <button
          key={letter}
          type="button"
          className="library-scrubber-letter"
          data-sidebar-letter={letter}
          data-active={activeLetter === letter || undefined}
          onClick={() => onLetterClick(letter)}
          disabled={!availableLetters.has(letter)}
          aria-label={`Jump to ${letter === "#" ? "symbols" : letter}`}
        >
          {letter}
        </button>
      ))}
    </div>
  )
}
