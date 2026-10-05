import { LoginIntent } from '@owlmeans/client-auth/login'
import { SurrogateStage } from './consts.js'

export interface SurrogateViewProps {
  stage: SurrogateStage
  intent: LoginIntent
  onAction?: () => void
  error?: string
  translate?: (key: string, defaultValue: string) => string
}
