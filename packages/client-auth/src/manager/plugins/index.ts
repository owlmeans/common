import { AuthenticationType } from '@owlmeans/auth'
import { ed25519BasicUIPlugin } from './basic-ed25519.js'
import { reCaptchaPlugin } from './re-captcha.js'
import { tunnelConsumerUIPlugin } from './tunnel-consumer.js'
import { pluginMethodSource } from './methods.js'
import { registerMethodSource } from '../../login/methods.js'
import { plugins } from './registry.js'

export { plugins, registerAuthPlugin, getAuthPlugin, listAuthPlugins } from './registry.js'

plugins[AuthenticationType.BasicEd25519] = ed25519BasicUIPlugin
plugins[AuthenticationType.ReCaptcha] = reCaptchaPlugin
plugins[AuthenticationType.WalletConsumer] = tunnelConsumerUIPlugin

// Registered from here, not from `login/`, so that importing `@owlmeans/client-auth/login` never
// drags this module's React plugin implementations into a bundle that only wanted the login host.
// A generated application imports the login subpath through `client-iam`; it must not gain three
// authentication methods it never registered as a side effect of that.
registerMethodSource(pluginMethodSource)
