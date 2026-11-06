"use client"

import { forwardRef, useId, useState, type ComponentPropsWithoutRef, type ReactNode } from "react"

import { CLOUD_STATUS_LABELS, cloudLed } from "@/components/desktop/cloud-status"
import { StatusLed } from "@/components/desktop/status-led"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import type { CloudLibraryStatus } from "@/hooks/use-cloud-library"
import { useLibraryStorage } from "@/hooks/use-library-storage"
import { useReturnFocus } from "@/hooks/use-return-focus"
import { toast } from "@/hooks/use-toast"
import { formatBytes, STORAGE_WARN_THRESHOLD, type QuotaStatus } from "@/lib/storage-quota"
import type { DownloadTarget } from "@/lib/tidal-types"
import { formatCount } from "@/lib/utils"

export interface SettingsViewProps {
  /** The equalizer's preset, by name. */
  soundPreset: string
  normalization: boolean
  onOpenSound: () => void
  cloudStatus: CloudLibraryStatus
  /** Songs in the cloud library. */
  cloudSongCount: number
  onOpenCloud: () => void
  syncConnected: boolean
  onOpenSync: () => void
  /** Where online downloads are saved. */
  downloadTarget: DownloadTarget
  onDownloadTargetChange: (target: DownloadTarget) => void
  /** Songs in the library: what a reset removes, and whether there is anything to reclaim or reset. */
  songCount: number
  /** Clears the library; true once it is cleared. */
  onReset: () => Promise<boolean>
}

const MEASURING = "Measuring…"

/** Each place online downloads can go: how its row reads, and the change it offers. */
const DOWNLOAD_TARGETS: Record<DownloadTarget, { value: string; detail: string; change: string }> = {
  device: {
    value: "This device",
    detail: "Saved in this browser, and to the cloud library too while it's signed in.",
    change: "Save to the cloud only",
  },
  cloud: {
    value: "Cloud only",
    detail: "Saved straight to the cloud library, never in this browser. The cloud library must be signed in.",
    change: "Save on this device",
  },
}

/** What the browser's own figures can honestly say about the space it gives. */
function spaceRow(quota: QuotaStatus | undefined): { value: string; detail: string } {
  if (!quota) return { value: MEASURING, detail: "" }
  if (!quota.supported) return { value: "Unknown", detail: "This browser doesn't say how much it stores." }
  if (!quota.reliable) {
    return {
      value: formatBytes(quota.usage),
      detail: "This browser reports a stand-in limit rather than its real one, so nothing is capped here.",
    }
  }
  return {
    value: `${formatBytes(quota.usage)} of ${formatBytes(quota.quota)}`,
    detail:
      quota.percentUsed >= STORAGE_WARN_THRESHOLD
        ? "Nearly full: new downloads are refused until space is freed."
        : `${formatBytes(quota.available)} free for Audora.`,
  }
}

/**
 * Settings, as rows that each say how a thing stands and offer the change: the
 * sound, the cloud library, where online downloads go and the second device,
 * what the library stores, and the reset. The view's head is the player's.
 * Styled by `.settings` in app/globals.css.
 */
export function SettingsView({
  soundPreset,
  normalization,
  onOpenSound,
  cloudStatus,
  cloudSongCount,
  onOpenCloud,
  syncConnected,
  onOpenSync,
  downloadTarget,
  onDownloadTargetChange,
  songCount,
  onReset,
}: SettingsViewProps) {
  const storage = useLibraryStorage(songCount)
  const returnFocus = useReturnFocus()
  // Files no song uses, once counted: reclaiming them asks first.
  const [orphans, setOrphans] = useState(0)
  // Reclaiming or resetting, which each walk the whole store.
  const [busy, setBusy] = useState(false)

  const { info } = storage
  const space = spaceRow(info?.quota)
  const cloudLabel = CLOUD_STATUS_LABELS[cloudStatus]
  const downloads = DOWNLOAD_TARGETS[downloadTarget]
  const stored = info
    ? `, with ${formatBytes(info.used - info.albumArtSize)} of audio and ${formatBytes(info.albumArtSize)} of album art`
    : ""
  const resetWarning =
    `This removes ${formatCount(songCount, "song")} from this browser${stored}. ` +
    "The cloud library stays in the cloud, and your sound settings stay as they are. This can't be undone."
  const nothingStored = songCount === 0

  const findOrphans = async () => {
    setBusy(true)
    const found = await storage.findOrphans()
    setBusy(false)
    // Asked from the button that counted, so closing the question goes back to it.
    if (found > 0) returnFocus.open(() => setOrphans(found))
  }
  const reclaim = async () => {
    setOrphans(0)
    setBusy(true)
    await storage.reclaim()
    setBusy(false)
  }
  const reset = async () => {
    setBusy(true)
    const cleared = await onReset()
    setBusy(false)
    if (cleared) toast({ title: "Library reset", description: "Its songs, audio and album art are gone from this browser." })
  }

  return (
    <>
      <div className="settings">
        <SettingsSection title="Sound">
          <SettingsRow
            label="Equalizer"
            detail="Its bands and preamp, and loudness normalization."
            value={`${soundPreset} · normalization ${normalization ? "on" : "off"}`}
          >
            <RowButton aria-haspopup="dialog" onClick={onOpenSound}>
              Open Sound
            </RowButton>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Cloud and devices">
          <SettingsRow
            label="Cloud library"
            detail="Your music, kept in the cloud and played from there."
            value={
              <>
                <StatusLed state={cloudLed(cloudStatus)} />
                {cloudStatus === "ready" ? `${cloudLabel} · ${formatCount(cloudSongCount, "song")}` : cloudLabel}
              </>
            }
          >
            <RowButton aria-haspopup="dialog" onClick={onOpenCloud}>
              Open cloud library
            </RowButton>
          </SettingsRow>
          <SettingsRow label="Online downloads" detail={downloads.detail} value={downloads.value}>
            <RowButton onClick={() => onDownloadTargetChange(downloadTarget === "cloud" ? "device" : "cloud")}>
              {downloads.change}
            </RowButton>
          </SettingsRow>
          <SettingsRow
            label="Two-device playback"
            detail="The same song, in step, on a second device."
            value={
              <>
                <StatusLed state={syncConnected ? "on" : "off"} />
                {syncConnected ? "On" : "Off"}
              </>
            }
          >
            <RowButton aria-haspopup="dialog" onClick={onOpenSync}>
              Open two-device playback
            </RowButton>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Storage">
          <SettingsRow
            label="Songs kept here"
            detail="Audio saved in this browser."
            value={info ? `${formatCount(info.songs, "song")} · ${formatBytes(info.used - info.albumArtSize)}` : MEASURING}
          />
          {/* The store counts songs with a cover, and the bytes of each shared cover once. */}
          <SettingsRow
            label="Album art"
            detail="An album's songs share one cover, stored once."
            value={info ? `Covers for ${formatCount(info.albumArtCount, "song")} · ${formatBytes(info.albumArtSize)}` : MEASURING}
          />
          <SettingsRow
            label="Video lookups"
            detail="Videos found for songs, kept so they come back without asking YouTube again."
            value={formatCount(storage.videoLookups, "song")}
          >
            <RowButton onClick={storage.clearVideoLookups} unavailable={storage.videoLookups === 0}>
              Clear lookups
            </RowButton>
          </SettingsRow>
          <SettingsRow label="Space used" detail={space.detail} value={space.value} />
          <SettingsRow
            label="Kept when the disk fills"
            detail={
              info?.quota.persisted
                ? "The browser won't clear the library to free space."
                : "The browser may clear the library if the disk fills up."
            }
            value={
              info ? (
                <>
                  <StatusLed state={info.quota.persisted ? "on" : "off"} />
                  {info.quota.persisted ? "Yes" : "No"}
                </>
              ) : (
                MEASURING
              )
            }
          />
          <SettingsRow
            label="Reclaim space"
            detail="Removes stored files no song uses, left by removed songs or stopped downloads."
          >
            <RowButton onClick={() => void findOrphans()} unavailable={busy || nothingStored}>
              Reclaim space
            </RowButton>
          </SettingsRow>
          <SettingsRow label="Export" detail="The library's songs and their details, as a JSON file.">
            <RowButton onClick={storage.exportMetadata}>Export library</RowButton>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title="Library">
          <SettingsRow
            label="Reset library"
            detail="Removes every song from this browser, with its audio and album art. The cloud library and your sound settings stay."
          >
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <RowButton unavailable={busy || nothingStored}>Reset library…</RowButton>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset the library?</AlertDialogTitle>
                  <AlertDialogDescription>{resetWarning}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void reset()}>Reset library</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </SettingsRow>
        </SettingsSection>
      </div>

      <AlertDialog open={orphans > 0} onOpenChange={(open) => !open && setOrphans(0)}>
        <AlertDialogContent onCloseAutoFocus={returnFocus.onCloseAutoFocus}>
          <AlertDialogHeader>
            <AlertDialogTitle>Reclaim space?</AlertDialogTitle>
            <AlertDialogDescription>
              {formatCount(orphans, "stored file")} no song uses will be removed. Every song in your library stays.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void reclaim()}>Reclaim space</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section className="settings-section" aria-labelledby={id}>
      <h2 id={id} className="settings-heading">
        {title}
      </h2>
      <div className="settings-rows">{children}</div>
    </section>
  )
}

interface SettingsRowProps {
  label: string
  detail?: string
  /** How it stands, as data. */
  value?: ReactNode
  /** The change it offers. */
  children?: ReactNode
}

function SettingsRow({ label, detail, value, children }: SettingsRowProps) {
  return (
    <div className="settings-row">
      <div className="settings-row-text">
        <p className="settings-row-label">{label}</p>
        {detail && <p className="settings-row-detail">{detail}</p>}
      </div>
      {value !== undefined && <p className="settings-row-value type-data">{value}</p>}
      {children && <div className="settings-row-action">{children}</div>}
    </div>
  )
}

interface RowButtonProps extends ComponentPropsWithoutRef<"button"> {
  /** It can't run now. It says so and does nothing, but keeps focus rather than dropping it. */
  unavailable?: boolean
}

/**
 * A row's action, as a text button. Unavailable, it stays focusable, so the
 * focus a dialog hands back to it, or that was on it as it ran, isn't lost.
 * Forwards its ref for a dialog trigger, which gives focus back through it.
 */
const RowButton = forwardRef<HTMLButtonElement, RowButtonProps>(function RowButton(
  { unavailable = false, onClick, ...props },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      type="button"
      className="text-button"
      aria-disabled={unavailable || undefined}
      onClick={unavailable ? undefined : onClick}
    />
  )
})
