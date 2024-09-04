
import type { FC } from 'react'
import type { ListProps } from './types.js'

import Animated, { Easing, LinearTransition, SlideInUp } from 'react-native-reanimated'
// import { FlatList } from 'react-native'

export const List: FC<ListProps> = ({ items, renderer: Renderer, onClick }) =>
  <Animated.FlatList data={items} renderItem={({ item, index }) => <Renderer key={index} data={item} onClick={onClick} />}
    itemLayoutAnimation={LinearTransition} entering={SlideInUp.delay(100).easing(Easing.elastic())} />
