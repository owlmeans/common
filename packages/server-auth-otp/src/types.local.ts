import type { OtpChallenge } from './types.js'
import type { ResourceRecord } from '@owlmeans/resource'

export interface Clock { (): number }

export interface StoredChallenge extends OtpChallenge { failedAttempts: number, expiresAt: number }

export interface ChallengeResourceRecord extends ResourceRecord { id: string }

export interface ThrottleResourceRecord extends ResourceRecord { id: string }
