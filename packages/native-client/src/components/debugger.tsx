import { useEffect, useMemo } from 'react'
import type { FC } from 'react'
import type { ModalBodyProps } from '@owlmeans/client'
import { useValue } from '@owlmeans/client'
import { FlatList, Button, SafeAreaView, View, Platform, StyleSheet } from 'react-native'
import { DebuggerProps } from './types'
import { useContext } from '../context.js'

const DebuggerMenu: FC<ModalBodyProps> = () => {
  const context = useContext()

  const items = useMemo(() => context.debug()?.items ?? [], [context.debug()?.items.length])
  return <SafeAreaView style={styles.container}>
    <View style={styles.content}>
      <FlatList data={items} renderItem={
        ({ item }) => <Button title={item.title}
          onPress={() => context.debug()?.select(item.alias)} />
      } keyExtractor={item => item.alias} />
    </View>
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

  return allowed ? <Button title="Debugger" onPress={() => context.debug()?.open()} /> : undefined
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    height: '100%',
    paddingTop: Platform.OS !== 'ios' ? '20%' : 0
  },
  content: {
    height: '100%',
  }
})