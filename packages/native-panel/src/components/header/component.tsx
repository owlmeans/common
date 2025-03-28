import type { FC } from 'react'
import { Appbar } from 'react-native-paper'
import type { HeaderProps } from './types.js'
import { useLayoutTitle } from '@owlmeans/client-panel'

export const Header: FC<HeaderProps> = ({ name, close }) => {
  const title = useLayoutTitle(name)
  return <Appbar.Header mode="center-aligned" elevated>
    <Appbar.Content title={`${title}`} />
    {close != null ? <Appbar.Action icon="close" onPress={close} /> : undefined}
  </Appbar.Header>
}
