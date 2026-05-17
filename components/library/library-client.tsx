'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Download, Star, Copy as CopyIcon, ChevronDown, ChevronRight } from 'lucide-react'
import type { Asset, AssetType, AssetStore, AssetStatus, CampaignWithAssets } from '@/types'

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

type Period = '' | 'month' | '30d' | 'custom'
const PERIODS: { value: Period; label: string }[] = [
  { value: '',       label: '全部期間' },
  { value: 'month',  label: '本月' },
  { value: '30d',    label: '近 30 天' },
  { value: 'custom', label: '自訂' },
]

const storeLabel = (s: AssetStore) => (s === 'mattress' ? '床墊' : '寢具')

function AssetContentCard({ a }: { a: Asset }) {
  return (
    <div className="group rounded-lg border border-border overflow-hidden">
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
        <div className="relative">
          <div className="h-48 p-4 text-xs text-foreground overflow-y-auto whitespace-pre-wrap">
            {a.content ?? a.prompt_used ?? '（無內容）'}
          </div>
          {a.content && (
            <button
              onClick={() => navigator.clipboard.writeText(a.content!)}
              className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-background/90 px-2.5 py-1.5 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <CopyIcon size={12} /> 複製全部
            </button>
          )}
        </div>
      )}
      <div className="flex items-center justify-between px-3 py-2 text-xs">
        <span className="text-muted-foreground">
          {storeLabel(a.store)} · {a.status} · {new Date(a.created_at).toLocaleDateString()}
        </span>
        {a.is_starred && <Star size={12} className="fill-current text-amber-500" />}
      </div>
    </div>
  )
}

function CampaignCard({ cw }: { cw: CampaignWithAssets }) {
  const [open, setOpen] = useState(false)
  const c = cw.campaign
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
      >
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-foreground truncate">{c.big_idea}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(c.created_at).toLocaleDateString()} · {storeLabel(c.store)} · {cw.assets.length} 個平台
          </p>
        </div>
        {open
          ? <ChevronDown size={18} className="shrink-0 text-muted-foreground" />
          : <ChevronRight size={18} className="shrink-0 text-muted-foreground" />}
      </button>
      {open && (
        <div className="border-t border-border p-4">
          {cw.assets.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">此活動尚無素材</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {cw.assets.map(a => <AssetContentCard key={a.id} a={a} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function LibraryClient() {
  const [assets,  setAssets]  = useState<Asset[]>([])
  const [campaigns, setCampaigns] = useState<CampaignWithAssets[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const [type,   setType]   = useState<AssetType | ''>('')
  const [store,  setStore]  = useState<AssetStore | ''>('')
  const [status, setStatus] = useState<AssetStatus | ''>('')
  const [q,      setQ]      = useState('')
  const [period, setPeriod] = useState<Period>('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo,   setCustomTo]   = useState('')

  // Resolve the selected period into ISO from/to bounds (null = unbounded).
  const range = (() => {
    if (period === 'month') {
      const now = new Date()
      const first = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
      return { from: first.toISOString(), to: null as string | null }
    }
    if (period === '30d') {
      const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      return { from: from.toISOString(), to: null as string | null }
    }
    if (period === 'custom') {
      return {
        from: customFrom ? new Date(customFrom).toISOString() : null,
        to:   customTo   ? new Date(customTo).toISOString()   : null,
      }
    }
    return { from: null as string | null, to: null as string | null }
  })()
  const { from, to } = range

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (type)   params.set('type', type)
      if (store)  params.set('store', store)
      if (status) params.set('status', status)
      if (q.trim()) params.set('q', q.trim())
      if (from) params.set('from', from)
      if (to)   params.set('to', to)
      const [assetsRes, campaignsRes] = await Promise.all([
        fetch(`/api/assets?${params.toString()}`),
        fetch('/api/campaigns'),
      ])
      const assetsData = await assetsRes.json()
      if (!assetsRes.ok || assetsData.error)
        throw new Error(assetsData.error || `載入失敗（HTTP ${assetsRes.status}）`)
      setAssets(assetsData.assets as Asset[])

      const campaignsData = await campaignsRes.json()
      if (!campaignsRes.ok || campaignsData.error)
        throw new Error(campaignsData.error || `載入失敗（HTTP ${campaignsRes.status}）`)
      const all = (campaignsData.campaigns as CampaignWithAssets[]) ?? []
      // Backend has no from/to for campaigns; filter client-side by created_at.
      const filtered = all.filter(cw => {
        const ts = new Date(cw.campaign.created_at).getTime()
        if (from && ts < new Date(from).getTime()) return false
        if (to && ts > new Date(to).getTime()) return false
        return true
      })
      setCampaigns(filtered)
    } catch (e) {
      setError(e instanceof Error ? e.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [type, store, status, q, from, to])

  // Re-fetch on filter change (debounced for the text query).
  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  const selectCls =
    'rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground'

  const isEmpty = assets.length === 0 && campaigns.length === 0

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
        <select className={selectCls} value={period} onChange={e => setPeriod(e.target.value as Period)}>
          {PERIODS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {period === 'custom' && (
          <>
            <input
              type="date"
              className={selectCls}
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
            />
            <input
              type="date"
              className={selectCls}
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
            />
          </>
        )}
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

      {!loading && !error && isEmpty && (
        <div className="rounded-lg border border-border p-16 text-center text-muted-foreground text-sm">
          尚無符合條件的素材
        </div>
      )}

      {!loading && !error && campaigns.length > 0 && (
        <div className="space-y-3">
          {campaigns.map(cw => <CampaignCard key={cw.campaign.id} cw={cw} />)}
        </div>
      )}

      {!loading && !error && assets.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {assets.map(a => <AssetContentCard key={a.id} a={a} />)}
        </div>
      )}
    </div>
  )
}
