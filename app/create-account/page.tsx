'use client'

import { useActionState } from 'react';
import { createAccount } from './actions';

export default function CreateAccountPage() {
  const [state, formAction, isPending] = useActionState(createAccount, null);

  return (
    <main className="flex items-center justify-center min-h-screen bg-gray-50">
      <form action={formAction} className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center">Create Account</h1>

        <div className="space-y-4">
          <input
            name="email"
            type="email"
            placeholder="Email Address"
            required
            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />

          <input
            name="password"
            type="password"
            placeholder="Password"
            required
            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />

          <input
            name="confirmPassword"
            type="password"
            placeholder="Confirm Password"
            required
            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />

          {state?.message && (
            <p className="text-red-500 text-sm font-medium">{state.message}</p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700 transition disabled:bg-blue-300"
          >
            {isPending ? 'Creating account...' : 'Create Account'}
          </button>

          <p className="text-center text-sm text-gray-500">
            Already have an account?{' '}
            <a href="/login" className="text-blue-600 hover:underline">Sign in</a>
          </p>
        </div>
      </form>
    </main>
  );
}
