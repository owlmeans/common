import type { BlueprintCatalogue } from '@owlmeans/viable-common'

export interface BlueprintDescriptionHelper {
  render: (catalogue: BlueprintCatalogue) => string
}
