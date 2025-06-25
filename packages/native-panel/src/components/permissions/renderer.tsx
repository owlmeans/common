import type { FC, PropsWithChildren } from 'react'
import { useMemo } from 'react'
import { View, StyleSheet, Platform } from 'react-native'
import type { PermissionRendererProps } from './types.js'
import { IconButton, useTheme } from 'react-native-paper'
import { PanelContext } from '@owlmeans/client-panel'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button } from '../button.js'

export const PermissionRequestRenderer: FC<PropsWithChildren<PermissionRendererProps>> = ({
  children, permission, margins, bottom, cancel, request,
  hs = 5, vs = 5,
  buttonColor = 'background',
  buttonTextColor = 'primary',
  buttonVariant = 'titleLarge',
  explicitCancel, resource = 'permission', ns = 'lib'
}) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const showCancel = useMemo(() => !!cancel && Platform.OS !== 'ios', [!!cancel])

  return <View style={{
    backgroundColor: theme.colors.primaryContainer,
    height: '100%', paddingTop: insets.top
  }}>
    <PanelContext ns={ns} resource={resource} prefix={permission}>
      <View style={styles.container}>
        {showCancel && <View style={styles.actions}>
          <IconButton icon="close" onPress={cancel} />
        </View>}
        <View style={styles.infoGroup}>
          {children}
        </View>
        <View style={{
          marginHorizontal: margins ?? (hs * 2),
          marginBottom: bottom ?? (vs * 24)
        }}>
          <Button onPress={request} name="proceed"
            textVariant={buttonVariant} color={buttonColor} textColor={buttonTextColor} />
          {explicitCancel && <View style={{ marginTop: vs * 4 }}>
            <Button onPress={cancel} name="cancel" variant="outlined"
              textVariant={buttonVariant} color={buttonTextColor} textColor={buttonColor} />
          </View>}
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
