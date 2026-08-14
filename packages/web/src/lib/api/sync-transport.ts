import type { SyncTransport } from '@magic/cards'
import type { SyncPullResponse, SyncPush, SyncPushResponse } from '@magic/shared'
import { ApiError, apiFetch } from './http.js'

/** El transporte real del motor de sincronización, contra la API. */
export const httpTransport: SyncTransport = {
  push(body: SyncPush) {
    return apiFetch<SyncPushResponse>('/v1/sync/push', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  pull(since: number) {
    return apiFetch<SyncPullResponse>(`/v1/sync/pull?since=${since}`)
  },

  async uploadArt(id: string, blob: Blob) {
    await apiFetch(`/v1/art/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': blob.type || 'image/png' },
      body: blob,
    })
  },

  async downloadArt(id: string) {
    const response = await fetch(`/v1/art/${id}`, { credentials: 'include' })
    // Una imagen que el servidor no tiene no es un fallo: puede que se subiera
    // desde otro dispositivo que aún no ha sincronizado.
    if (response.status === 404) return undefined
    if (!response.ok) throw new ApiError(response.status, response.statusText)
    return response.blob()
  },
}

export interface ArtUsage {
  used: number
  limit: number
  maxPerImage: number
}

export function fetchArtUsage(): Promise<ArtUsage> {
  return apiFetch<ArtUsage>('/v1/art/usage')
}
