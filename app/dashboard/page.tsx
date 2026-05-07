import { getUserId } from '@/lib/auth';
import sql from '@/lib/db';

export default async function DashboardPage() {
  // Layout already verified auth, but we still need the email for display.
  // (Layout doesn't pass it down to the page tree — they're separate trees.)
  const userId = await getUserId();
  const [user] = await sql<{ email: string }[]>`
    SELECT email FROM users WHERE id = ${userId} LIMIT 1
  `;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Dashboard
      </h1>
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-500">Signed in as</p>
        <p className="text-sm font-medium text-slate-900 mt-0.5">
          {user?.email}
        </p>
      </div>
    </div>
  );
}
