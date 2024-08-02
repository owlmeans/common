import type { DbConfig } from '@owlmeans/config'
import { MongoServerError } from 'mongodb'
import type { MongoClient } from 'mongodb'
import type { MongoMeta } from '../types.js'
import { DEF_REPLSET } from '../consts.js'
import { port } from './config.js'

export const setUpCluster = async (client: MongoClient, config: DbConfig): Promise<boolean> => {
  const meta: MongoMeta | undefined = config.meta
  const hosts = config.host as string[]

  console.log('mongo: try to set up cluster...')
  await client.connect()
  console.log('...conntected')
  const admin = client.db('admin').admin()

  try {
    const result = await admin.replSetGetStatus()
    console.log('replicaset status: ', result.ok)

    // Replicaset can be missconfigured after server restarts
    const { config: currentConfig } = await admin.command({ replSetGetConfig: 1 })

    console.log('REPLICASET CONFIG', JSON.stringify(currentConfig, null, 2))

    if (hosts.some(host => {
      const _host = port(host, { ...config, port: config.port ?? 27017 })
      if (currentConfig.members.some((member: { host: string }) => member.host === _host)) {
        return false
      }
      console.log('NO MATCHING HOST', _host)
      
      return true
    })) {
      console.log('Some host is missconfigured...')
      const error = new MongoServerError({})
      error.codeName = 'InvalidReplicaSetConfig'
      throw error
    }

    return true
  } catch (e) {
    try {
      if (e instanceof MongoServerError && 'NotYetInitialized' === e.codeName) {
        // INITIALIZE REPLICASET
        const outcome = await admin.command({
          replSetInitiate: {
            _id: meta?.replicaSet ?? DEF_REPLSET,
            members: hosts.map((host, index) => ({ _id: index, host: port(host, config) }))
          }
        })
        console.log('replicaset intialization outcome: ', outcome.ok)
      } else if (e instanceof MongoServerError && e.codeName === 'InvalidReplicaSetConfig') {
        // FIX REPLICASET IF NODES CHANGED THEIR ADDRESSES

        const { config: currentConfig } = await admin.command({ replSetGetConfig: 1 })
        currentConfig.version++

        currentConfig.members = hosts.map((host, index) => ({
          ...currentConfig.members[index], _id: index, host: port(host, config)
        }))

        const outcome = await admin.command({ replSetReconfig: currentConfig, force: true })
        console.log('replicaset re-intialization outcome: ', outcome.ok)
      } else {
        throw e
      }
    } catch (e) {
      if (e instanceof MongoServerError && e.codeName === 'ConfigurationInProgress') {
        console.log('configuring...')
        // @TODO 2 seconds can't be enough
        await new Promise(resolve => setTimeout(resolve, 2000))
      } else {
        throw e
      }
    }

    return false
  }
}
