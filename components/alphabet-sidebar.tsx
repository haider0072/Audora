"use client"

import { useCallback, useRef } from "react"

const ALPHABET = [
  "#",
  ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)),
]

interface AlphabetSidebarProps {
  availableLetters: Set<string>
  activeLetter: string
  onLetterClick: (letter: string) => void
  className?: string
}

export function AlphabetSidebar({
  availableLetters,
  activeLetter,
  onLetterClick,
  className = "",
}: AlphabetSidebarProps) {
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

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault()
      lastTouchLetter.current = null
      const touch = e.touches[0]
      handleLetterFromPoint(touch.clientX, touch.clientY)
    },
    [handleLetterFromPoint],
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault()
      const touch = e.touches[0]
      handleLetterFromPoint(touch.clientX, touch.clientY)
    },
    [handleLetterFromPoint],
  )

  return (
    <div
      className={`flex flex-col items-center py-1 select-none touch-none ${className}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
    >
      {ALPHABET.map((letter) => {
        const isAvailable = availableLetters.has(letter)
        const isActive = activeLetter === letter

        return (
          <button
            key={letter}
            data-sidebar-letter={letter}
            onClick={() => isAvailable && onLetterClick(letter)}
            disabled={!isAvailable}
            className={`
              w-5 flex items-center justify-center text-[10px] font-semibold leading-[16px]
              rounded-sm transition-colors duration-100
              ${isActive ? "text-primary bg-primary/10 scale-110" : ""}
              ${isAvailable && !isActive ? "text-muted-foreground/70 hover:text-primary hover:bg-primary/5 cursor-pointer" : ""}
              ${!isAvailable ? "text-muted-foreground/20 cursor-default" : ""}
            `}
            aria-label={`Jump to ${letter === "#" ? "symbols" : letter}`}
          >
            {letter}
          </button>
        )
      })}
    </div>
  )
}

export function getArtistLetter(artist: string): string {
  const firstChar = artist.charAt(0).toUpperCase()
  return /[A-Z]/.test(firstChar) ? firstChar : "#"
}
