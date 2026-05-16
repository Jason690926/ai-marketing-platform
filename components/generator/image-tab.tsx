'use client'

import { useState } from 'react'
import { SCENE_TEMPLATES } from '@/lib/prompts/scene-templates'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { PenLine, Plus, X, Loader2, Download } from 'lucide-react'
import type {
  AssetStore,
  StylePreset,
  SizePreset,
  InputMode,
  GenerateImageRequest,
  GenerateImageResponse,
  Asset,
} from '@/types'

type Level = 'level1' | 'level2'
type Mode  = 'scene' | 'reference' | 'freeform'
type StyleValue = StylePreset | 'custom'

interface AdFeature { title: string; subtitle: string }

const STORES: { value: AssetStore; label: string }[] = [
  { value: 'mattress', label: '床墊' },
  { value: 'bedding',  label: '寢具' },
]

const LEVELS: { value: Level; label: string; desc: string }[] = [
  { value: 'level1', label: '底圖模式', desc: '乾淨底圖，供後製加字' },
  { value: 'level2', label: '完整廣告', desc: 'GPT-4o 直出含文字的完稿' },
]

const MODES: { value: Mode; label: string; desc: string }[] = [
  { value: 'scene',     label: '場景模板', desc: '從預設場景選擇' },
  { value: 'reference', label: '參考圖片', desc: '上傳參考風格'   },
  { value: 'freeform',  label: '自由描述', desc: '自行輸入描述'   },
]

const FREEFORM_CARD = { id: 'freeform', name: '自由描述', description: '自行輸入場景描述' }

const STYLES: { value: StyleValue; label: string; dashed?: boolean }[] = [
  { value: 'auto',           label: '自動'   },
  { value: 'hotel_dark',     label: '飯店暗調' },
  { value: 'cozy_warm',      label: '溫馨暖調' },
  { value: 'minimal_clean',  label: '簡約清爽' },
  { value: 'outdoor_natural',label: '戶外自然' },
  { value: 'custom',         label: '自由描述', dashed: true },
]

const SIZES: { value: SizePreset; label: string; sub: string; orient: 'square' | 'portrait' | 'landscape' }[] = [
  { value: '1080x1080', label: '正方形',  sub: '1:1 · IG 貼文',       orient: 'square'    },
  { value: '1080x1350', label: '直式',    sub: '4:5 · IG 直式',       orient: 'portrait'  },
  { value: '1080x1920', label: '限時',    sub: '9:16 · Stories/Reels',orient: 'portrait'  },
  { value: '1200x675',  label: '橫式',    sub: '16:9 · Facebook',     orient: 'landscape' },
  { value: '1200x628',  label: '廣告橫幅',sub: '1.91:1 · FB 廣告',    orient: 'landscape' },
  { value: '1920x800',  label: '寬屏',    sub: '21:9 · 官網橫幅',     orient: 'landscape' },
]

function toggle<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val]
}

export function ImageTab() {
  const [store,       setStore]       = useState<AssetStore>('mattress')
  const [level,       setLevel]       = useState<Level>('level1')
  const [mode,        setMode]        = useState<Mode>('scene')
  const [sceneId,     setSceneId]     = useState<string>('hotel_suite')
  const [description, setDescription] = useState('')
  const [freeformDesc,setFreeformDesc]= useState('')
  const [style,       setStyle]       = useState<StyleValue>('auto')
  const [styleDesc,   setStyleDesc]   = useState('')
  const [sizes,       setSizes]       = useState<SizePreset[]>(['1080x1080'])

  // Level 2 ad fields
  const [adTitle,       setAdTitle]       = useState('')
  const [adSubtitle,    setAdSubtitle]    = useState('')
  const [adEndorsement, setAdEndorsement] = useState('')
  const [adFeatures,    setAdFeatures]    = useState<AdFeature[]>([{ title: '', subtitle: '' }])

  const [loading,  setLoading]  = useState(false)
  const [progress, setProgress] = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [results,  setResults]  = useState<Asset[]>([])

  const isFreeformScene = sceneId === 'freeform'

  // For Level 2: count distinct orientations selected → API call count
  const selectedOrients = [...new Set(SIZES.filter(s => sizes.includes(s.value)).map(s => s.orient))]
  const apiCallCount = level === 'level2' ? sizes.length : selectedOrients.length

  function addFeature() {
    if (adFeatures.length < 3) setAdFeatures([...adFeatures, { title: '', subtitle: '' }])
  }
  function removeFeature(i: number) {
    setAdFeatures(adFeatures.filter((_, idx) => idx !== i))
  }
  function updateFeature(i: number, field: keyof AdFeature, val: string) {
    setAdFeatures(adFeatures.map((f, idx) => idx === i ? { ...f, [field]: val } : f))
  }

  function buildRequest(sizePreset: SizePreset): GenerateImageRequest {
    // Scene "freeform" card behaves like freeform mode for the API.
    const effectiveMode: InputMode =
      mode === 'scene' && isFreeformScene ? 'freeform' : mode

    const notes = [
      mode === 'scene' && !isFreeformScene ? description.trim() : '',
      style === 'custom' ? styleDesc.trim() : '',
    ].filter(Boolean).join('. ')

    return {
      mode: effectiveMode,
      store,
      sceneId: mode === 'scene' && !isFreeformScene ? sceneId : undefined,
      freeformDescription:
        effectiveMode === 'freeform'
          ? (mode === 'freeform' ? freeformDesc : description).trim()
          : undefined,
      stylePreset: (style === 'custom' ? 'auto' : style) as StylePreset,
      sizePreset,
      additionalNotes: notes || undefined,
    }
  }

  async function handleGenerate() {
    setError(null)
    setResults([])
    setLoading(true)
    const collected: Asset[] = []
    try {
      // Level 1: one API call per distinct orientation (shared base image,
      // cropped per size client-side later). Here we call per selected size
      // to keep within the typed GenerateImageRequest contract.
      const targets = level === 'level1'
        ? [...new Set(SIZES.filter(s => sizes.includes(s.value)).map(s => s.value))]
        : sizes
      let done = 0
      for (const size of targets) {
        setProgress(`產生中 ${++done}/${targets.length}（${size}）...`)
        const res = await fetch('/api/generate/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildRequest(size)),
        })
        const data: GenerateImageResponse = await res.json()
        if (!res.ok || data.error) {
          throw new Error(data.error || `生成失敗（HTTP ${res.status}）`)
        }
        collected.push(...data.assets)
        setResults([...collected])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失敗')
    } finally {
      setLoading(false)
      setProgress('')
    }
  }

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

      {/* Level */}
      <div>
        <Label className="text-sm font-medium mb-2 block">產圖層級</Label>
        <div className="flex gap-3">
          {LEVELS.map(l => (
            <button key={l.value} onClick={() => setLevel(l.value)}
              className={`flex flex-col items-start px-4 py-3 rounded-lg border transition-colors flex-1 ${
                level === l.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'}`}>
              <span className="font-medium text-sm">{l.label}</span>
              <span className="text-xs opacity-70 mt-0.5">{l.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Mode (shared) */}
      <div>
        <Label className="text-sm font-medium mb-2 block">背景場景模式</Label>
        <div className="flex gap-2">
          {MODES.map(m => (
            <button key={m.value} onClick={() => setMode(m.value)}
              className={`flex flex-col items-start px-4 py-2.5 rounded-md text-sm border transition-colors ${
                mode === m.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'}`}>
              <span className="font-medium">{m.label}</span>
              <span className="text-xs opacity-70">{m.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Scene templates */}
      {mode === 'scene' && (
        <div className="space-y-4">
          <Label className="text-sm font-medium block">場景模板</Label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {SCENE_TEMPLATES.map(t => {
              const active = sceneId === t.id
              return (
                <button key={t.id} onClick={() => setSceneId(t.id)}
                  className={`text-left p-3.5 rounded-lg border transition-colors ${
                    active ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-foreground'}`}>
                  <p className="font-medium text-sm">{t.name}</p>
                  <p className={`text-xs mt-0.5 ${active ? 'opacity-70' : 'text-muted-foreground'}`}>{t.description}</p>
                </button>
              )
            })}
            <button onClick={() => setSceneId('freeform')}
              className={`text-left p-3.5 rounded-lg border border-dashed transition-colors ${
                isFreeformScene ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-foreground'}`}>
              <p className="font-medium text-sm flex items-center gap-1.5"><PenLine size={13} />{FREEFORM_CARD.name}</p>
              <p className={`text-xs mt-0.5 ${isFreeformScene ? 'opacity-70' : 'text-muted-foreground'}`}>{FREEFORM_CARD.description}</p>
            </button>
          </div>
          {isFreeformScene
            ? <Textarea placeholder="例：北歐風格白色臥室，大片窗戶透入清晨陽光..." value={description} onChange={e => setDescription(e.target.value)} rows={4} />
            : <div>
                <Label className="text-sm text-muted-foreground mb-1.5 block">補充描述 <span className="text-xs">（選填）</span></Label>
                <Textarea placeholder="例：床頭板要有金屬邊框、窗簾要半開..." value={description} onChange={e => setDescription(e.target.value)} rows={2} />
              </div>
          }
        </div>
      )}

      {/* Reference mode */}
      {mode === 'reference' && (
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium mb-2 block">上傳參考圖片</Label>
            <div className="border-2 border-dashed border-border rounded-lg p-10 text-center text-muted-foreground text-sm hover:border-foreground transition-colors cursor-pointer">
              <p>點擊或拖曳上傳圖片</p>
              <p className="text-xs mt-1">JPG、PNG，最大 5MB</p>
            </div>
          </div>
          <div>
            <Label className="text-sm text-muted-foreground mb-1.5 block">場景補充描述 <span className="text-xs">（選填）</span></Label>
            <Textarea placeholder="例：保留參考圖的暖調光線，但場景改為室內..." value={description} onChange={e => setDescription(e.target.value)} rows={3} />
          </div>
        </div>
      )}

      {/* Freeform mode */}
      {mode === 'freeform' && (
        <div>
          <Label className="text-sm font-medium mb-2 block">場景描述</Label>
          <Textarea placeholder="例：北歐風格白色臥室，大片窗戶透入清晨陽光，床單為霧灰色亞麻布..." value={freeformDesc} onChange={e => setFreeformDesc(e.target.value)} rows={4} />
        </div>
      )}

      {/* Style */}
      <div className="space-y-3">
        <Label className="text-sm font-medium block">風格調性</Label>
        <div className="flex flex-wrap gap-2">
          {STYLES.map(s => {
            const active = style === s.value
            return (
              <button key={s.value} onClick={() => setStyle(s.value)}
                className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${s.dashed ? 'border-dashed' : ''} ${
                  active ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'}`}>
                {s.label}
              </button>
            )
          })}
        </div>
        {style === 'custom' && (
          <Textarea placeholder="例：電影感冷藍調、霧面質感、強烈側光打在床墊布料上..." value={styleDesc} onChange={e => setStyleDesc(e.target.value)} rows={2} />
        )}
      </div>

      {/* Level 2: Ad content fields */}
      {level === 'level2' && (
        <div className="space-y-4 rounded-lg border border-border p-5">
          <Label className="text-sm font-semibold block">廣告文字內容</Label>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">廣告標題</Label>
            <Input placeholder="例：圓山飯店紀念床款" value={adTitle} onChange={e => setAdTitle(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">副標題 <span>（選填）</span></Label>
            <Input placeholder="例：德國工藝・飯店等級的深層睡眠" value={adSubtitle} onChange={e => setAdSubtitle(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">背書標語 <span>（選填）</span></Label>
            <Input placeholder="例：圓山飯店指定選用" value={adEndorsement} onChange={e => setAdEndorsement(e.target.value)} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">產品賣點 <span>（最多 3 項）</span></Label>
              {adFeatures.length < 3 && (
                <button onClick={addFeature} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <Plus size={12} /> 新增賣點
                </button>
              )}
            </div>
            {adFeatures.map((f, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="flex-1 space-y-1.5">
                  <Input placeholder={`賣點 ${i + 1} 標題，例：德國高碳鋼獨立筒`} value={f.title} onChange={e => updateFeature(i, 'title', e.target.value)} />
                  <Input placeholder="副說明，例：精準支撐・耐用靜音" value={f.subtitle} onChange={e => updateFeature(i, 'subtitle', e.target.value)} />
                </div>
                {adFeatures.length > 1 && (
                  <button onClick={() => removeFeature(i)} className="mt-1 text-muted-foreground hover:text-destructive transition-colors">
                    <X size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Size multi-select */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-sm font-medium">尺寸規格 <span className="font-normal text-muted-foreground text-xs">（可多選）</span></Label>
          <span className="text-xs text-muted-foreground">
            已選 {sizes.length} 個
            {level === 'level2'
              ? `・${apiCallCount} 次 API 呼叫`
              : selectedOrients.length > 0 ? `・${apiCallCount} 次 API 呼叫` : ''}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {SIZES.map(s => {
            const active = sizes.includes(s.value)
            return (
              <button key={s.value} onClick={() => setSizes(toggle(sizes, s.value))}
                className={`flex flex-col items-center px-2 py-2.5 rounded-md text-sm border transition-colors ${
                  active ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'}`}>
                <span className="font-medium text-xs">{s.label}</span>
                <span className="text-[10px] opacity-70 mt-0.5 leading-tight text-center">{s.sub}</span>
              </button>
            )
          })}
        </div>
        {level === 'level1' && selectedOrients.length > 1 && (
          <p className="text-xs text-muted-foreground mt-2">
            跨方向（直式 / 橫式 / 方形）各產一張主圖，同方向裁切，確保商品不被截斷。
          </p>
        )}
      </div>

      {level === 'level2' && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          Level 2 完整廣告（含廣告文字直出）尚未串接，目前僅支援 Level 1 底圖生成。
        </p>
      )}

      <Button
        className="w-full"
        size="lg"
        onClick={handleGenerate}
        disabled={loading || level === 'level2' || sizes.length === 0}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" />
            {progress || '產生中...'}
          </span>
        ) : (
          `產生底圖（${apiCallCount} 次 API 呼叫）`
        )}
      </Button>

      {error && (
        <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3">
          {error}
        </p>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          <Label className="text-sm font-medium block">
            產生結果 <span className="font-normal text-muted-foreground text-xs">（{results.length} 張・已存入素材庫）</span>
          </Label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {results.map(a => (
              <div key={a.id} className="group relative rounded-lg border border-border overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.image_url ?? ''} alt={a.prompt_used ?? 'generated'} className="w-full aspect-square object-cover" />
                <a
                  href={a.image_url ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-background/90 px-2.5 py-1.5 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Download size={12} /> 下載
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
