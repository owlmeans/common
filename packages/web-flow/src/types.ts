
import { FlowService as ClientFlowService } from '@owlmeans/client-flow'

export interface FlowService extends ClientFlowService {
  goHome: (alias?: string, dryRun?: boolean) => Promise<string>
}
