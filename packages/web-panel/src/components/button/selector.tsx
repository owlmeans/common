import type { FC } from 'react'
import type { SelectorProps } from './types.js'
import { Button } from '../form/button/component.js'

export const ButtonSelector: FC<SelectorProps> = ({ name, options, current, onSelect }) => {
  const prefix = name != null ? `${name}.` : ''
  return (
    <div className="inline-flex rounded-md shadow-xs [&>button:not(:first-child)]:rounded-l-none [&>button:not(:last-child)]:rounded-r-none [&>button:not(:last-child)]:border-r-0">
      {options.map(option =>
        <Button key={option} label={`${prefix}${option}`}
          onClick={() => onSelect?.(option)}
          variant={current === option ? 'contained' : 'outlined'} />
      )}
    </div>
  )
}
