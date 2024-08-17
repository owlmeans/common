
import ButtonGroup from '@mui/material/ButtonGroup'
import type { FC } from 'react'
import type { SelectorProps } from './types.js'
import { Button } from '../form/button/component.js'

export const ButtonSelector: FC<SelectorProps> = ({ name, options, current, onSelect }) => {
  const prefix = name != null ? `${name}.` : ''
  return <ButtonGroup>
    {options.map(
      option => <Button key={option} label={`${prefix}${option}`}
        onClick={() => onSelect?.(option)}
        variant={current === option ? 'contained' : 'outlined'} />
    )}
  </ButtonGroup>
}
