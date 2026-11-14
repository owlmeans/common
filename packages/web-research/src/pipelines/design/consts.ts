import type { PipelineSpec } from '@owlmeans/agent-common'
import { DesignStep, ResearchPipeline } from '../../consts.js'

/** `research:design` — clone a page as a bundle (or take one in place), read its design offline, pack a style reference. */
export const designSpec: PipelineSpec = {
  alias: ResearchPipeline.Design,
  version: 1,
  steps: [
    { step: DesignStep.Collect, title: 'Clone the page with its styles' },
    { step: DesignStep.Analyze, after: [DesignStep.Collect], title: 'Read the design' },
    { step: DesignStep.Pack, after: [DesignStep.Analyze], title: 'Write the style reference' },
    { step: DesignStep.Cleanup, after: [DesignStep.Pack], title: 'Remove the clone' },
  ],
}

/** The area path of a run's design analysis. */
export const DESIGN_ANALYSIS_FILE = 'design/analysis.json'

/** What a brand name is replaced with in the prose a style reference keeps. */
export const BRAND_PLACEHOLDER = 'the reference brand'

/** The DESIGN.md sections a style reference carries over as prose. */
export const DESIGN_PROSE_SECTIONS: readonly string[] = Object.freeze(['Overview', 'Layout', "Do's and Don'ts"])
