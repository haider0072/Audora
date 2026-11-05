"use client"

import type { RefObject } from "react"
import { Search, X } from "lucide-react"

import { searchShortcut } from "@/hooks/use-search-shortcut"

interface HeaderSearchProps {
  value: string
  onChange: (value: string) => void
  /** Return pressed. */
  onSubmit: () => void
  /** The results are showing, so the field offers to close them. */
  open: boolean
  onClose: () => void
  /** The field, which the shortcut and closing focus. */
  inputRef: RefObject<HTMLInputElement>
}

/**
 * The desktop's one search, for the library and online: a soft field at the
 * header's centre. It shows its shortcut until results show, then a way to
 * close them; Escape closes them too. Styled by `.soft-field`.
 */
export function HeaderSearch({ value, onChange, onSubmit, open, onClose, inputRef }: HeaderSearchProps) {
  const shortcut = searchShortcut()
  return (
    <div className="soft-field" role="search">
      <Search aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        placeholder="Search your library"
        aria-label="Search your library and online"
        aria-keyshortcuts={shortcut.aria}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            onSubmit()
          } else if (event.key === "Escape" && open) {
            event.preventDefault()
            onClose()
          }
        }}
      />
      {open ? (
        <button
          type="button"
          className="soft-field-clear"
          aria-label="Close search"
          onClick={() => {
            onClose()
            // The button goes with the results; the field it closed keeps focus.
            inputRef.current?.focus()
          }}
        >
          <X aria-hidden="true" />
        </button>
      ) : (
        <kbd className="header-search-key" aria-hidden="true">
          {shortcut.label}
        </kbd>
      )}
    </div>
  )
}
