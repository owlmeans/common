import type { MigrationStage } from '@owlmeans/resource'

export interface LedgerRecord {
  alias: string
  name: string
  stage: MigrationStage
  checksum: string | null
  baseline: boolean
  startedAt: Date
  /** `null` while a replica is running it — the claim, not the completion. */
  completedAt: Date | null
  durationMs: number | null
}
