import type { EntrypointContextParams } from "@owlmeans/client"
import type { DispatcherProps } from "@owlmeans/client-auth"
import type { PropsWithChildren } from "react"

export interface ParametrisedProps extends PropsWithChildren<EntrypointContextParams & DispatcherProps> {
}