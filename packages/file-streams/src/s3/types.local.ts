import type { S3Client } from '@aws-sdk/client-s3'
import type { Readable } from 'node:stream'
import type { StorageBucketModel } from '@owlmeans/storage-resource'
import type { SignalOptions } from '../types.js'
import type { S3ListedObject } from './types.js'

/** What the bucket's parts share. */
export interface S3Core {
  readonly model: StorageBucketModel
  client: () => S3Client
  keyOf: (prefix: string) => string
  location: (key: string) => string
  partSize: number
  concurrency: number
}

export interface S3UploadRequest {
  key: string
  stream: Readable
  contentType: string
  disposition: string
  cacheControl?: string
  metadata?: Record<string, string>
  signal?: AbortSignal
}

export interface S3UploadResult {
  bytes: number
  etag?: string
}

export interface S3Uploader {
  /** One object from a stream of unknown length. */
  upload: (request: S3UploadRequest) => Promise<S3UploadResult>
}

export interface S3PrefixOps {
  list: (prefix: string, options?: SignalOptions) => Promise<S3ListedObject[]>
  removePrefix: (prefix: string, options?: SignalOptions) => Promise<number>
}

/** The part of an SDK build-step handler's arguments the Content-MD5 middleware touches. */
export interface S3BuildArgs {
  request: unknown
}

export interface S3BuildHandler {
  (args: S3BuildArgs): Promise<unknown>
}
