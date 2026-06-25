'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { setTokens } from '@/lib/auth'
import { useAuthStore } from '@/stores/auth-store'

const ERROR_MESSAGES: Record<string, string> = {
  oauth_cancelled: 'Sign-in was cancelled.',
  domain_not_allowed: 'Only company accounts are allowed.',
  account_deactivated: 'Your account has been deactivated.',
  oauth_failed: 'Google sign-in failed. Please try again.',
  invalid_state: 'Invalid sign-in state. Please try again.',
}

export default function OAuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const accessToken = hash.get('access_token')
    const refreshToken = hash.get('refresh_token')

    if (accessToken && refreshToken) {
      setTokens(accessToken, refreshToken)
      useAuthStore.getState().fetchUser().then(() => {
        router.replace('/projects')
      })
      return
    }

    // Error case — params come as query string from API redirects
    const params = new URLSearchParams(window.location.search)
    const error = params.get('error')
    const msg = error ? (ERROR_MESSAGES[error] ?? 'Sign-in failed.') : 'Sign-in failed.'
    router.replace(`/login?error=${encodeURIComponent(msg)}`)
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-text-secondary text-sm">Signing you in…</p>
    </div>
  )
}
