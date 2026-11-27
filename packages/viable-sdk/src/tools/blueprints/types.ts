import type { StackCatalogue } from '@owlmeans/viable-common'

export interface BlueprintDescriptionHelper {
  render: (catalogue: StackCatalogue) => string
}
