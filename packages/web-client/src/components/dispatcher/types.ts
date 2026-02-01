import type { ModuleContextParams } from "@owlmeans/client"
import type { DispatcherProps } from "@owlmeans/client-auth"
import type { PropsWithChildren } from "react"

export interface ParametrisedProps extends PropsWithChildren<ModuleContextParams & DispatcherProps> {
}