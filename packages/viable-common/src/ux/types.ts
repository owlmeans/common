import type { UXTransitionType } from "./consts.js"

export interface UXScreenList {
  screens: string[]
}

export interface UXComponentList {
  components: string[]
}

export interface UXScreenToComponent {
  [screen: string]: string[]
}

export interface UXTransition {
  from: string
  to: string
  initiator: string
  action: string
  type: UXTransitionType
}

export interface UXTransitionList {
  transitions: UXTransition[]
}