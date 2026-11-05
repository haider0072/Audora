import { SUPPORTED_AUDIO_EXTENSIONS } from "@/lib/audio-formats"

const FORMATS = SUPPORTED_AUDIO_EXTENSIONS.map((extension) => extension.toUpperCase()).join(", ")

/**
 * Over the whole window while files are dragged in from outside. It takes no
 * pointer events: the drop lands on the window, wherever it is let go.
 */
export function DropOverlay({ busy }: { busy: boolean }) {
  return (
    <div className="drop-overlay" aria-hidden="true">
      <div className="drop-overlay-frame">
        <p className="drop-overlay-title">{busy ? "Your library is busy" : "Drop to add music"}</p>
        <p className="drop-overlay-hint">
          {busy ? "Drop again once it has finished loading or adding songs." : `Songs or whole folders: ${FORMATS}.`}
        </p>
      </div>
    </div>
  )
}
