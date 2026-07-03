'use client'

import * as React from 'react'
import useSWR, { mutate } from 'swr'
import { Key, Plus, Trash2, Copy, Check, Clock } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/stores/auth-store'
import { useRouter } from 'next/navigation'
import type { User } from '@/types'

interface ApiToken {
  id: string
  user_id: string
  name: string
  created_at: string
  last_used_at: string | null
  expires_at: string | null
}

interface CreatedToken extends ApiToken {
  token: string
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function TokenRevealDialog({ token, onClose }: { token: CreatedToken; onClose: () => void }) {
  const [copied, setCopied] = React.useState(false)

  function copy() {
    navigator.clipboard.writeText(token.token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-bg-primary border border-border p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-status-success" />
            <Dialog.Title className="text-sm font-semibold text-text-primary">
              Token created — copy it now
            </Dialog.Title>
          </div>
          <p className="text-xs text-text-secondary">
            This is the only time the token will be shown. Store it somewhere safe.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md bg-bg-secondary border border-border px-3 py-2 text-xs font-mono text-text-primary break-all select-all">
              {token.token}
            </code>
            <button
              onClick={copy}
              className="shrink-0 rounded-md border border-border bg-bg-secondary p-2 text-text-secondary hover:text-text-primary transition-colors"
            >
              {copied ? <Check className="h-4 w-4 text-status-success" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <div className="flex justify-end">
            <Button variant="primary" size="sm" onClick={onClose}>Done</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function CreateTokenDialog({ users, onCreated }: { users: User[]; onCreated: (t: CreatedToken) => void }) {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState('')
  const [userId, setUserId] = React.useState('')
  const [expiresAt, setExpiresAt] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  function reset() {
    setName('')
    setUserId('')
    setExpiresAt('')
    setError('')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !userId) return
    setLoading(true)
    setError('')
    try {
      const body: Record<string, unknown> = { name: name.trim(), user_id: userId }
      if (expiresAt) body.expires_at = new Date(expiresAt).toISOString()
      const created = await api.post<CreatedToken>('/admin/api-tokens', body)
      mutate('/admin/api-tokens')
      setOpen(false)
      reset()
      onCreated(created)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create token')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
      <Dialog.Trigger asChild>
        <Button variant="primary" size="sm">
          <Plus className="h-3.5 w-3.5" />
          New Token
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-bg-primary border border-border p-6 shadow-xl">
          <Dialog.Title className="text-sm font-semibold text-text-primary mb-4">
            Create API Token
          </Dialog.Title>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">Token name</label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Figma Widget – Production"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">Assigned user</label>
              <select
                value={userId}
                onChange={e => setUserId(e.target.value)}
                className="w-full rounded-md border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="">Select a user…</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">
                Expires <span className="text-text-tertiary">(optional — leave blank for no expiry)</span>
              </label>
              <Input
                type="date"
                value={expiresAt}
                onChange={e => setExpiresAt(e.target.value)}
              />
            </div>
            {error && <p className="text-xs text-status-error">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Dialog.Close asChild>
                <Button variant="ghost" size="sm" type="button">Cancel</Button>
              </Dialog.Close>
              <Button variant="primary" size="sm" type="submit" loading={loading} disabled={!name.trim() || !userId}>
                Create
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default function ApiTokensPage() {
  const { isSuperAdmin } = useAuthStore()
  const router = useRouter()
  const [newToken, setNewToken] = React.useState<CreatedToken | null>(null)
  const [revoking, setRevoking] = React.useState<string | null>(null)

  const { data: tokens, isLoading: tokensLoading } = useSWR<ApiToken[]>(
    isSuperAdmin ? '/admin/api-tokens' : null,
    () => api.get<ApiToken[]>('/admin/api-tokens'),
  )
  const { data: users } = useSWR<User[]>(
    isSuperAdmin ? '/admin/users' : null,
    () => api.get<User[]>('/admin/users'),
  )

  React.useEffect(() => {
    if (isSuperAdmin === false) router.replace('/settings/profile')
  }, [isSuperAdmin, router])

  async function revoke(id: string) {
    setRevoking(id)
    try {
      await api.delete(`/admin/api-tokens/${id}`)
      mutate('/admin/api-tokens')
    } finally {
      setRevoking(null)
    }
  }

  const userMap = React.useMemo(
    () => Object.fromEntries((users ?? []).map(u => [u.id, u])),
    [users],
  )

  return (
    <div className="p-6 max-w-3xl space-y-6">
      {newToken && <TokenRevealDialog token={newToken} onClose={() => setNewToken(null)} />}

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-muted">
            <Key className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-text-primary">API Tokens</h1>
            <p className="text-sm text-text-secondary">Long-lived tokens for integrations like the Figma widget.</p>
          </div>
        </div>
        <CreateTokenDialog users={users ?? []} onCreated={setNewToken} />
      </div>

      <section className="space-y-1">
        <h2 className="text-sm font-semibold text-text-primary border-b border-border pb-2">
          Active tokens
        </h2>

        {tokensLoading && (
          <p className="text-sm text-text-tertiary py-4">Loading…</p>
        )}

        {!tokensLoading && (!tokens || tokens.length === 0) && (
          <p className="text-sm text-text-tertiary py-4">No tokens yet. Create one to get started.</p>
        )}

        {tokens && tokens.length > 0 && (
          <div className="divide-y divide-border">
            {tokens.map(token => {
              const owner = userMap[token.user_id]
              const isExpired = token.expires_at && new Date(token.expires_at) < new Date()
              return (
                <div key={token.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary truncate">{token.name}</span>
                      {isExpired && (
                        <span className="shrink-0 rounded-full bg-status-error/10 px-2 py-0.5 text-2xs font-medium text-status-error">
                          Expired
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-text-tertiary">
                      <span>{owner ? `${owner.name} (${owner.email})` : token.user_id}</span>
                      <span>·</span>
                      <span>Created {formatDate(token.created_at)}</span>
                      {token.last_used_at && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Last used {formatDate(token.last_used_at)}
                          </span>
                        </>
                      )}
                      {token.expires_at && (
                        <>
                          <span>·</span>
                          <span>Expires {formatDate(token.expires_at)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => revoke(token.id)}
                    disabled={revoking === token.id}
                    className="shrink-0 rounded-md p-1.5 text-text-tertiary hover:text-status-error hover:bg-status-error/10 transition-colors disabled:opacity-50"
                    title="Revoke token"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
