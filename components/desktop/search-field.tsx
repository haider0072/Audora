"use client"

import type { RefObject } from "react"
import { Search, X } from "lucide-react"

interface SearchFieldProps {
  value: string
  onChange: (value: string) => void
  /** Return pressed: look online too. */
  onSubmit: () => void
  onClose: () => void
  /** The field, which the shortcut focuses. */
  inputRef: RefObject<HTMLInputElement>
}

/**
 * The desktop's one search, opened in the library's head in place of its
 * title and tools: the library is searched as you type, online on Return.
 * It takes focus as it opens, since it opens on request; Escape and × close
 * it. Styled by `.search-field`, which widens it out from the Search button.
 */
export function SearchField({ value, onChange, onSubmit, onClose, inputRef }: SearchFieldProps) {
  return (
    <div className="soft-field search-field" role="search">
      <Search aria-hidden="true" />
      <input
        ref={inputRef}
        // Opened on request, so focus belongs here.
        autoFocus
        type="search"
        enterKeyHint="search"
        value={value}
        placeholder="Search your library, or online"
        aria-label="Search your library, or online"
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            onSubmit()
          } else if (event.key === "Escape") {
            event.preventDefault()
            onClose()
          }
        }}
      />
      <kbd className="search-field-key" aria-hidden="true">
        esc
      </kbd>
      <button type="button" className="soft-field-clear" aria-label="Close search" onClick={onClose}>
        <X aria-hidden="true" />
      </button>
    </div>
  )
}
