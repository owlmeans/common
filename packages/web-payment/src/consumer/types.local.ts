import type { RequestShape } from '@owlmeans/entrypoint'
import type { DeclarationStep, WithdrawalFormProps } from './types.js'
import { type ReactNode } from 'react'

export interface Tree {
  [key: string]: string | Tree
}

// Kept as a type: `RequestShape` declares `body` loosely and this narrows it, which interface `extends` refuses.
/** A protocol whose request carries `body`: the record, withdraw and cancel routes. */
export type BodyRequest<Body> = RequestShape & { body: Body }

export interface Frame {
  title: string
  intro: string
  language: string
  step: DeclarationStep
}

export interface StepsProps extends WithdrawalFormProps {
  /** How the title and intro are rendered — a section heading, or a dialog's title. */
  frame: (frame: Frame, body: ReactNode) => ReactNode
}
