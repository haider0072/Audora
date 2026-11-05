"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

/** A meter: a hairline that fills in the song's colour as the work goes. Styled by `.meter`. */
const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, max = 100, ...props }, ref) => (
  <ProgressPrimitive.Root ref={ref} className={cn("meter", className)} value={value} max={max} {...props}>
    <ProgressPrimitive.Indicator className="meter-fill" style={{ transform: `scaleX(${(value ?? 0) / max})` }} />
  </ProgressPrimitive.Root>
))
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
