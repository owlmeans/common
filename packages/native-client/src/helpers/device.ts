import { useState, useEffect } from 'react'
import { Dimensions } from 'react-native'
import { DeviceOrientation } from './consts.js'

export const useOrientation = () => {
  const { width, height } = Dimensions.get('window')
  const [orientation, setOrientation] = useState(
    width > height ? DeviceOrientation.Horizontal : DeviceOrientation.Vertical
  )
  useEffect(() => {
    const listener = Dimensions.addEventListener(
      'change', ({ window: { width, height } }) => {
        setOrientation(width > height ? DeviceOrientation.Horizontal : DeviceOrientation.Vertical)
      }
    )

    return () => listener.remove()
  }, [width, height])

  return orientation
}
