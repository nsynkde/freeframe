'use client'

import { useState, useRef, useEffect, KeyboardEvent, ClipboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { api, ApiError } from '@/lib/api'
import { setTokens } from '@/lib/auth'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { VerifyCodeResponse, AuthTokens } from '@/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

type Step = 'email' | 'code' | 'password' | 'classic'

export function LoginForm() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [codeError, setCodeError] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [generalError, setGeneralError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const err = params.get('error')
    if (err) setGeneralError(err)
  }, [])

  // Classic login fields
  const [classicEmail, setClassicEmail] = useState('')
  const [classicPassword, setClassicPassword] = useState('')
  const [classicError, setClassicError] = useState('')

  const codeRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (step === 'code') {
      codeRefs.current[0]?.focus()
    }
  }, [step])

  // ─── Step 1: Send magic code ──────────────────────────────────────────────

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault()
    setEmailError('')
    setGeneralError('')

    if (!email) {
      setEmailError('Email is required')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Enter a valid email address')
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/send-magic-code', { email })
      setStep('code')
    } catch (err) {
      if (err instanceof ApiError) {
        setGeneralError(err.detail)
      } else {
        setGeneralError('Failed to send code. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  // ─── Step 2: Verify code ─────────────────────────────────────────────────

  function handleCodeChange(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const newCode = [...code]
    newCode[index] = digit
    setCode(newCode)
    setCodeError('')

    if (digit && index < 5) {
      codeRefs.current[index + 1]?.focus()
    }

    // Auto-submit when all digits filled
    if (digit && index === 5) {
      const fullCode = [...newCode].join('')
      if (fullCode.length === 6) {
        submitCode(fullCode)
      }
    }
  }

  function handleCodeKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      codeRefs.current[index - 1]?.focus()
    }
  }

  function handleCodePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length > 0) {
      const newCode = Array.from({ length: 6 }, (_, i) => pasted[i] || '')
      setCode(newCode)
      codeRefs.current[Math.min(pasted.length, 5)]?.focus()
      if (pasted.length === 6) {
        submitCode(pasted)
      }
    }
  }

  async function submitCode(codeStr: string) {
    setCodeError('')
    setGeneralError('')
    setLoading(true)
    try {
      const res = await api.post<VerifyCodeResponse>('/auth/verify-magic-code', {
        email,
        code: codeStr,
      })

      if (res.needs_password) {
        setStep('password')
      } else {
        setTokens(res.access_token, res.refresh_token)
        await useAuthStore.getState().fetchUser()
        const user = useAuthStore.getState().user
        router.replace('/projects')
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setCodeError(err.detail)
      } else {
        setCodeError('Invalid or expired code. Please try again.')
      }
      setCode(['', '', '', '', '', ''])
      codeRefs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault()
    const codeStr = code.join('')
    if (codeStr.length < 6) {
      setCodeError('Enter the 6-digit code')
      return
    }
    await submitCode(codeStr)
  }

  // ─── Step 3: Set password ────────────────────────────────────────────────

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError('')
    setGeneralError('')

    if (!password) {
      setPasswordError('Password is required')
      return
    }
    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters')
      return
    }
    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      const res = await api.post<AuthTokens>('/auth/set-password', {
        email,
        code: code.join(''),
        password,
      })
      setTokens(res.access_token, res.refresh_token)
      await useAuthStore.getState().fetchUser()
      const u = useAuthStore.getState().user
      router.replace('/projects')
    } catch (err) {
      if (err instanceof ApiError) {
        setGeneralError(err.detail)
      } else {
        setGeneralError('Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  // ─── Classic login ───────────────────────────────────────────────────────

  async function handleClassicLogin(e: React.FormEvent) {
    e.preventDefault()
    setClassicError('')

    if (!classicEmail || !classicPassword) {
      setClassicError('Email and password are required')
      return
    }

    setLoading(true)
    try {
      const res = await api.post<AuthTokens>('/auth/login', {
        email: classicEmail,
        password: classicPassword,
      })
      setTokens(res.access_token, res.refresh_token)
      await useAuthStore.getState().fetchUser()
      const u = useAuthStore.getState().user
      router.replace('/projects')
    } catch (err) {
      if (err instanceof ApiError) {
        setClassicError(err.detail)
      } else {
        setClassicError('Invalid email or password')
      }
    } finally {
      setLoading(false)
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  if (step === 'classic') {
    return (
      <div className="animate-slide-up">
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-text-primary mb-1">Sign in with password</h1>
          <p className="text-sm text-text-secondary">Enter your email and password to continue.</p>
        </div>

        <form onSubmit={handleClassicLogin} className="flex flex-col gap-4">
          {classicError && (
            <div className="rounded-md border border-status-error/30 bg-status-error/10 px-3 py-2.5 text-sm text-status-error">
              {classicError}
            </div>
          )}

          <Input
            label="Email address"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={classicEmail}
            onChange={(e) => setClassicEmail(e.target.value)}
          />

          <Input
            label="Password"
            type="password"
            placeholder="Your password"
            autoComplete="current-password"
            value={classicPassword}
            onChange={(e) => setClassicPassword(e.target.value)}
          />

          <Button type="submit" size="lg" loading={loading} className="mt-2 w-full">
            Sign in
          </Button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => { setStep('email'); setClassicError('') }}
            className="text-sm text-text-tertiary hover:text-text-secondary transition-colors"
          >
            Back to magic link
          </button>
        </div>
      </div>
    )
  }

  if (step === 'password') {
    return (
      <div className="animate-slide-up">
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-text-primary mb-1">Create your password</h1>
          <p className="text-sm text-text-secondary">
            Set a password to secure your account going forward.
          </p>
        </div>

        <form onSubmit={handleSetPassword} className="flex flex-col gap-4">
          {generalError && (
            <div className="rounded-md border border-status-error/30 bg-status-error/10 px-3 py-2.5 text-sm text-status-error">
              {generalError}
            </div>
          )}

          <Input
            label="Password"
            type="password"
            placeholder="Min. 8 characters"
            autoComplete="new-password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setPasswordError('') }}
            error={passwordError}
          />

          <Input
            label="Confirm password"
            type="password"
            placeholder="Repeat password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />

          <Button type="submit" size="lg" loading={loading} className="mt-2 w-full">
            Set password &amp; continue
          </Button>
        </form>
      </div>
    )
  }

  if (step === 'code') {
    return (
      <div className="animate-slide-up">
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-text-primary mb-1">Check your email</h1>
          <p className="text-sm text-text-secondary">
            We sent a 6-digit code to{' '}
            <span className="text-text-primary font-medium">{email}</span>
          </p>
        </div>

        <form onSubmit={handleVerifyCode} className="flex flex-col gap-6">
          {/* 6-digit code inputs */}
          <div className="flex gap-2 justify-between">
            {code.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { codeRefs.current[i] = el }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleCodeChange(i, e.target.value)}
                onKeyDown={(e) => handleCodeKeyDown(i, e)}
                onPaste={handleCodePaste}
                className={cn(
                  'h-12 w-full max-w-[48px] rounded-md border bg-bg-secondary text-center text-lg font-semibold text-text-primary',
                  'transition-colors focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus',
                  codeError ? 'border-status-error' : 'border-border',
                )}
              />
            ))}
          </div>

          {codeError && (
            <p className="text-sm text-status-error -mt-3">{codeError}</p>
          )}

          <Button type="submit" size="lg" loading={loading} className="w-full">
            Verify code
          </Button>
        </form>

        <div className="mt-6 text-center space-y-2">
          <button
            type="button"
            onClick={() => { setStep('email'); setCode(['', '', '', '', '', '']); setCodeError('') }}
            className="block w-full text-sm text-text-tertiary hover:text-text-secondary transition-colors"
          >
            Use a different email
          </button>
        </div>
      </div>
    )
  }

  // Step 1: Email
  return (
    <div className="animate-slide-up">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-text-primary mb-1">Sign in to FreeFrame</h1>
        <p className="text-sm text-text-secondary">
          Enter your email and we&apos;ll send you a sign-in code.
        </p>
      </div>

      <form onSubmit={handleSendCode} className="flex flex-col gap-4">
        {generalError && (
          <div className="rounded-md border border-status-error/30 bg-status-error/10 px-3 py-2.5 text-sm text-status-error">
            {generalError}
          </div>
        )}

        <Input
          label="Email address"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setEmailError('') }}
          error={emailError}
        />

        <Button type="submit" size="lg" loading={loading} className="mt-2 w-full">
          Send magic code
        </Button>
      </form>

      <div className="relative my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-text-tertiary">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <a
        href={`${API_URL}/auth/google`}
        className={cn(
          'flex w-full items-center justify-center gap-2.5 rounded-md border border-border bg-bg-secondary px-4 py-2.5',
          'text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary',
        )}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
          <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
          <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
          <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
        </svg>
        Continue with Google
      </a>

      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={() => { setStep('classic'); setGeneralError('') }}
          className="text-sm text-text-tertiary hover:text-text-secondary transition-colors"
        >
          Sign in with password instead
        </button>
      </div>
    </div>
  )
}
