import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/app-shell'
import { LibraryClient } from '@/components/library/library-client'

export default async function LibraryPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  async function logout() {
    'use server'
    const supabase = createClient()
    await supabase.auth.signOut()
    redirect('/login')
  }

  return (
    <AppShell user={{ email: user.email! }} logoutAction={logout}>
      <div className="p-8">
        <h2 className="text-2xl font-bold mb-1">素材庫</h2>
        <p className="text-muted-foreground text-sm mb-8">管理所有已產生的行銷素材</p>
        <LibraryClient />
      </div>
    </AppShell>
  )
}
