import { fireEvent, render, screen } from "@testing-library/react"

import { Sheet, SheetContent, SheetHeader, SheetTitle, focusSheetOnOpen } from "@/components/ui/sheet"

function renderSheet(props: Partial<React.ComponentProps<typeof SheetContent>> = {}) {
  render(
    <Sheet defaultOpen>
      <SheetContent aria-describedby={undefined} {...props}>
        <SheetHeader>
          <SheetTitle>Sound</SheetTitle>
        </SheetHeader>
        <button type="button">Flat</button>
      </SheetContent>
    </Sheet>,
  )
}

describe("Sheet", () => {
  it("opens on its first control by default", () => {
    renderSheet()
    expect(screen.getByRole("button", { name: "Flat" })).toHaveFocus()
  })

  it("can open on itself, so none of its controls looks picked", () => {
    renderSheet({ onOpenAutoFocus: focusSheetOnOpen })
    const sheet = screen.getByRole("dialog", { name: "Sound" })
    expect(sheet).toHaveFocus()
    expect(sheet).toHaveAttribute("data-side", "right")
    expect(screen.getByRole("button", { name: "Flat" })).not.toHaveFocus()
  })

  it("closes from its own close button", () => {
    renderSheet()
    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})
