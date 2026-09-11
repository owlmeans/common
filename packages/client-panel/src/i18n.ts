import { addI18nLib } from '@owlmeans/i18n'

const buttons = {
  en: { buttons: { submit: 'Submit' } },
  pl: { buttons: { submit: 'Wyślij' } },
  ru: { buttons: { submit: 'Отправить' } },
  be: { buttons: { submit: 'Адправіць' } },
  uk: { buttons: { submit: 'Надіслати' } },
  es: { buttons: { submit: 'Enviar' } },
  de: { buttons: { submit: 'Senden' } },
} as const

for (const [language, values] of Object.entries(buttons)) {
  addI18nLib(language, 'client-panel', values)
}
