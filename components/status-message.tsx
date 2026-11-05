"use client"

/** The way forward a message offers, such as trying again or adding music. */
export interface StatusAction {
  label: string
  onClick: () => void
}

interface StatusMessageProps {
  title: string
  detail?: string
  action?: StatusAction
  /** Smaller, for a message that stands in for one section of a view rather than the whole of it. */
  inline?: boolean
}

/**
 * What a view says when it has nothing to show: an empty library, a search
 * with no matches, lyrics still being looked for or not found. Styled by
 * `.status-message` in app/globals.css.
 */
export function StatusMessage({ title, detail, action, inline = false }: StatusMessageProps) {
  return (
    <div className="status-message" data-inline={inline || undefined} role="status">
      <p className="status-message-title">{title}</p>
      {detail && <p className="status-message-detail">{detail}</p>}
      {action && (
        <button type="button" className="text-button status-message-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  )
}
