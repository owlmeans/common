
import type { FC } from 'react'
import type { PermissionRequestProps } from './types.js'
import { PermissionRequest } from './request.js'
import { View, StyleSheet } from 'react-native'
import { Icon } from 'react-native-paper'
import { Text } from '../text.js'

export const CameraPermissionRequest: FC<PermissionRequestProps> = (props) => {
  const { vs = 5, hs = 5 } = props

  const style = styles(vs, hs)
  return <PermissionRequest {...props}>
    <View style={style.container}>
      <View style={style.pictures}>
        {props.picture != null ? props.picture
          : <>
            <Icon source="camera" size={vs * 16} />
            <Icon source="qrcode-scan" size={vs * 16} />
          </>}
      </View>
      <View style={style.text}>
        <Text name="title" color="onSurface" variant="headlineMedium" center />
        <Text name="description" color="onSurface" variant="bodyLarge" center
          style={style.textEntry} />
        <Text name="reason" color="onSurface" variant="headlineSmall" center
          style={style.textEntry} />
      </View>
    </View>
  </PermissionRequest>
}

const styles = (vs: number, hs: number) => StyleSheet.create({
  container: {
    marginTop: '15%',
    marginHorizontal: hs * 2,
    justifyContent: 'space-around',
    alignContent: 'center',
  },
  pictures: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center'
  },
  text: {
    marginTop: vs * 10
  },
  textEntry: {
    marginTop: vs * 2,
  }
})
