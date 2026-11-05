"use client"

import type { RefObject } from "react"
import { Search, X } from "lucide-react"

import { ChoiceGroup, type Choice } from "@/components/choice-group"
import type { SearchTab } from "@/hooks/use-desktop-search"
import { searchShortcut } from "@/hooks/use-search-shortcut"

const PLACES: readonly Choice<SearchTab>[] = [
  { value: "library", label: "Library" },
  { value: "online", label: "Online" },
]

/** What the field asks for, where it looks. */
const PROMPTS: Record<SearchTab, string> = {
  library: "Search your library",
  online: "Search Qobuz and Amazon",
}

interface HeaderSearchProps {
  value: string
  onChange: (value: string) => void
  /** Return pressed. */
  onSubmit: () => void
  /** The results are showing, so the field offers to close them. */
  open: boolean
  onClose: () => void
  /** Where the search looks: the library, as you type, or online. */
  where: SearchTab
  onWhereChange: (where: SearchTab) => void
  /** Each place's id, so focus can be handed to it. */
  whereId: (where: SearchTab) => string
  /** The field, which the shortcut and closing focus. */
  inputRef: RefObject<HTMLInputElement>
}

/**
 * The desktop's one search: a soft field at the header's centre, with where
 * it looks always in sight beside it, Library or Online, as words lit by an
 * LED. It shows its shortcut until results show, then a way to close them;
 * Escape closes them too. Styled by `.soft-field` and `.search-where`.
 */
export function HeaderSearch({
  value,
  onChange,
  onSubmit,
  open,
  onClose,
  where,
  onWhereChange,
  whereId,
  inputRef,
}: HeaderSearchProps) {
  const shortcut = searchShortcut()
  return (
    <div className="soft-field header-search" role="search">
      <Search aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        placeholder={PROMPTS[where]}
        aria-label={PROMPTS[where]}
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
      <ChoiceGroup
        label="Search in"
        choices={PLACES}
        value={where}
        onChange={onWhereChange}
        choiceId={whereId}
        // Picked with the pointer: what to look for is typed next.
        onPick={() => inputRef.current?.focus()}
        className="search-where"
        choiceClassName="led-choice"
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
