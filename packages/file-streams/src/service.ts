import { createService, memoHelper } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { FilePropertyError } from '@owlmeans/storage-common'
import { createFileInspector } from '@owlmeans/file-inspector'
import { createArchiveHelper } from './archive.js'
import { createBackedWorkspace } from './backed-workspace.js'
import type { BackedWorkspace } from './backed-workspace/types.js'
import { FILE_STREAMS_SERVICE } from './consts.js'
import { createHttpClient } from './http.js'
import { parseProxyEndpoint } from './proxy/endpoint.js'
import type { ProxyEndpoint } from './proxy/types.js'
import { createS3Bucket } from './s3.js'
import type { S3Bucket } from './s3/types.js'
import type {
  FileStreamsBackedOptions, FileStreamsProxyConfig, FileStreamsService, FileStreamsServiceOptions,
} from './service/types.js'
import type { Config, Context } from './service/types.local.js'
import { createTransferHelper } from './transfer.js'
import { createWorkspace } from './workspace.js'

export const createFileStreamsService = (
  alias: string = FILE_STREAMS_SERVICE, options: FileStreamsServiceOptions = {}
): FileStreamsService => {
  const buckets = new Map<string, S3Bucket>()
  const backedWorkspaces = new Map<string, BackedWorkspace>()

  const configOf = (): Config => service.assertCtx<Config, Context>(alias).cfg

  const endpointOf = (proxy: FileStreamsProxyConfig): ProxyEndpoint => {
    const endpoint = parseProxyEndpoint(proxy.url)
    return {
      ...endpoint,
      ...(proxy.username != null ? { username: proxy.username, password: proxy.password ?? '' } : {}),
      ...(proxy.id != null ? { id: proxy.id } : {}),
    }
  }

  const http = memoHelper.once(() => {
    const config = configOf().fileStreams ?? {}
    return createHttpClient({
      network: { ...config.network, resolver: options.resolver },
      proxies: {
        proxies: options.proxies ?? config.proxies?.map(endpointOf),
        strategy: config.proxyStrategy,
        credentials: options.proxyCredentials,
        plugins: options.proxyPlugins,
      },
      resolvers: options.resolvers,
      userAgent: config.userAgent,
    })
  })

  const inspector = memoHelper.once(() => createFileInspector(options.inspector))

  const transfer = memoHelper.once(() => createTransferHelper({ inspector: inspector(), limits: configOf().fileStreams?.limits }))

  const archives = memoHelper.once(() => createArchiveHelper({ inspector: inspector(), limits: options.archiveLimits }))

  const bucket = (configKey: string): S3Bucket => {
    let known = buckets.get(configKey)
    if (known == null) {
      const entry = configOf().storageBuckets?.[configKey]
      if (entry == null) {
        throw new FilePropertyError(`storage-config:${configKey}`)
      }
      known = createS3Bucket(entry, options.bucketOptions)
      buckets.set(configKey, known)
    }
    return known
  }

  const workspace = memoHelper.once(() => createWorkspace(configOf().fileStreams?.workspace))

  const backed = (bucketConfigKey: string, backedOptions: FileStreamsBackedOptions = {}): BackedWorkspace => {
    const key = `${bucketConfigKey}\u0000${backedOptions.prefix ?? ''}`
    let known = backedWorkspaces.get(key)
    if (known == null) {
      known = createBackedWorkspace({ workspace: workspace(), bucket: bucket(bucketConfigKey), prefix: backedOptions.prefix, transfer: transfer() })
      backedWorkspaces.set(key, known)
    }
    return known
  }

  const service: FileStreamsService = createService<FileStreamsService>(alias, {
    http, bucket, transfer, inspector, archives, workspace, backed,
  })

  return service
}

/** Registers the file-streams service on a context. */
export const appendFileStreamsService = <C extends BasicConfig, T extends BasicContext<C>>(
  ctx: T, alias: string = FILE_STREAMS_SERVICE, options?: FileStreamsServiceOptions
): T => {
  ctx.registerService(createFileStreamsService(alias, options))
  return ctx
}
