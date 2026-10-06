import type { ConnectProjectBranding, ConnectProjectBrandingSave } from '../branding/types.js'
import type {
  ConnectConvertCreateBody, ConnectConvertProceedBody, ConnectConvertStartBody, ConversionStatusView, ConvertCheck
} from '../conversion/types.js'
import type { ConnectKitApplyBody, ConnectKitApplyResult, ConnectKitDescribe } from '../kit/types.js'
import type { ConnectInquiryAnswerBody, ConnectOp, ConnectOpResult, ConnectOpSubmission } from '../ops/types.js'
import type { ConnectPipelineParams, ConnectPipelineResumeBody, ConnectPipelineState } from '../pipeline/types.js'
import type {
  ConnectAttachBody, ConnectConfirmBody, ConnectCreateBody, ConnectModifyBody, ConnectRenameBody, ConnectProjectStatus,
  ConnectProjectSummary, ConnectStoryStatus
} from '../project/types.js'
import type { ConnectPullQuery, ConnectSessionOpen, ConnectSessionParams, ConnectSessionView } from '../session/types.js'
import type { ConnectReference } from './types.local.js'

export interface ConnectReferences {
  session: {
    open: ConnectReference<{ body: ConnectSessionOpen }, ConnectSessionView>
    openDelegated: ConnectReference<{ body: ConnectSessionOpen }, ConnectSessionView>
    close: ConnectReference<{ params: ConnectSessionParams }, ConnectSessionView>
  }
  op: {
    pull: ConnectReference<{ params: ConnectSessionParams, query: ConnectPullQuery }, ConnectOp[]>
    submit: ConnectReference<{
      params: { sessionId: string, opId: string }, body: ConnectOpResult
    }, ConnectOpSubmission>
  }
  project: {
    create: ConnectReference<{ body: ConnectCreateBody }, ConnectProjectStatus>
    confirm: ConnectReference<{ params: { id: string }, body: ConnectConfirmBody }, ConnectProjectStatus>
    list: ConnectReference<{}, ConnectProjectSummary[]>
    status: ConnectReference<{ params: { id: string } }, ConnectProjectStatus>
    attach: ConnectReference<{ body: ConnectAttachBody }, ConnectProjectStatus>
    reinit: ConnectReference<{ params: { id: string } }, ConnectProjectStatus>
    modify: ConnectReference<{ params: { id: string }, body: ConnectModifyBody }, ConnectProjectStatus>
    rename: ConnectReference<{ params: { id: string }, body: ConnectRenameBody }, ConnectProjectStatus>
    kit: {
      describe: ConnectReference<{ params: { id: string } }, ConnectKitDescribe>
      apply: ConnectReference<{ params: { id: string }, body: ConnectKitApplyBody }, ConnectKitApplyResult>
    }
    branding: {
      get: ConnectReference<{ params: { id: string } }, ConnectProjectBranding>
      save: ConnectReference<{
        params: { id: string }, body: ConnectProjectBrandingSave
      }, ConnectProjectBranding>
    }
  }
  story: {
    status: ConnectReference<{ params: { id: string, storyId: string } }, ConnectStoryStatus>
  }
  files: {
    list: ConnectReference<{ params: { id: string } }, string[]>
  }
  convert: {
    create: ConnectReference<{ body: ConnectConvertCreateBody }, ConversionStatusView>
    check: ConnectReference<{ params: { id: string } }, ConvertCheck>
    start: ConnectReference<{ params: { id: string }, body: ConnectConvertStartBody }, ConversionStatusView>
    proceed: ConnectReference<{
      params: { id: string }, body: ConnectConvertProceedBody
    }, ConversionStatusView>
    status: ConnectReference<{ params: { id: string } }, ConversionStatusView>
    purge: ConnectReference<{ params: { id: string } }, ConversionStatusView>
  }
  inquiry: {
    answer: ConnectReference<{
      params: { id: string, inquiryId: string }, body: ConnectInquiryAnswerBody
    }, unknown>
  }
  pipeline: {
    state: ConnectReference<{ params: ConnectPipelineParams }, ConnectPipelineState>
    resume: ConnectReference<{
      params: ConnectPipelineParams, body: ConnectPipelineResumeBody
    }, ConnectPipelineState>
  }
}
