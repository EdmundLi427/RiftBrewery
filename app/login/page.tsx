'use client'

import Link from 'next/link';
import { useActionState } from 'react';
import { authenticate } from './actions';

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(authenticate, null);

  return (
    <main className="min-h-screen bg-slate-50 grid lg:grid-cols-2">
      {/* Brand panel — desktop only */}
      <aside className="hidden lg:flex flex-col justify-between bg-slate-900 text-slate-100 p-12">
        <div>
          <Link href="/" className="text-lg font-semibold tracking-tight">
            RiftBrewery
          </Link>
        </div>
        <div className="space-y-3">
          <p className="text-2xl font-medium leading-snug max-w-sm">
            Build, refine, and share your Riftbound decks.
          </p>
          <p className="text-sm text-slate-400 max-w-sm">
            A clean, fast deck-builder backed by the full Riftcodex catalogue.
          </p>
        </div>
        <p className="text-xs text-slate-500">
          &copy; {new Date().getFullYear()} RiftBrewery
        </p>
      </aside>

      {/* Form panel */}
      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          {/* Mobile-only wordmark */}
          <Link
            href="/"
            className="lg:hidden block text-center text-lg font-semibold tracking-tight text-slate-900 mb-8"
          >
            RiftBrewery
          </Link>

          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
              Sign in
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Welcome back. Enter your details to continue.
            </p>
          </div>

          <form action={formAction} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-700"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              />
            </div>

            {state?.message && (
              <div
                role="alert"
                className="rounded-md border-l-2 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-800"
              >
                {state.message}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="w-full h-10 rounded-md bg-slate-900 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isPending ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Don&apos;t have an account?{' '}
            <Link
              href="/create-account"
              className="font-medium text-slate-900 hover:underline underline-offset-4"
            >
              Create one
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
