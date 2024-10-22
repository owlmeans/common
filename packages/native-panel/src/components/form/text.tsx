import type { FC } from 'react'
import { useFormContext, Controller } from 'react-hook-form'
import { TextInputProps } from './types.js'

import { useFormError, useFormI18n } from '@owlmeans/client-panel'
import { useClientFormContext } from '@owlmeans/client-panel'

import { HelperText, TextInput as TextField } from 'react-native-paper'
import { useColors } from '../helper.js'
// import { Text } from '../text.js'

export const TextInput: FC<TextInputProps> = ({ name, label, placeholder, hint, def }) => {
  const { control } = useFormContext()
  const t = useFormI18n()
  const key = name
  if (typeof label === 'boolean' && label) {
    label = t(`${key}.label`)
  } else {
    label = undefined
  }
  if (typeof placeholder === 'boolean' && placeholder) {
    placeholder = t(`${key}.placeholder`)
  } else {
    placeholder = undefined
  }
  if (typeof hint === 'boolean' && hint) {
    hint = t(`${key}.hint`)
  } else {
    hint = undefined
  }

  const colors = useColors({ primary: 'inversePrimary', error: 'errorContainer' })

  return <Controller control={control} name={name} defaultValue={def} render={
    ({ field, fieldState }) => {
      const error = useFormError(name, fieldState.error)
      const { loader } = useClientFormContext()

      return <>
        <TextField value={field.value} onChangeText={field.onChange} onBlur={field.onBlur}
          theme={{ colors: { primary: colors.primary, error: colors.error } }}
          error={fieldState.error != null}
          disabled={loader != null && loader.opened === true}
          label={label}
          placeholder={placeholder}
        />
        <HelperText visible={!!(error || hint)} type={error ? 'error' : 'info'}
          theme={{ colors: { error: colors.error } }}>{error ?? hint}</HelperText>
        {/* {(error || hint) && <Text variant="labelSmall" color={error ? 'error' : 'primary'}>{error ?? hint}</Text>} */}
      </>
    }
  } />
}
