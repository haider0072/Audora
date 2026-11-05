import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"

import { SettingsView, type SettingsViewProps } from "@/components/desktop/settings-view"
import { useLibraryStorage, type LibraryStorage } from "@/hooks/use-library-storage"
import { toast } from "@/hooks/use-toast"
import type { QuotaStatus } from "@/lib/storage-quota"

jest.mock("@/hooks/use-library-storage", () => ({ useLibraryStorage: jest.fn() }))
jest.mock("@/hooks/use-toast", () => ({ toast: jest.fn() }))

const MB = 1024 * 1024
const GB = 1024 * MB

/** Brave and Firefox report a flat 2 GiB, so usage can pass the "limit". */
const STAND_IN: QuotaStatus = {
  usage: 5 * GB,
  quota: 2 * GB,
  available: 0,
  percentUsed: 2.5,
  persisted: true,
  supported: true,
  reliable: false,
}

function storageWith(overrides: Partial<LibraryStorage> = {}): LibraryStorage {
  return {
    info: { used: 3.5 * MB, songs: 12, albumArtCount: 40, albumArtSize: 0.5 * MB, quota: STAND_IN },
    videoLookups: 7,
    findOrphans: jest.fn().mockResolvedValue(0),
    reclaim: jest.fn().mockResolvedValue(true),
    exportMetadata: jest.fn(),
    clearVideoLookups: jest.fn(),
    ...overrides,
  }
}

function renderSettings(props: Partial<SettingsViewProps> = {}, storage = storageWith()) {
  ;(useLibraryStorage as jest.Mock).mockReturnValue(storage)
  const all: SettingsViewProps = {
    soundPreset: "Bass boost",
    normalization: true,
    onOpenSound: jest.fn(),
    cloudStatus: "ready",
    cloudSongCount: 883,
    onOpenCloud: jest.fn(),
    syncConnected: false,
    onOpenSync: jest.fn(),
    songCount: 2,
    onReset: jest.fn().mockResolvedValue(true),
    ...props,
  }
  return { ...render(<SettingsView {...all} />), props: all, storage }
}

/** The row a setting's label heads. */
function row(label: string): HTMLElement {
  return screen.getByText(label, { selector: ".settings-row-label" }).closest(".settings-row") as HTMLElement
}

beforeEach(() => jest.clearAllMocks())

describe("SettingsView", () => {
  it("says how the sound, the cloud and the second device stand, and opens each", () => {
    const { props } = renderSettings()

    expect(within(row("Equalizer")).getByText("Bass boost · normalization on")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Open Sound" }))
    expect(props.onOpenSound).toHaveBeenCalledTimes(1)

    expect(within(row("Cloud library")).getByText("Connected · 883 songs")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Open cloud library" }))
    expect(props.onOpenCloud).toHaveBeenCalledTimes(1)

    expect(within(row("Two-device playback")).getByText("Off")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Open two-device playback" }))
    expect(props.onOpenSync).toHaveBeenCalledTimes(1)
  })

  it("shows what the library keeps here, with the real figures", () => {
    renderSettings()
    expect(within(row("Songs kept here")).getByText("12 songs · 3 MB")).toBeInTheDocument()
    expect(within(row("Album art")).getByText("Covers for 40 songs · 512 KB")).toBeInTheDocument()
    expect(within(row("Video lookups")).getByText("7 songs")).toBeInTheDocument()
    expect(within(row("Kept when the disk fills")).getByText("Yes")).toBeInTheDocument()
  })

  it("gives no limit for a browser that reports a stand-in one", () => {
    renderSettings()
    const space = row("Space used")
    expect(within(space).getByText("5 GB")).toBeInTheDocument()
    expect(within(space).getByText(/stand-in limit/)).toBeInTheDocument()
  })

  it("gives the real limit, and what is free, when the browser reports one", () => {
    const quota: QuotaStatus = { ...STAND_IN, usage: GB, quota: 10 * GB, available: 9 * GB, percentUsed: 0.1, reliable: true }
    renderSettings({}, storageWith({ info: { used: MB, songs: 1, albumArtCount: 0, albumArtSize: 0, quota } }))
    const space = row("Space used")
    expect(within(space).getByText("1 GB of 10 GB")).toBeInTheDocument()
    expect(within(space).getByText("9 GB free for Audora.")).toBeInTheDocument()
  })

  it("says it is measuring until the figures are in", () => {
    renderSettings({}, storageWith({ info: null }))
    expect(within(row("Songs kept here")).getByText("Measuring…")).toBeInTheDocument()
    expect(within(row("Space used")).getByText("Measuring…")).toBeInTheDocument()
  })

  it("reclaims space only after asking, with the count it found", async () => {
    const { storage } = renderSettings({}, storageWith({ findOrphans: jest.fn().mockResolvedValue(3) }))

    fireEvent.click(screen.getByRole("button", { name: "Reclaim space" }))
    const ask = await screen.findByRole("alertdialog", { name: "Reclaim space?" })
    expect(within(ask).getByText(/3 stored files no song uses/)).toBeInTheDocument()
    expect(storage.reclaim).not.toHaveBeenCalled()

    fireEvent.click(within(ask).getByRole("button", { name: "Reclaim space" }))
    await waitFor(() => expect(storage.reclaim).toHaveBeenCalledTimes(1))
  })

  it("asks nothing when there is nothing to reclaim", async () => {
    const { storage } = renderSettings()
    fireEvent.click(screen.getByRole("button", { name: "Reclaim space" }))
    await waitFor(() => expect(storage.findOrphans).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  })

  it("resets the library only after asking, and says when it is done", async () => {
    const { props } = renderSettings()

    fireEvent.click(screen.getByRole("button", { name: "Reset library…" }))
    const ask = await screen.findByRole("alertdialog", { name: "Reset the library?" })
    expect(
      within(ask).getByText(/This removes 2 songs from this browser, with 3 MB of audio and 512 KB of album art\./),
    ).toBeInTheDocument()
    expect(props.onReset).not.toHaveBeenCalled()

    fireEvent.click(within(ask).getByRole("button", { name: "Reset library" }))
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Library reset" })))
    expect(props.onReset).toHaveBeenCalledTimes(1)
  })

  it("offers no reclaim or reset for an empty library, while keeping both in reach", () => {
    const { storage } = renderSettings({ songCount: 0 })
    const reclaim = screen.getByRole("button", { name: "Reclaim space" })
    const reset = screen.getByRole("button", { name: "Reset library…" })
    expect(reclaim).toHaveAttribute("aria-disabled", "true")
    expect(reset).toHaveAttribute("aria-disabled", "true")

    fireEvent.click(reclaim)
    fireEvent.click(reset)
    expect(storage.findOrphans).not.toHaveBeenCalled()
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  })

  it("gives focus back to the button that asked, when a question is dismissed", async () => {
    renderSettings({}, storageWith({ findOrphans: jest.fn().mockResolvedValue(3) }))

    // Each question takes focus to its Cancel, and closing it brings focus home.
    async function dismiss(asker: HTMLElement) {
      asker.focus()
      fireEvent.click(asker)
      const cancel = within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancel" })
      await waitFor(() => expect(cancel).toHaveFocus())
      fireEvent.click(cancel)
      await waitFor(() => expect(asker).toHaveFocus())
    }

    await dismiss(screen.getByRole("button", { name: "Reclaim space" }))
    await dismiss(screen.getByRole("button", { name: "Reset library…" }))
  })

  it("clears video lookups, and offers nothing to clear when there are none", () => {
    const { storage, unmount } = renderSettings()
    fireEvent.click(screen.getByRole("button", { name: "Clear lookups" }))
    expect(storage.clearVideoLookups).toHaveBeenCalledTimes(1)
    unmount()

    const none = storageWith({ videoLookups: 0 })
    renderSettings({}, none)
    const clear = screen.getByRole("button", { name: "Clear lookups" })
    expect(clear).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(clear)
    expect(none.clearVideoLookups).not.toHaveBeenCalled()
  })
})
