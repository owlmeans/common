import type { InitializedService } from '@owlmeans/context'
import type { ArchiveHelper, ArchiveLimits } from '../archive/types.js'
import type { HttpClient } from '../http/types.js'
import type { FileInspector, FileInspectorOptions } from '../inspector/types.js'
import type { AddressResolver, NetworkPolicyOptions } from '../network/types.js'
import type { ProxyCredentialsProvider, ProxyPlugin, ProxyRouterOptions, ProxyStrategy } from '../proxy/types.js'
import type { UrlResolver } from '../resolvers/types.js'
import type { S3Bucket, S3BucketOptions } from '../s3/types.js'
import type { TransferHelper, TransferLimits } from '../transfer/types.js'

/** A proxy in config; string leaves may be secret files (`/etc/…`), which server contexts resolve. */
export interface FileStreamsProxyConfig {
  /** `http://host:3128`, `socks5h://host:1080`. */
  url: string
  username?: string
  password?: string
  id?: string
}

/** `cfg.fileStreams`. */
export interface FileStreamsConfig {
  limits?: Partial<TransferLimits>
  network?: Omit<NetworkPolicyOptions, 'resolver'>
  proxies?: FileStreamsProxyConfig[]
  proxyStrategy?: ProxyStrategy
  userAgent?: string
}

export interface FileStreamsConfigAppend {
  fileStreams?: FileStreamsConfig
}

/** What config cannot carry: callbacks and plugins. */
export interface FileStreamsServiceOptions {
  /** Replaces `cfg.fileStreams.proxies` — a list or a provider by key and URL. */
  proxies?: ProxyRouterOptions['proxies']
  proxyCredentials?: ProxyCredentialsProvider
  proxyPlugins?: ProxyPlugin[]
  resolvers?: UrlResolver[]
  resolver?: AddressResolver
  bucketOptions?: S3BucketOptions
  inspector?: FileInspectorOptions
  archiveLimits?: Partial<ArchiveLimits>
}

/** The package's objects configured from the context. */
export interface FileStreamsService extends InitializedService {
  http: () => HttpClient
  /** The bucket of a `cfg.storageBuckets` entry, addressed as storage-resource addresses it. */
  bucket: (configKey: string) => S3Bucket
  transfer: () => TransferHelper
  inspector: () => FileInspector
  archives: () => ArchiveHelper
}
