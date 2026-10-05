import { entrypointRef } from '@owlmeans/entrypoint'
import { connect } from './consts.js'
import type { ConnectProjectBranding, ConnectProjectBrandingSave } from './branding/types.js'
import type {
  ConnectConvertCreateBody, ConnectConvertProceedBody, ConnectConvertStartBody, ConversionStatusView, ConvertCheck
} from './conversion/types.js'
import type { ConnectKitApplyBody, ConnectKitApplyResult, ConnectKitDescribe } from './kit/types.js'
import type { ConnectInquiryAnswerBody, ConnectOp, ConnectOpResult, ConnectOpSubmission } from './ops/types.js'
import type { ConnectPipelineParams, ConnectPipelineResumeBody, ConnectPipelineState } from './pipeline/types.js'
import type {
  ConnectAttachBody, ConnectConfirmBody, ConnectCreateBody, ConnectModifyBody, ConnectProjectStatus,
  ConnectProjectSummary, ConnectStoryStatus
} from './project/types.js'
import type { ConnectReferences } from './references/types.js'
import type { ConnectPullQuery, ConnectSessionOpen, ConnectSessionParams, ConnectSessionView } from './session/types.js'

/**
 * Typed references for adapter packages that address the connector dynamically.  Applications
 * export protocol objects instead; an adapter may use this compact form because it never exposes
 * aliases to UI or domain code.
 */
export const connectRef: ConnectReferences = {
  session: {
    open: entrypointRef<{ body: ConnectSessionOpen }, ConnectSessionView>(connect.session.open),
    openDelegated: entrypointRef<{ body: ConnectSessionOpen }, ConnectSessionView>(connect.session.openDelegated),
    close: entrypointRef<{ params: ConnectSessionParams }, ConnectSessionView>(connect.session.close),
  },
  op: {
    pull: entrypointRef<{ params: ConnectSessionParams, query: ConnectPullQuery }, ConnectOp[]>(connect.op.pull),
    submit: entrypointRef<{
      params: { sessionId: string, opId: string }, body: ConnectOpResult
    }, ConnectOpSubmission>(connect.op.submit),
  },
  project: {
    create: entrypointRef<{ body: ConnectCreateBody }, ConnectProjectStatus>(connect.project.create),
    confirm: entrypointRef<{ params: { id: string }, body: ConnectConfirmBody }, ConnectProjectStatus>(connect.project.confirm),
    list: entrypointRef<{}, ConnectProjectSummary[]>(connect.project.list),
    status: entrypointRef<{ params: { id: string } }, ConnectProjectStatus>(connect.project.status),
    attach: entrypointRef<{ body: ConnectAttachBody }, ConnectProjectStatus>(connect.project.attach),
    reinit: entrypointRef<{ params: { id: string } }, ConnectProjectStatus>(connect.project.reinit),
    modify: entrypointRef<{ params: { id: string }, body: ConnectModifyBody }, ConnectProjectStatus>(connect.project.modify),
    kit: {
      describe: entrypointRef<{ params: { id: string } }, ConnectKitDescribe>(connect.project.kit.describe),
      apply: entrypointRef<{
        params: { id: string }, body: ConnectKitApplyBody
      }, ConnectKitApplyResult>(connect.project.kit.apply),
    },
    branding: {
      get: entrypointRef<{ params: { id: string } }, ConnectProjectBranding>(connect.project.branding.get),
      save: entrypointRef<{
        params: { id: string }, body: ConnectProjectBrandingSave
      }, ConnectProjectBranding>(connect.project.branding.save),
    },
  },
  story: {
    status: entrypointRef<{
      params: { id: string, storyId: string }
    }, ConnectStoryStatus>(connect.story.status),
  },
  convert: {
    create: entrypointRef<{ body: ConnectConvertCreateBody }, ConversionStatusView>(connect.convert.create),
    check: entrypointRef<{ params: { id: string } }, ConvertCheck>(connect.convert.check),
    start: entrypointRef<{
      params: { id: string }, body: ConnectConvertStartBody
    }, ConversionStatusView>(connect.convert.start),
    proceed: entrypointRef<{
      params: { id: string }, body: ConnectConvertProceedBody
    }, ConversionStatusView>(connect.convert.proceed),
    status: entrypointRef<{
      params: { id: string }
    }, ConversionStatusView>(connect.convert.status),
    purge: entrypointRef<{ params: { id: string } }, ConversionStatusView>(connect.convert.purge),
  },
  inquiry: {
    answer: entrypointRef<{
      params: { id: string, inquiryId: string }, body: ConnectInquiryAnswerBody
    }, unknown>(connect.inquiry.answer),
  },
  files: {
    list: entrypointRef<{ params: { id: string } }, string[]>(connect.files.list),
  },
  pipeline: {
    state: entrypointRef<{ params: ConnectPipelineParams }, ConnectPipelineState>(connect.pipeline.state),
    resume: entrypointRef<{
      params: ConnectPipelineParams, body: ConnectPipelineResumeBody
    }, ConnectPipelineState>(connect.pipeline.resume),
  },
}
