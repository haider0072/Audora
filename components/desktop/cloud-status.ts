import type { LedState } from "@/components/desktop/status-led"
import type { CloudLibraryStatus } from "@/hooks/use-cloud-library"

/** How the cloud library stands, read out beside its LED. */
export const CLOUD_STATUS_LABELS: Record<CloudLibraryStatus, string> = {
  unavailable: "Not set up",
  "signed-out": "Signed out",
  loading: "Connecting",
  ready: "Connected",
  error: "Couldn't connect",
}

/** The cloud library's LED: lit while connected, a fault when it could not connect. */
export function cloudLed(status: CloudLibraryStatus): LedState {
  if (status === "ready") return "on"
  if (status === "error") return "error"
  return "off"
}
