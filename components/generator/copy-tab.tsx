'use client'

import { useState, useRef } from 'react'
import { SCENE_TEMPLATES } from '@/lib/prompts/scene-templates'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PenLine, ImagePlus, Loader2, Copy as CopyIcon, ChevronDown, ChevronRight } from 'lucide-react'
import type {
  AssetStore,
  AssetPurpose,
  CampaignAxis,
  GenerateCampaignRequest,
  GenerateCampaignResponse,
} from '@/types'

const STORES: { value: AssetStore; label: string }[] = [
  { value: 'mattress', label: '床墊' },
  { value: 'bedding',  label: '寢具' },
]

const PLATFORMS: { value: AssetPurpose; label: string; desc: string }[] = [
  { value: 'google_ads',  label: 'Google 廣告', desc: '標題/長標/說明/路徑' },
  { value: 'meta_ads',    label: 'Meta 廣告',   desc: 'FB / IG 付費廣告'   },
  { value: 'social_post', label: '粉專貼文',     desc: 'FB / IG 自然貼文'   },
  { value: 'line_push',   label: 'LINE 推播',   desc: 'LINE 官方帳號'      },
]

const FREEFORM_SCENE_ID = 'freeform'

function platformLabel(purpose: AssetPurpose): string {
  return PLATFORMS.find(p => p.value === purpose)?.label ?? purpose
}

export function CopyTab() {
  const [store,        setStore]        = useState<AssetStore>('mattress')
  const [platforms,    setPlatforms]    = useState<AssetPurpose[]>(['meta_ads'])
  const [sceneId,      setSceneId]      = useState<string | null>(null)
  const [sceneDesc,    setSceneDesc]    = useState('')
  const [instructions, setInstructions] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [resp,    setResp]    = useState<GenerateCampaignResponse | null>(null)

  const [axisCollapsed, setAxisCollapsed] = useState(false)
  const [editedAxis,    setEditedAxis]    = useState<CampaignAxis | null>(null)

  const isFreeformScene = sceneId === FREEFORM_SCENE_ID

  function handleSceneClick(id: string) {
    setSceneId(sceneId === id ? null : id)
    if (sceneId !== id) setSceneDesc('')
  }

  function togglePlatform(value: AssetPurpose) {
    setPlatforms(prev =>
      prev.includes(value) ? prev.filter(p => p !== value) : [...prev, value],
    )
  }

  async function runCampaign(body: GenerateCampaignRequest) {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/generate/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data: GenerateCampaignResponse & { error?: string } = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || `生成失敗（HTTP ${res.status}）`)
      setResp(data)
      setEditedAxis(data.axis)
      setAxisCollapsed(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失敗')
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerate() {
    if (platforms.length === 0) { setError('請至少選一個平台'); return }
    setResp(null)
    const payload: GenerateCampaignRequest = {
      store,
      platforms,
      sceneId: sceneId && !isFreeformScene ? sceneId : undefined,
      sceneDesc: isFreeformScene ? sceneDesc.trim() || undefined : undefined,
      instructions: instructions.trim() || undefined,
    }
    await runCampaign(payload)
  }

  async function handleRederive() {
    if (!resp?.campaignId || !editedAxis) return
    await runCampaign({ store, platforms, campaignId: resp.campaignId, axis: editedAxis })
  }

  async function handleRegeneratePlatform(purpose: AssetPurpose) {
    if (!resp?.campaignId) return
    await runCampaign({ store, platforms: [purpose], campaignId: resp.campaignId })
  }

  const isCampaign = resp !== null && resp.campaignId !== null

  return (
    <div className="space-y-8">

      {/* Store */}
      <div>
        <Label className="text-sm font-medium mb-2 block">品牌 / 門市</Label>
        <div className="flex gap-2">
          {STORES.map(s => (
            <button key={s.value} onClick={() => setStore(s.value)}
              className={`px-4 py-1.5 rounded-md text-sm border transition-colors ${
                store === s.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Reference image — Phase 2 */}
      <div>
        <Label className="text-sm font-medium mb-1 block">
          參考圖片
          <span className="font-normal text-muted-foreground ml-1">（即將推出 · Phase 2）</span>
        </Label>
        <div
          className="flex items-center gap-3 border-2 border-dashed border-border rounded-lg px-5 py-4 text-muted-foreground pointer-events-none opacity-50">
          <ImagePlus size={20} />
          <div>
            <p className="text-sm">點擊上傳圖片</p>
            <p className="text-xs mt-0.5">JPG、PNG、WEBP，最大 10MB</p>
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" disabled />
      </div>

      {/* Platform — multi-select */}
      <div>
        <Label className="text-sm font-medium mb-2 block">投放平台</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PLATFORMS.map(p => {
            const active = platforms.includes(p.value)
            return (
              <button key={p.value} onClick={() => togglePlatform(p.value)}
                className={`text-left px-4 py-3 rounded-lg border transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'}`}>
                <p className="font-medium text-sm">{p.label}</p>
                <p className={`text-xs mt-0.5 ${active ? 'opacity-70' : 'text-muted-foreground'}`}>{p.desc}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Scene context */}
      <div className="space-y-3">
        <Label className="text-sm font-medium block">
          情境場景
          <span className="font-normal text-muted-foreground ml-1">（選填）</span>
        </Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SCENE_TEMPLATES.map(t => {
            const active = sceneId === t.id
            return (
              <button key={t.id} onClick={() => handleSceneClick(t.id)}
                className={`text-left p-3 rounded-lg border transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'}`}>
                <p className="font-medium text-sm">{t.name}</p>
                <p className={`text-xs mt-0.5 ${active ? 'opacity-70' : 'text-muted-foreground'}`}>{t.description}</p>
              </button>
            )
          })}
          <button onClick={() => handleSceneClick(FREEFORM_SCENE_ID)}
            className={`text-left p-3 rounded-lg border border-dashed transition-colors ${
              isFreeformScene
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'}`}>
            <p className="font-medium text-sm flex items-center gap-1.5"><PenLine size={13} />自由描述</p>
            <p className={`text-xs mt-0.5 ${isFreeformScene ? 'opacity-70' : 'text-muted-foreground'}`}>自行輸入情境描述</p>
          </button>
        </div>
        {isFreeformScene && (
          <Textarea
            placeholder="例：夜晚台北高樓景觀房、皮革床頭板、暖黃燈光..."
            value={sceneDesc}
            onChange={e => setSceneDesc(e.target.value)}
            rows={3}
          />
        )}
      </div>

      {/* Instructions */}
      <div>
        <Label className="text-sm font-medium mb-2 block">
          額外指示 <span className="font-normal text-muted-foreground">（選填）</span>
        </Label>
        <Textarea
          placeholder="例：主打春季檔期、強調免費試躺、語氣再活潑一點..."
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          rows={3}
        />
      </div>

      <Button className="w-full" size="lg" onClick={handleGenerate} disabled={loading}>
        {loading
          ? <span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" />產生中...</span>
          : '產生文案'}
      </Button>

      {error && (
        <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3">
          {error}
        </p>
      )}

      {resp && (
        <div className="space-y-4">
          <Label className="text-sm font-medium block">
            產生結果 <span className="font-normal text-muted-foreground text-xs">（已存草稿至素材庫）</span>
          </Label>

          {/* Campaign mode: collapsible editable axis card */}
          {isCampaign && editedAxis && (
            <div className="rounded-lg border border-border">
              <button
                onClick={() => setAxisCollapsed(c => !c)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <span className="text-sm font-medium flex items-center gap-1.5">
                  {axisCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  核心創意主軸
                </span>
                <span className="text-xs text-muted-foreground">{axisCollapsed ? '展開' : '收合'}</span>
              </button>
              {!axisCollapsed && (
                <div className="space-y-3 border-t border-border px-4 py-4">
                  <div>
                    <Label className="text-xs font-medium mb-1 block">大創意</Label>
                    <Textarea
                      value={editedAxis.big_idea}
                      onChange={e => setEditedAxis({ ...editedAxis, big_idea: e.target.value })}
                      rows={2}
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium mb-1 block">主打賣點（每行一個）</Label>
                    <Textarea
                      value={editedAxis.selling_points.join('\n')}
                      onChange={e => setEditedAxis({
                        ...editedAxis,
                        selling_points: e.target.value.split('\n').map(s => s.trim()).filter(Boolean),
                      })}
                      rows={4}
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium mb-1 block">語氣 / 切角</Label>
                    <input
                      value={editedAxis.tone}
                      onChange={e => setEditedAxis({ ...editedAxis, tone: e.target.value })}
                      className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium mb-1 block">受眾 / 情境</Label>
                    <input
                      value={editedAxis.audience}
                      onChange={e => setEditedAxis({ ...editedAxis, audience: e.target.value })}
                      className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
                    />
                  </div>
                  <Button size="sm" onClick={handleRederive} disabled={loading}>
                    {loading
                      ? <span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" />處理中...</span>
                      : '依此重新衍生'}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Errors box */}
          {resp.errors.length > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 space-y-1">
              {resp.errors.map((er, i) => (
                <p key={i} className="text-sm text-destructive">
                  <span className="font-medium">{platformLabel(er.purpose)}</span>：{er.message}
                </p>
              ))}
            </div>
          )}

          {/* Single standalone mode: no axis card, just the single result's groups */}
          {!isCampaign && resp.results[0] && (
            <div className="space-y-4">
              {resp.results[0].groups.map(g => (
                <div key={g.key} className="rounded-lg border border-border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{g.label} <span className="text-xs text-muted-foreground">（{g.items.length}）</span></span>
                    <button
                      onClick={() => navigator.clipboard.writeText(g.items.join('\n'))}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <CopyIcon size={12} /> 複製全部
                    </button>
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    {g.items.map((it, i) => <li key={i} className="whitespace-pre-wrap">{it}</li>)}
                  </ol>
                </div>
              ))}
            </div>
          )}

          {/* Campaign mode: one block per platform */}
          {isCampaign && resp.results.map(r => (
            <div key={r.purpose} className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{platformLabel(r.purpose)}</span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => navigator.clipboard.writeText(
                      r.groups.map(g => `【${g.label}】\n${g.items.join('\n')}`).join('\n\n'),
                    )}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <CopyIcon size={12} /> 複製全部
                  </button>
                  <button
                    onClick={() => handleRegeneratePlatform(r.purpose)}
                    disabled={loading}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    <Loader2 size={12} className={loading ? 'animate-spin' : 'hidden'} /> 重新生成此平台
                  </button>
                </div>
              </div>
              {r.groups.map(g => (
                <div key={g.key} className="rounded-md border border-border p-3 space-y-2">
                  <span className="text-sm font-medium">{g.label} <span className="text-xs text-muted-foreground">（{g.items.length}）</span></span>
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    {g.items.map((it, i) => <li key={i} className="whitespace-pre-wrap">{it}</li>)}
                  </ol>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
