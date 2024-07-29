
import { useCallback, type FC, type PropsWithChildren } from 'react'
import type { PermissionRequestProps } from './types.js'
import { View, StyleSheet } from 'react-native'
import { IconButton, useTheme } from 'react-native-paper'
import { PanelContext } from '@owlmeans/client-panel'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button } from '../button.js'
import { useContext } from '@owlmeans/native-client'

export const PermissionRequest: FC<PropsWithChildren<PermissionRequestProps>> = ({
  children, permission, margins, bottom, modal,
  hs = 5, vs = 5,
  buttonColor = 'background',
  buttonTextColor = 'primary',
  buttonVariant = 'titleLarge'
}) => {
  const theme = useTheme()
  const context = useContext()
  const insets = useSafeAreaInsets()

  const request = useCallback(() => {
    context.permissions().request(permission).then(granted => {
      if (granted) {
        modal?.response(granted)
      }
    })
  }, [])

  return <View style={{
    backgroundColor: theme.colors.primaryContainer,
    height: '100%', paddingTop: insets.top
  }}>
    <PanelContext ns="lib" resource="permission" prefix={permission}>
      <View style={styles.container} >
        <View style={styles.actions}>
          <IconButton icon="close" onPress={modal?.cancel} />
        </View>
        <View style={styles.infoGroup}>
          {children}
        </View>
        <View style={{
          marginHorizontal: margins ?? (hs * 2),
          marginBottom: bottom ?? (vs * 24)
        }}>
          <Button onPress={request} name="proceed"
            textVariant={buttonVariant} color={buttonColor} textColor={buttonTextColor} />
        </View>
      </View>
    </PanelContext>
  </View>
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end'
  },
  container: {
    height: '100%',
    justifyContent: 'space-between',
    alignContent: 'center',
  },
  infoGroup: {
    height: '70%',
    justifyContent: 'center',
    alignItems: 'center'
  }
})
