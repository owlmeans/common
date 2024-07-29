
import { useToggle, useValue } from '@owlmeans/client'
import type { ModalBodyProps } from '@owlmeans/client'
import { useContext } from '@owlmeans/native-client'
import { useEffect } from 'react'
import type { FC } from 'react'
import { Modal as RNModal } from 'react-native'

export const Modal: FC = () => {
  const context = useContext()
  const toggle = useToggle(false)
  const Com = useValue<FC<ModalBodyProps> | undefined>(async () => {
    if (toggle.opened) {
      return context.modal().layer()?.Com
    }
  }, [toggle.opened])

  useEffect(() => {
    context.waitForInitialized().then(() => context.modal().link(toggle))
  }, [])

  return <RNModal visible={toggle.opened && Com != null}
    transparent animationType="slide"
    onRequestClose={() => context.modal().cancel()}
    onDismiss={() => context.modal().cancel()}>
    {Com != null ? <Com modal={context.modal()} /> : undefined}
  </RNModal>
}
