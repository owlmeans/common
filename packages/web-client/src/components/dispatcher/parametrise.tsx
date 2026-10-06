import type { RoutedComponent } from "@owlmeans/client"
import type { DispatcherProps } from "@owlmeans/client-auth"
import type { FlowPayload } from "@owlmeans/flow"
import { useMemo } from "react"
import { Dispatcher } from "./component.js"
import { ParametrisedProps } from "./types.js"

export const parametriseDispatcher = (def: Partial<ParametrisedProps>, Com?: RoutedComponent<DispatcherProps> ) => {
  return (props: ParametrisedProps) => {
    const _props = useMemo(() => {
      let payload: FlowPayload | undefined = undefined
      if (def.payload != null) {
        payload = def.payload
      }
      if (props.payload != null) {
        payload ??= {}
        Object.assign(payload, props.payload)
      }
      return { ...def, ...props, payload }
    }, [props])
    Com ??= Dispatcher
    return <Com {..._props} />
  }
}

