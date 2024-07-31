
import { useToggle, useValue } from '@owlmeans/client'
import type { ModalBodyProps } from '@owlmeans/client'
import { useContext } from '@owlmeans/native-client'
import { useEffect, useId } from 'react'
import type { FC } from 'react'
import Animated, { SlideInDown, SlideOutUp } from 'react-native-reanimated'

export const Modal: FC = () => {
  const context = useContext()
  const toggle = useToggle(false)
  const id = useId()
  const Com = useValue<FC<ModalBodyProps> | undefined>(async () => {
    if (toggle.opened) {
      return context.modal().layer()?.Com
    }
  }, [toggle.opened, id])

  // Id is required here cause on hot refresh we loose context between modal and toggler
  useEffect(() => {
    context.waitForInitialized().then(() => context.modal().link(toggle))
  }, [id])

  return toggle.opened && <Animated.View entering={SlideInDown} exiting={SlideOutUp}>
    {Com != null ? <Com modal={context.modal()} /> : undefined}
  </Animated.View>
}
