import { act, fireEvent, render, screen } from "@testing-library/react"

import { CloudLibraryPanel } from "@/components/cloud-library-panel"
import { SyncPanel } from "@/components/sync-panel"
import { Toaster } from "@/components/ui/toaster"
import type { UseCloudLibraryReturn } from "@/hooks/use-cloud-library"
import type { UseDeviceSyncReturn } from "@/hooks/use-device-sync"
import { toast } from "@/hooks/use-toast"

// The fine-tune fader measures its knob; jsdom has no layout to measure.
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

function cloudWith(overrides: Partial<UseCloudLibraryReturn> = {}): UseCloudLibraryReturn {
  return {
    status: "signed-out",
    songCount: 0,
    pending: 0,
    error: null,
    signIn: jest.fn().mockResolvedValue(true),
    signOut: jest.fn().mockResolvedValue(undefined),
    refresh: jest.fn(),
    upload: jest.fn(),
    ...overrides,
  }
}

function syncWith(overrides: Partial<UseDeviceSyncReturn> = {}): UseDeviceSyncReturn {
  return {
    status: "idle",
    detail: null,
    role: "host",
    room: null,
    peerName: null,
    getClock: () => ({ offsetMs: 0, locked: false }),
    isConnected: false,
    isFollowing: false,
    startHosting: jest.fn().mockReturnValue("123456"),
    join: jest.fn(),
    handOver: jest.fn(),
    leave: jest.fn(),
    send: jest.fn(),
    subscribe: jest.fn(() => () => {}),
    missingTrackLabel: null,
    broadcast: jest.fn(),
    ...overrides,
  }
}

describe("CloudLibraryPanel", () => {
  it("signs in with the password typed, and says Sign in can't run without one", async () => {
    const cloud = cloudWith()
    render(<CloudLibraryPanel cloud={cloud} songs={[]} />)

    const signIn = screen.getByRole("button", { name: "Sign in" })
    expect(signIn).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(signIn)
    expect(cloud.signIn).not.toHaveBeenCalled()

    const password = screen.getByLabelText("Password")
    fireEvent.change(password, { target: { value: "stand-in" } })
    expect(signIn).not.toHaveAttribute("aria-disabled")
    await act(async () => {
      fireEvent.click(signIn)
    })
    expect(cloud.signIn).toHaveBeenCalledWith("stand-in")
    expect(password).toHaveValue("")
  })

  it("says what went wrong in words, as an alert", () => {
    render(<CloudLibraryPanel cloud={cloudWith({ status: "error", error: "Wrong password" })} songs={[]} />)
    expect(screen.getByRole("alert")).toHaveTextContent("Wrong password")
  })

  it("counts the cloud's songs, and those still being read", () => {
    render(<CloudLibraryPanel cloud={cloudWith({ status: "ready", songCount: 883, pending: 3 })} songs={[]} />)
    expect(screen.getByText("883 songs in the cloud")).toBeInTheDocument()
    expect(screen.getByText("Reading 3 new")).toBeInTheDocument()
  })

  it("can't refresh while the listing is loading", () => {
    const cloud = cloudWith({ status: "loading" })
    render(<CloudLibraryPanel cloud={cloud} songs={[]} />)
    const refresh = screen.getByRole("button", { name: "Refresh" })
    expect(refresh).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(refresh)
    expect(cloud.refresh).not.toHaveBeenCalled()
  })

  it("signs out of every device when asked to", () => {
    const cloud = cloudWith({ status: "ready", songCount: 2 })
    render(<CloudLibraryPanel cloud={cloud} songs={[]} />)
    fireEvent.click(screen.getByRole("button", { name: "Sign out of all devices" }))
    expect(cloud.signOut).toHaveBeenCalledWith({ everywhere: true })
  })
})

describe("SyncPanel", () => {
  it("joins with a six-digit code, typed as digits only", () => {
    const sync = syncWith()
    render(<SyncPanel sync={sync} />)

    const code = screen.getByRole("textbox", { name: "Session code from the other device" })
    const join = screen.getByRole("button", { name: "Join" })
    fireEvent.change(code, { target: { value: "12a34" } })
    expect(code).toHaveValue("1234")
    expect(join).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(join)
    expect(sync.join).not.toHaveBeenCalled()

    fireEvent.change(code, { target: { value: "123456" } })
    fireEvent.keyDown(code, { key: "Enter" })
    expect(sync.join).toHaveBeenCalledWith("123456")
  })

  it("shows the code to read out once hosting", () => {
    const sync = syncWith()
    const { rerender } = render(<SyncPanel sync={sync} />)
    fireEvent.click(screen.getByRole("button", { name: "Host a session" }))
    rerender(<SyncPanel sync={{ ...sync, status: "signaling" }} />)
    expect(screen.getByText("123456")).toBeInTheDocument()
    expect(screen.getByText("Pairing…")).toBeInTheDocument()
  })

  it("says how it stands in words, a fault included", () => {
    render(<SyncPanel sync={syncWith({ status: "failed", detail: "The other device left" })} />)
    expect(screen.getByText("Failed")).toBeInTheDocument()
    expect(screen.getByText("The other device left")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "End session" })).toBeInTheDocument()
  })

  it("offers the fine tune and the hand-over once connected as host", () => {
    const sync = syncWith({ status: "connected", isConnected: true, peerName: "Phone" })
    render(<SyncPanel sync={sync} />)
    expect(screen.getByText("Hosting")).toBeInTheDocument()
    expect(screen.getByText("Phone")).toBeInTheDocument()
    expect(
      screen.getByRole("slider", { name: "Fine tune this device against the other one, in milliseconds" }),
    ).toHaveAttribute("aria-valuetext", "0 ms")
    fireEvent.click(screen.getByRole("button", { name: "Let the other device take over" }))
    expect(sync.handOver).toHaveBeenCalled()
  })
})

describe("Toaster", () => {
  it("marks a notice of something gone wrong with an icon beside its words, and leaves others plain", () => {
    const { container } = render(<Toaster />)
    act(() => {
      toast({ title: "This song couldn't play", variant: "destructive" })
    })
    expect(screen.getByText("This song couldn't play")).toBeInTheDocument()
    expect(container.ownerDocument.querySelector(".notice-icon")).not.toBeNull()

    act(() => {
      toast({ title: "Added to queue" })
    })
    expect(screen.getByText("Added to queue")).toBeInTheDocument()
    expect(container.ownerDocument.querySelector(".notice-icon")).toBeNull()
  })
})
