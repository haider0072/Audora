import { act, render, screen, waitFor } from "@testing-library/react"

import { useFileDrop } from "@/hooks/use-file-drop"
import { toast } from "@/hooks/use-toast"

jest.mock("@/hooks/use-toast", () => ({ toast: jest.fn() }))

function Harness({ onDrop, busy = false }: { onDrop: (files: File[]) => void; busy?: boolean }) {
  const dragging = useFileDrop({ onDrop, busy })
  return <p>{dragging ? "dragging" : "idle"}</p>
}

/** A drag event as the browser fires it, carrying `types` and, on a drop, files. */
function drag(type: string, { types = ["Files"], files = [] as File[] } = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent
  const items = files.map((file) => ({ kind: "file", webkitGetAsEntry: () => null, getAsFile: () => file }))
  Object.defineProperty(event, "dataTransfer", { value: { types, items, files, dropEffect: "none" } })
  act(() => {
    window.dispatchEvent(event)
  })
  return event
}

beforeEach(() => jest.mocked(toast).mockClear())

describe("useFileDrop", () => {
  it("shows while files are dragged over the window, and stops once they leave it", () => {
    render(<Harness onDrop={jest.fn()} />)
    drag("dragenter")
    // Crossing into a child element: an enter, then a leave of the parent.
    drag("dragenter")
    drag("dragleave")
    expect(screen.getByText("dragging")).toBeInTheDocument()
    drag("dragleave")
    expect(screen.getByText("idle")).toBeInTheDocument()
  })

  it("keeps the browser from opening a dragged file itself", () => {
    render(<Harness onDrop={jest.fn()} />)
    drag("dragenter")
    expect(drag("dragover").defaultPrevented).toBe(true)
  })

  it("ignores drags that carry no files, and drags that began on the page", () => {
    render(<Harness onDrop={jest.fn()} />)
    drag("dragenter", { types: ["text/plain"] })
    expect(screen.getByText("idle")).toBeInTheDocument()

    drag("dragstart")
    drag("dragenter")
    expect(screen.getByText("idle")).toBeInTheDocument()
    drag("dragend")
    drag("dragenter")
    expect(screen.getByText("dragging")).toBeInTheDocument()
  })

  it("adds what is dropped", async () => {
    const onDrop = jest.fn()
    render(<Harness onDrop={onDrop} />)
    drag("dragenter")
    const dropped = drag("drop", { files: [new File(["x"], "Teardrop.flac"), new File(["x"], "cover.jpg")] })

    expect(dropped.defaultPrevented).toBe(true)
    expect(screen.getByText("idle")).toBeInTheDocument()
    await waitFor(() => expect(onDrop).toHaveBeenCalledTimes(1))
    expect(onDrop.mock.calls[0][0].map((file: File) => file.name)).toEqual(["Teardrop.flac"])
  })

  it("turns a drop away while the library is busy", async () => {
    const onDrop = jest.fn()
    render(<Harness onDrop={onDrop} busy />)
    drag("dragenter")
    expect(drag("drop", { files: [new File(["x"], "Teardrop.flac")] }).defaultPrevented).toBe(true)

    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Your library is busy" }))
    await Promise.resolve()
    expect(onDrop).not.toHaveBeenCalled()
  })

  it("stops listening once unmounted", () => {
    const { unmount } = render(<Harness onDrop={jest.fn()} />)
    unmount()
    expect(drag("dragover").defaultPrevented).toBe(false)
  })
})
