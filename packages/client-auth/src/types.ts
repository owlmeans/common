import type { ClientResource } from '@owlmeans/client-resource'
import type { ResourceRecord } from '@owlmeans/resource'
import type { AuthService } from '@owlmeans/auth-common'

export interface AuthServiceAppend {
  auth: () => AuthService
}

export interface ClientAuthRecord extends ResourceRecord {
  token: string
  profileId?: string
}

export interface ClientAuthResource extends ClientResource<ClientAuthRecord> {
}
