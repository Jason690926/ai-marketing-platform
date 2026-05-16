'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Sparkles, Images, LogOut, Image, FileText } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type NavChild = { href: string; label: string; icon: LucideIcon }
type NavItem =
  | { label: string; icon: LucideIcon; children: NavChild[] }
  | { label: string; icon: LucideIcon; href: string }

const NAV: NavItem[] = [
  {
    label: '素材產生器',
    icon: Sparkles,
    children: [
      { href: '/generator/image', label: '圖片產生', icon: Image },
      { href: '/generator/copy',  label: '文案產生', icon: FileText },
    ],
  },
  {
    label: '素材庫',
    icon: Images,
    href: '/library',
  },
]

interface AppShellProps {
  children: React.ReactNode
  user: { email: string }
  logoutAction: () => Promise<void>
}

export function AppShell({ children, user, logoutAction }: AppShellProps) {
  const pathname = usePathname()

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-border flex flex-col">
        <div className="px-5 py-5 border-b border-border">
          <span className="font-bold text-base tracking-tight">AI 行銷平台</span>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((item) => {
            if ('children' in item) {
              const parentActive = item.children.some(c => pathname === c.href)
              return (
                <div key={item.label}>
                  <div className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium ${
                    parentActive ? 'text-foreground' : 'text-muted-foreground'
                  }`}>
                    <item.icon size={15} />
                    {item.label}
                  </div>
                  <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-3">
                    {item.children.map(child => {
                      const active = pathname === child.href
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                            active
                              ? 'bg-primary text-primary-foreground font-medium'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                          }`}
                        >
                          <child.icon size={13} />
                          {child.label}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )
            }

            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <item.icon size={15} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-border space-y-2">
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <LogOut size={13} />
              登出
            </button>
          </form>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
