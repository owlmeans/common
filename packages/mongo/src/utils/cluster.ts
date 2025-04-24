import type { MongoClient } from 'mongodb'
import type { MongoMeta } from '../types.js'
import type { DbConfig } from '@owlmeans/resource'

import { MongoServerError } from 'mongodb'
import { DEF_REPLSET } from '../consts.js'
import { port } from './config.js'

export const setUpCluster = async (client: MongoClient, config: DbConfig): Promise<boolean> => {
  const meta: MongoMeta | undefined = config.meta
  const hosts = config.host as string[]

  await client.connect()
  const admin = client.db('admin').admin()

  try {
    await admin.replSetGetStatus()
    // Replicaset can be missconfigured after server restarts
    const { config: currentConfig } = await admin.command({ replSetGetConfig: 1 })

    if (hosts.some(host => {
      const _host = port(host, { ...config, port: config.port ?? 27017 })
      if (currentConfig.members.some((member: { host: string }) => member.host === _host)) {
        return false
      }

      return true
    })) {
      const error = new MongoServerError({})
      error.codeName = 'InvalidReplicaSetConfig'
      throw error
    }

    return true
  } catch (e) {
    try {
      if (e instanceof MongoServerError && 'NotYetInitialized' === e.codeName) {
        // INITIALIZE REPLICASET
        await admin.command({
          replSetInitiate: {
            _id: meta?.replicaSet ?? DEF_REPLSET,
            members: hosts.map((host, index) => ({ _id: index, host: port(host, config) }))
          }
        })
      } else if (e instanceof MongoServerError && e.codeName === 'InvalidReplicaSetConfig') {
        // FIX REPLICASET IF NODES CHANGED THEIR ADDRESSES

        const { config: currentConfig } = await admin.command({ replSetGetConfig: 1 })
        currentConfig.version++

        currentConfig.members = hosts.map((host, index) => ({
          ...currentConfig.members[index], _id: index, host: port(host, config)
        }))

        await admin.command({ replSetReconfig: currentConfig, force: true })
      } else {
        throw e
      }
    } catch (e) {
      if (e instanceof MongoServerError && e.codeName === 'ConfigurationInProgress') {
        // @TODO 2 seconds can't be enough
        await new Promise(resolve => setTimeout(resolve, 2000))
      } else {
        throw e
      }
    }

    return false
  }
}
