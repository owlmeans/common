import type { DbConfig } from '@owlmeans/resource'
import { Cluster } from 'ioredis'
import type { Redis } from 'ioredis'
import { prepareClusterRedisOptions } from './config'
import { createClient } from './instance.js'
import type { RedisMeta } from '../types.js'

export const ensuerCluster = async (config: DbConfig<RedisMeta>): Promise<Cluster> => {
  if (!Array.isArray(config.host)) {
    throw new SyntaxError('We may connect to redis cluster only knowing its nodes')
  }
  const setup = prepareClusterRedisOptions(config)
  // 1. Create single clients for testing
  const clients = await Promise.all(setup.nodes.map(
    async node => {
      if (typeof node !== 'object') {
        throw new SyntaxError('Cluster node must be an object after cluster options initialization')
      }
      if (node.host == null) {
        throw new SyntaxError('Cluster node must have a host property after cluster options initialization')
      }
      const client = await createClient({ ...config, host: node.host }) as Redis

      return client
    }
  ))

  // 2. Test clients and ensure they are configured

  try {
    const masters: ClusterNode[] = []
    const slaves: ClusterNode[] = []
    const masterQty = config.meta?.masterNumber
      ?? Math.round(clients.length / (1 + (config.meta?.slaveNumber ?? 2)))
    const slaveQty = config.meta?.slaveNumber ??
      Math.round((clients.length - masterQty) / masterQty)
    const requiredNodes = (slaveQty + 1) * masterQty

    if (requiredNodes !== clients.length) {
      throw new SyntaxError(`Number of nodes in redis cluster does not match the configuration requirements: ${clients.length} / ${requiredNodes}`)
    }

    for (const client of clients) {
      let nodesInfo: string = await client.cluster('NODES') as string
      let nodes = parseClusterNodeInfo(nodesInfo)
      // Remove nodes that we don't nkow
      for (const node of nodes) {
        // We do not remove ourselves
        if (node.flags.includes('myself')) {
          continue;
        }
        if (!config.host.includes(node.addr)) {
          await client.cluster('FORGET', node.nodeId)
        }
      }
      const otherNodes = nodes.filter(node => !node.flags.includes('myself'))
      // Add nodes that are missing
      for (const host of config.host) {
        if (!otherNodes.some(node => node.addr === host)) {
          await client.cluster('MEET', host, config.port ?? 6379)
        }
      }
      client.disconnect(true)
      nodesInfo = await client.cluster('NODES') as string
      nodes = parseClusterNodeInfo(nodesInfo)
      const myself = nodes.find(node => node.flags.includes('myself')) as NodeInfo
      if (myself == null) {
        throw new SyntaxError('Cluster node does not contain information about itself')
      }
      if (myself.flags.includes('master')) {
        masters.push({ info: myself, node: client })
      } else {
        slaves.push({ info: myself, node: client })
      }
    }

    await Promise.all(clients.map(client => client.disconnect(true)))

    const realMasters = masters.filter(master => master.info.slots != null)
    const newcommers = masters.filter(master => master.info.slots == null)

    const slotsChunk = Math.floor(16384 / masterQty)
    const slotsSurplus = 16384 % masterQty

    const resetNode = async (node: ClusterNode, flush: boolean = false) => {
      flush && await node.node.flushall()
      await node.node.cluster('RESET')
      node.info.slots = null
      node.info.master = '-'

      newcommers.push(node)
    }

    const configureMaster = async (node: ClusterNode, idx: number) => {
      const chunk = idx + 1 == masterQty ? slotsChunk + slotsSurplus : slotsChunk
      const firstSlot = idx * slotsChunk
      const lastSlot = firstSlot + chunk - 1
      await node.node.flushall()
      await node.node.cluster('RESET')
      await node.node.cluster('ADDSLOTSRANGE', firstSlot, lastSlot)
      node.info.slots = [[firstSlot, lastSlot]]
      const nodeSlaves = slaves.filter(slave => slave.info.master === node.info.nodeId)
      while (nodeSlaves.length > slaveQty) {
        const slave = nodeSlaves.pop()
        if (slave == null) {
          throw new SyntaxError('Not enough slaves to forget in redis cluster')
        }
        slaves.splice(slaves.indexOf(slave), 1)
        await resetNode(slave)
      }
    }

    if (realMasters.length === 0) {
      for (let i = 0; i < masterQty; ++i) {
        const newcommer = newcommers.shift()
        if (newcommer == null) {
          throw new SyntaxError('(clean) Not enough nodes to add to redis cluster as master')
        }
        await configureMaster(newcommer, i)
        realMasters.push(newcommer)
      }
    } else if (realMasters.length !== masterQty) {
      while (realMasters.length > masterQty) {
        const renegade = realMasters.pop()
        if (renegade == null) {
          throw new SyntaxError('Not enough nodes to forget in redis cluster')
        }
        const renegadeSlaves = slaves.filter(slave => slave.info.master === renegade.info.nodeId)
        for (const slave of renegadeSlaves) {
          slaves.splice(slaves.indexOf(slave), 1)
          await resetNode(slave)
        }
        await resetNode(renegade, true)
      }
      while (realMasters.length < masterQty) {
        const newcommer = newcommers.shift()
        if (newcommer == null) {
          throw new SyntaxError('(dirty) Not enough nodes to add to redis cluster as master')
        }
        realMasters.push(newcommer)
      }
      for (let i = 0; i < masterQty; ++i) {
        await configureMaster(realMasters[i], i)
      }
    }
    if (slaves.length !== slaveQty * masterQty) {
      for (let master of realMasters) {
        const masterSlaves = slaves.filter(slave => slave.info.master === master.info.nodeId)
        while (masterSlaves.length > slaveQty) {
          const slave = masterSlaves.pop()
          if (slave == null) {
            throw new SyntaxError('Not enough slaves to forget in redis cluster')
          }
          slaves.splice(slaves.indexOf(slave), 1)
          await resetNode(slave)
        }
        while (masterSlaves.length < slaveQty) {
          const newcommer = newcommers.shift()
          if (newcommer == null) {
            throw new SyntaxError('Not enough slaves to add to redis cluster')
          }
          newcommer.info.master = master.info.nodeId

          await newcommer.node.cluster('REPLICATE', master.info.nodeId)
          masterSlaves.push(newcommer)
          slaves.push(newcommer)
        }
      }
    }
    if (newcommers.length !== 0) {
      throw new SyntaxError('There are nodes that are not configured in redis cluster')
    }
    if (realMasters.length !== masterQty) {
      throw new SyntaxError('Not enough master nodes in redis cluster after configuration')
    }
    if (slaves.length !== slaveQty * masterQty) {
      throw new SyntaxError('Not enough slave nodes in redis cluster after configuration')
    }
  } catch (e) {
    console.error(e)
    throw e
  }

  // 3. Disconnect single clients

  await Promise.all(clients.map(client => client.disconnect()))

  // 4. Connect to cluster

  return new Cluster(setup.nodes, setup.options)
}

const parseClusterNodeInfo = (clusterNodes: string) => {
  const nodesInfo = clusterNodes.split('\n').filter(line => line.trim() !== '')
  return nodesInfo.map(line => {
    const [nodeId, addr, flags, master, , , , state, ...slots] = line.split(' ')
    return {
      nodeId,
      addr: addr.trim().split(':')[0],
      flags: flags.trim().split(','),
      master,
      state,
      slots: slots != null && slots.length > 0 ? slots.map(
        slot => (slot.includes('-') ? slot.split('-', 2) : [slot, slot]).map(v => parseInt(v))
      ) : null
    }
  })
}

type NodeInfo = ReturnType<typeof parseClusterNodeInfo>[0]

interface ClusterNode {
  node: Redis
  info: NodeInfo
}
