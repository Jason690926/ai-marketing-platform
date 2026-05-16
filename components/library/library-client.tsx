'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Download, Star } from 'lucide-react'
import type { Asset, AssetType, AssetStore, AssetStatus } from '@/types'

const TYPES: { value: AssetType | ''; label: string }[] = [
  { value: '',            label: '全部類型' },
  { value: 'image',       label: '圖片' },
  { value: 'copy',        label: '文案' },
  { value: 'article',     label: '文章' },
  { value: 'thread_post', label: 'Thread' },
]
const STORES: { value: AssetStore | ''; label: string }[] = [
  { value: '',         label: '全部門市' },
  { value: 'mattress', label: '床墊' },
  { value: 'bedding',  label: '寢具' },
]
const STATUSES: { value: AssetStatus | ''; label: string }[] = [
  { value: '',         label: '全部狀態' },
  { value: 'draft',    label: '草稿' },
  { value: 'pending',  label: '待審' },
  { value: 'approved', label: '已核准' },
  { value: 'rejected', label: '已退回' },
]

export function LibraryClient() {
  const [assets,  setAssets]  = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const [type,   setType]   = useState<AssetType | ''>('')
  const [store,  setStore]  = useState<AssetStore | ''>('')
  const [status, setStatus] = useState<AssetStatus | ''>('')
  const [q,      setQ]      = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (type)   params.set('type', type)
      if (store)  params.set('store', store)
      if (status) params.set('status', status)
      if (q.trim()) params.set('q', q.trim())
      const res = await fetch(`/api/assets?${params.toString()}`)
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || `載入失敗（HTTP ${res.status}）`)
      setAssets(data.assets as Asset[])
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [type, store, status, q])

  // Re-fetch on filter change (debounced for the text query).
  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  const selectCls =
    'rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground'

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select className={selectCls} value={type} onChange={e => setType(e.target.value as AssetType | '')}>
          {TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className={selectCls} value={store} onChange={e => setStore(e.target.value as AssetStore | '')}>
          {STORES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className={selectCls} value={status} onChange={e => setStatus(e.target.value as AssetStatus | '')}>
          {STATUSES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input
          className={`${selectCls} flex-1 min-w-[180px]`}
          placeholder="搜尋 prompt 內容..."
          value={q}
          onChange={e => setQ(e.target.value)}
        />
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-16 justify-center">
          <Loader2 size={16} className="animate-spin" /> 載入中...
        </div>
      )}

      {error && !loading && (
        <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3">
          {error}
        </p>
      )}

      {!loading && !error && assets.length === 0 && (
        <div className="rounded-lg border border-border p-16 text-center text-muted-foreground text-sm">
          尚無符合條件的素材
        </div>
      )}

      {!loading && !error && assets.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {assets.map(a => (
            <div key={a.id} className="group rounded-lg border border-border overflow-hidden">
              {a.type === 'image' && a.image_url ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.image_url} alt={a.prompt_used ?? ''} className="w-full aspect-square object-cover" />
                  <a
                    href={a.image_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-background/90 px-2.5 py-1.5 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Download size={12} /> 下載
                  </a>
                </div>
              ) : (
                <div className="aspect-square p-4 text-xs text-muted-foreground overflow-hidden">
                  {a.prompt_used ?? '（無預覽）'}
                </div>
              )}
              <div className="flex items-center justify-between px-3 py-2 text-xs">
                <span className="text-muted-foreground">
                  {a.store === 'mattress' ? '床墊' : '寢具'} · {a.status}
                </span>
                {a.is_starred && <Star size={12} className="fill-current text-amber-500" />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
