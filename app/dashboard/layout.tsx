import { redirect } from 'next/navigation';
import { getUserId } from '@/lib/auth';
import sql from '@/lib/db';
import DashboardNav from './nav';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userId = await getUserId();
  if (!userId) {
    redirect('/login');
  }

  const [user] = await sql<{ email: string }[]>`
    SELECT email FROM users WHERE id = ${userId} LIMIT 1
  `;
  if (!user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <DashboardNav email={user.email} />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6">{children}</main>
    </div>
  );
}
