"use client"

import { forwardRef, useRef, useState, type FormEvent } from "react"
import { Link2, X } from "lucide-react"

interface PasteLinkToggleProps {
  open: boolean
  /** The field it opens. */
  fieldId: string
  onToggle: () => void
}

/** Opens the field for a song's link, for a song the search does not find. Quiet until wanted. */
export const PasteLinkToggle = forwardRef<HTMLButtonElement, PasteLinkToggleProps>(function PasteLinkToggle(
  { open, fieldId, onToggle },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className="online-paste-toggle"
      aria-expanded={open}
      aria-controls={open ? fieldId : undefined}
      onClick={onToggle}
    >
      <Link2 aria-hidden="true" />
      Paste a link
    </button>
  )
})

interface PasteLinkFieldProps {
  id: string
  /** Resolves the link and queues the song; true once it is on its way. */
  onSubmit: (url: string) => Promise<boolean>
  /** The link is being looked up. */
  resolving: boolean
  onClose: () => void
}

/**
 * A song's link, from Amazon Music or Qobuz, to download it by. It takes
 * focus as it opens; Escape closes it, and so does a link that works.
 */
export function PasteLinkField({ id, onSubmit, resolving, onClose }: PasteLinkFieldProps) {
  const [url, setUrl] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const ready = url.trim() !== "" && !resolving

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!ready) return
    if (await onSubmit(url)) onClose()
  }

  return (
    <form id={id} className="online-paste" onSubmit={submit}>
      <div className="soft-field online-field">
        <Link2 aria-hidden="true" />
        <input
          ref={inputRef}
          // Opened on request, so focus belongs here.
          autoFocus
          type="text"
          inputMode="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return
            event.preventDefault()
            onClose()
          }}
          placeholder="A song's Amazon Music or Qobuz link"
          aria-label="Song link"
          autoComplete="off"
          spellCheck={false}
        />
        {url && (
          <button
            type="button"
            className="soft-field-clear"
            aria-label="Clear the link"
            onClick={() => {
              setUrl("")
              inputRef.current?.focus()
            }}
          >
            <X aria-hidden="true" />
          </button>
        )}
      </div>
      <button type="submit" className="text-button" aria-disabled={!ready || undefined}>
        {resolving ? "Finding…" : "Download"}
      </button>
    </form>
  )
}
