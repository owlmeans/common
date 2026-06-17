import type { GuardService } from '@owlmeans/entrypoint'

export interface BasicEd25519Guard extends GuardService {
}

export interface BasicEd25519GuardOptions {
  cache?: string
}

