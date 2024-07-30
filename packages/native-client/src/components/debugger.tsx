import { useEffect, useMemo } from 'react'
import type { FC } from 'react'
import type { ModalBodyProps } from '@owlmeans/client'
import { useValue } from '@owlmeans/client'
import { FlatList, Button, SafeAreaView } from 'react-native'
import { DebuggerProps } from './types'
import { useContext } from '../context.js'

const DebuggerMenu: FC<ModalBodyProps> = () => {
  const context = useContext()

  const items = useMemo(() => context.debug()?.items ?? [], [context.debug()?.items.length])
  return <SafeAreaView style={{ backgroundColor: '#fff', height: '100%' }}>
    <FlatList data={items} renderItem={
      ({ item }) => <Button title={item.title}
        onPress={() => context.debug()?.select(item.alias)} />
    } keyExtractor={item => item.alias} />
  </SafeAreaView>
}

export const Debugger: FC<DebuggerProps> = ({ items }) => {
  const context = useContext()
  useEffect(() => {
    context.waitForInitialized().then(async () => {
      const debug = context.debug()
      if (debug != null) {
        await debug.ready()
        debug.Debug = DebuggerMenu
        items.forEach(item => debug.addItem(item))
      }
    })
  }, [])

  return <></>
}

export const DebuggerButton: FC = () => {
  const context = useContext()
  const allowed = useValue(async () => {
    const debug = context.debug()
    return debug != null && await debug.ready()
  })

  console.log('DebuggerButton', allowed)

  return allowed ? <Button title="Debugger" onPress={() => context.debug()?.open()} /> : undefined
}
