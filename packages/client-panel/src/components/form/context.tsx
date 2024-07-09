import type { FC, PropsWithChildren } from 'react'
import { createContext, useContext } from 'react'
import type { FormProps, TFormContext } from './types.js'

const FormContext_ = createContext<Omit<FormProps, "defaults">>({})

export const FormContext: FC<PropsWithChildren<TFormContext>> = (props) => <FormContext_.Provider value={props}>
  {props.children}
</FormContext_.Provider>

export const useClientFormContext = () => useContext<TFormContext>(FormContext_)
