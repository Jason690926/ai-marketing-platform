# Copy Generation API Implementation Plan (v2)

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Implement platform-oriented `/api/generate/copy` (Claude-backed, 4 platforms, one asset per generation) and wire it into copy-tab.

**v2 supersedes v1.** Tasks T1, T2, T4 are already committed and unchanged. v2 re-does T3, T5, T6, T7, adds a migration + image-route fix.

**Tech Stack:** Next.js 14 route handlers, TypeScript, `@anthropic-ai/sdk`, Supabase SSR.

**Spec:** `docs/superpowers/specs/2026-05-16-copy-generation-api-design.md`

**Verification pattern:** no unit-test runner in repo; gate every task with `npx tsc --noEmit` (0-error baseline) + curl smoke against the already-running dev server. Full `npx next build` deferred to final task to avoid `.next` contention. Never `git push` (manual). Never stage preview-only files (middleware.ts, app/generator/copy/page.tsx, app/generator/image/page.tsx, app/library/page.tsx) or `.claude/`.

---

### Task V3: types/index.ts → v2 platform model

**Files:** Modify `types/index.ts`

- [ ] **Step 1:** Replace the existing line `export type AssetPurpose = 'ad' | 'post' | 'web_brand' | 'web_product' | 'seo_article' | 'thread'` with:

```ts
export type AssetPurpose = 'google_ads' | 'meta_ads' | 'social_post' | 'line_push'
```

- [ ] **Step 2:** Replace the v1 copy types previously appended (`GenerateCopyRequest`, `CopyVariant`, `GenerateCopyResponse`) at the end of the file with:

```ts
export interface GenerateCopyRequest {
  store: AssetStore
  purpose: AssetPurpose
  sceneId?: string
  sceneDesc?: string
  instructions?: string
  linkedImageAssetId?: string
}

export interface CopyGroup {
  key: string
  label: string
  items: string[]
}

export interface GenerateCopyResponse {
  assetId?: string
  purpose?: AssetPurpose
  groups: CopyGroup[]
  content?: string
  error?: string
}
```

(If `CopyVariant` is gone, ensure nothing else references it — copy-tab is rewritten in V7, image route fixed in V4b.)

- [ ] **Step 3:** `npx tsc --noEmit` — expect errors ONLY in `app/api/generate/copy/route.ts` and `components/generator/copy-tab.tsx` and `app/api/generate/image/route.ts` (they still use old shapes; fixed in later tasks). Note them; they are expected, not regressions in this file.

- [ ] **Step 4:** Commit only `types/index.ts`:
`git add types/index.ts && git commit -m "feat(v2): platform-oriented AssetPurpose + copy group types"`

---

### Task V4b: Migration 003 + image route purpose fix

**Files:** Create `supabase/migrations/003_purpose_v2.sql`; Modify `app/api/generate/image/route.ts`

- [ ] **Step 1:** Create `supabase/migrations/003_purpose_v2.sql`:

```sql
-- v2: purpose taxonomy changed to platform model.
-- NOT VALID skips validating pre-existing rows (legacy 'ad'/'post' etc.)
-- so the migration cannot fail on old data; new inserts are still checked.
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_purpose_check;
ALTER TABLE assets ADD CONSTRAINT assets_purpose_check
  CHECK (purpose IN ('google_ads','meta_ads','social_post','line_push')) NOT VALID;
```

- [ ] **Step 2:** In `app/api/generate/image/route.ts`, find the asset insert and change the hardcoded `purpose: 'post',` to `purpose: 'social_post',` (single occurrence, inside the `.insert({ ... })` object).

- [ ] **Step 3:** `npx tsc --noEmit` — image route error (if any) should now be gone; remaining errors expected only in copy route + copy-tab.

- [ ] **Step 4:** Commit only these two files:
`git add supabase/migrations/003_purpose_v2.sql app/api/generate/image/route.ts && git commit -m "feat(v2): migration 003 purpose check + image route purpose=social_post"`

---

### Task V5: copywriter.ts → v2

**Files:** Overwrite `lib/prompts/copywriter.ts`

- [ ] **Step 1:** Replace the entire file with:

```ts
import type { AssetPurpose } from '@/types'
import { BRAND_KNOWLEDGE } from './brand-knowledge'

/** Configurable platform -> Claude model map. Change here only. */
export const PURPOSE_MODEL_MAP: Record<AssetPurpose, string> = {
  google_ads:  'claude-sonnet-4-6',
  meta_ads:    'claude-sonnet-4-6',
  social_post: 'claude-sonnet-4-6',
  line_push:   'claude-sonnet-4-6',
}

export interface CopyGroupSpec {
  key: string
  label: string
  min: number
  max: number
  guidance: string
}

export const PLATFORM_GROUPS: Record<AssetPurpose, CopyGroupSpec[]> = {
  google_ads: [
    { key: 'short_headlines', label: '廣告標題', min: 15, max: 15, guidance: '每組上限 30 字元（中文約 15 字）。至少 3 組含主要關鍵字、3 組講產品優勢、3 組含行動呼籲；每組獨立可用、任意組合通順' },
    { key: 'long_headlines', label: '長廣告標題', min: 5, max: 5, guidance: '每組上限 90 字元（中文約 45 字），完整表達一個賣點或品牌故事' },
    { key: 'descriptions', label: '說明', min: 4, max: 4, guidance: '每組上限 90 字元（中文約 45 字），具體賣點 + CTA，最重要資訊放前 30 字' },
    { key: 'paths', label: '路徑', min: 2, max: 2, guidance: '每組上限 15 字元（中文約 7 字）' },
  ],
  meta_ads: [
    { key: 'primary_text', label: '主要文字', min: 5, max: 5, guidance: '建議 125 字元內（中文約 60 字），手機約顯示 3 行，重點放前面' },
    { key: 'headlines', label: '標題', min: 5, max: 5, guidance: '建議 40 字元內（中文約 20 字），FB Feed 建議 27 字元（中文約 13 字）' },
    { key: 'descriptions', label: '說明', min: 5, max: 5, guidance: '建議 25-30 字元（中文約 12-15 字），不放關鍵資訊' },
    { key: 'cta', label: 'CTA 按鈕建議', min: 1, max: 1, guidance: '「瞭解詳情」「立即預約」「傳送訊息」擇一' },
  ],
  social_post: [
    { key: 'posts', label: '貼文內文', min: 3, max: 3, guidance: '長度 150-300 字，第一句為 Hook，結尾帶互動問句或 CTA，自然融入 SEO 關鍵字（台中床墊、獨立筒、預約試躺等）與 GEO（台中、大雅、中清路），符合 SEO/AEO/GEO' },
    { key: 'hashtags', label: 'Hashtag', min: 10, max: 15, guidance: '10-15 個：品牌(#德國美得麗 #Musterring)、產品(#獨立筒床墊 #天然乳膠床墊)、地區(#台中床墊 #台中床墊推薦 #大雅)、通用(#睡眠品質 #預約試躺 #好眠)' },
  ],
  line_push: [
    { key: 'push_titles', label: '推播標題', min: 3, max: 3, guidance: '20 字內，要讓人想點開' },
    { key: 'push_bodies', label: '推播內文', min: 3, max: 3, guidance: '100 字內，簡潔有力' },
    { key: 'cta', label: 'CTA 按鈕文字', min: 1, max: 1, guidance: '8 字內' },
  ],
}

export const COPYWRITER_SYSTEM_PROMPT = `
你是德國美得麗床墊台中中清專賣店的資深行銷文案，熟悉台灣消費者的語言習慣和購買心理。

語言：一律使用繁體中文與台灣在地用語。嚴禁簡體字、中國大陸慣用語或思維。

寫作原則：
- 語氣：專業但溫暖，像朋友推薦好東西，不是銷售員推銷
- 核心訊息：德國近百年工藝 + 飯店級健康睡眠體驗
- CTA：導向「預約試躺」或「到店體驗」，不是「立即購買」
- 信任元素：圓山飯店指定、威尼斯人酒店使用、德國 1938 年創立

賣點排序邏輯（所有平台通用）：
1. 先講「感受」（讓你一躺就不想起來）
2. 再講「材質技術」（獨立筒、天然乳膠、杜邦棉）
3. 再講「品牌背書」（圓山飯店指定、德國近百年）
4. 最後「行動呼籲」（免費試躺、預約體驗）

你絕對不寫的詞：
- 工廠直營、最便宜、破盤價、跳樓大拍賣
- 任何暗示「低價競爭」的用語
- 過度誇張的醫療承諾（保證治好腰痛等）；不得出現療效或醫療等級宣稱，避免台灣不實廣告（公平交易法）風險
- 不得捏造未提供的數據、認證或事實；僅能使用下方品牌知識中明列的資訊
- 不得抄襲競品文案或直接套用其句式；可參考競品訴求手法後轉化為更優、具 Musterring 差異化的原創內容

各平台規格（依當次指定平台產出對應群組與數量，字數上限務必遵守；中文 1 字以 2 字元計）：
- Google 廣告：廣告標題×15（≤30字元）、長廣告標題×5（≤90字元）、說明×4（≤90字元）、路徑×2（≤15字元）
- Meta 廣告（FB/IG）：主要文字×5（≤125字元）、標題×5（≤40字元）、說明×5（≤25-30字元）、CTA按鈕×1
- 粉專貼文（FB/IG 自然貼文）：貼文內文×3（150-300字，首句Hook，符合SEO/AEO/GEO，融入台中/大雅/中清路）、Hashtag×10-15
- LINE 官方帳號推播：推播標題×3（20字內）、推播內文×3（100字內）、CTA按鈕文字×1（8字內）

共用規則：
- 文案風格依平台自動切換：廣告→轉換導向、痛點開頭、短而直接；粉專貼文→內容導向、故事感、輕鬆有溫度；LINE推播→一句話勾興趣、簡潔有急迫感但不廉價；Google廣告→關鍵字導向、精準匹配搜尋意圖
- 每組變體切換不同切入角度（痛點/品牌/技術/季節），供小編挑選
- 所有文案需符合 SEO / AEO / GEO 寫法標準

品牌知識（唯一事實來源）：
${BRAND_KNOWLEDGE}
`.trim()

export function buildCopyBrief(input: {
  purpose: AssetPurpose
  store: string
  sceneContext?: string
  instructions?: string
  linkedImagePrompt?: string
}): string {
  const storeLabel = input.store === 'bedding' ? '寢具' : '床墊'
  const groups = PLATFORM_GROUPS[input.purpose]
  const parts: string[] = [
    `目標平台：${input.purpose}`,
    `產品線：${storeLabel}`,
  ]
  if (input.sceneContext) parts.push(`情境場景：${input.sceneContext}`)
  if (input.linkedImagePrompt)
    parts.push(`對應視覺（請讓文案調性與此畫面一致）：${input.linkedImagePrompt}`)
  if (input.instructions) parts.push(`額外指示：${input.instructions}`)
  parts.push('請依下列群組產出對應數量與字數規範的文案：')
  for (const g of groups) {
    parts.push(`- ${g.label}（${g.key}）：${g.min === g.max ? g.min : `${g.min}-${g.max}`} 組。${g.guidance}`)
  }
  return parts.join('\n')
}
```

- [ ] **Step 2:** `npx tsc --noEmit` — copywriter.ts itself must have no errors (remaining expected errors only in copy route + copy-tab).

- [ ] **Step 3:** Commit only `lib/prompts/copywriter.ts`:
`git add lib/prompts/copywriter.ts && git commit -m "feat(v2): platform-group copywriter prompt + brief builder"`

---

### Task V6: route.ts → v2

**Files:** Overwrite `app/api/generate/copy/route.ts`

- [ ] **Step 1:** Replace the entire file with:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAnthropic } from '@/lib/anthropic/client'
import {
  COPYWRITER_SYSTEM_PROMPT,
  PURPOSE_MODEL_MAP,
  PLATFORM_GROUPS,
  buildCopyBrief,
} from '@/lib/prompts/copywriter'
import { getSceneById } from '@/lib/prompts/scene-templates'
import type {
  GenerateCopyRequest,
  GenerateCopyResponse,
  CopyGroup,
} from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 120

function renderContent(groups: CopyGroup[]): string {
  return groups
    .map(g => `## ${g.label}\n` + g.items.map((it, i) => `${i + 1}. ${it}`).join('\n'))
    .join('\n\n')
}

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json<GenerateCopyResponse>(
      { groups: [], error: 'Unauthorized' }, { status: 401 })
  }

  let body: GenerateCopyRequest
  try {
    body = (await req.json()) as GenerateCopyRequest
  } catch {
    return NextResponse.json<GenerateCopyResponse>(
      { groups: [], error: 'Invalid JSON body' }, { status: 400 })
  }

  const { store, purpose, sceneId, sceneDesc, instructions, linkedImageAssetId } = body
  if (!store || !purpose || !PLATFORM_GROUPS[purpose]) {
    return NextResponse.json<GenerateCopyResponse>(
      { groups: [], error: 'Missing or invalid store/purpose' }, { status: 400 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json<GenerateCopyResponse>(
      { groups: [], error: '未設定 ANTHROPIC_API_KEY，無法產生文案' }, { status: 502 })
  }

  const scene = sceneId && sceneId !== 'freeform' ? getSceneById(sceneId) : undefined
  const sceneContext = scene?.promptBody ?? (sceneDesc?.trim() || undefined)

  let linkedImagePrompt: string | undefined
  if (linkedImageAssetId) {
    const { data: img } = await supabase
      .from('assets').select('prompt_used').eq('id', linkedImageAssetId).single()
    linkedImagePrompt = img?.prompt_used ?? undefined
  }

  const model = PURPOSE_MODEL_MAP[purpose]
  const specs = PLATFORM_GROUPS[purpose]
  const brief = buildCopyBrief({ purpose, store, sceneContext, instructions, linkedImagePrompt })

  const properties: Record<string, unknown> = {}
  for (const s of specs) {
    properties[s.key] = {
      type: 'array',
      minItems: s.min,
      maxItems: s.max,
      items: { type: 'string' },
      description: `${s.label}：${s.guidance}`,
    }
  }
  const tool = {
    name: 'submit_copy',
    description: '依平台規格回傳分組文案',
    input_schema: {
      type: 'object' as const,
      properties,
      required: specs.map(s => s.key),
    },
  }

  async function callClaude() {
    return getAnthropic().messages.create({
      model,
      max_tokens: 4096,
      system: [{ type: 'text', text: COPYWRITER_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: [tool],
      tool_choice: { type: 'tool', name: 'submit_copy' },
      messages: [{ role: 'user', content: brief }],
    })
  }

  function extractGroups(msg: Awaited<ReturnType<typeof callClaude>>): CopyGroup[] | null {
    const block = msg.content.find(b => b.type === 'tool_use')
    if (!block || block.type !== 'tool_use') return null
    const input = block.input as Record<string, unknown>
    const groups: CopyGroup[] = []
    for (const s of specs) {
      const raw = input[s.key]
      if (!Array.isArray(raw) || raw.length === 0) return null
      groups.push({ key: s.key, label: s.label, items: raw.map(String) })
    }
    return groups
  }

  let groups: CopyGroup[] | null
  try {
    groups = extractGroups(await callClaude())
    if (!groups) groups = extractGroups(await callClaude())
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Claude API 失敗'
    return NextResponse.json<GenerateCopyResponse>(
      { groups: [], error: message }, { status: 502 })
  }
  if (!groups) {
    return NextResponse.json<GenerateCopyResponse>(
      { groups: [], error: '模型輸出格式異常' }, { status: 502 })
  }

  const content = renderContent(groups)
  const { data: row, error: dbError } = await supabase
    .from('assets')
    .insert({
      user_id: user.id,
      type: 'copy',
      store,
      purpose,
      content,
      prompt_used: brief,
      model_used: model,
      status: 'draft',
      source: 'ai_generated',
    })
    .select()
    .single()

  if (dbError || !row) {
    return NextResponse.json<GenerateCopyResponse>(
      { groups, error: `已產生文案但寫入失敗：${dbError?.message}` }, { status: 500 })
  }

  return NextResponse.json<GenerateCopyResponse>({
    assetId: row.id, purpose, groups, content,
  })
}
```

- [ ] **Step 2:** `npx tsc --noEmit` — expect 0 errors except possibly copy-tab (fixed next task).

- [ ] **Step 3:** Smoke: `curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/generate/copy -H "Content-Type: application/json" -d "{}"` → expect `401` (retry once after 3s if 404 while dev recompiles).

- [ ] **Step 4:** Commit only `app/api/generate/copy/route.ts`:
`git add app/api/generate/copy/route.ts && git commit -m "feat(v2): platform-group copy route, one asset per generation"`

---

### Task V7: copy-tab.tsx → v2

**Files:** Overwrite `components/generator/copy-tab.tsx`

- [ ] **Step 1:** Replace the entire file with:

```tsx
'use client'

import { useState, useRef } from 'react'
import { SCENE_TEMPLATES } from '@/lib/prompts/scene-templates'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PenLine, ImagePlus, X, Loader2, Copy as CopyIcon } from 'lucide-react'
import type { AssetStore, AssetPurpose, GenerateCopyRequest, GenerateCopyResponse, CopyGroup } from '@/types'

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

export function CopyTab() {
  const [store,        setStore]        = useState<AssetStore>('mattress')
  const [purpose,      setPurpose]      = useState<AssetPurpose>('meta_ads')
  const [sceneId,      setSceneId]      = useState<string | null>(null)
  const [sceneDesc,    setSceneDesc]    = useState('')
  const [instructions, setInstructions] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [groups,  setGroups]  = useState<CopyGroup[]>([])

  const isFreeformScene = sceneId === FREEFORM_SCENE_ID

  function handleSceneClick(id: string) {
    setSceneId(sceneId === id ? null : id)
    if (sceneId !== id) setSceneDesc('')
  }

  async function handleGenerate() {
    setError(null)
    setGroups([])
    setLoading(true)
    try {
      const payload: GenerateCopyRequest = {
        store,
        purpose,
        sceneId: sceneId && !isFreeformScene ? sceneId : undefined,
        sceneDesc: isFreeformScene ? sceneDesc.trim() || undefined : undefined,
        instructions: instructions.trim() || undefined,
      }
      const res = await fetch('/api/generate/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data: GenerateCopyResponse = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || `生成失敗（HTTP ${res.status}）`)
      setGroups(data.groups)
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失敗')
    } finally {
      setLoading(false)
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

      {/* Platform */}
      <div>
        <Label className="text-sm font-medium mb-2 block">投放平台</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PLATFORMS.map(p => (
            <button key={p.value} onClick={() => setPurpose(p.value)}
              className={`text-left px-4 py-3 rounded-lg border transition-colors ${
                purpose === p.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'}`}>
              <p className="font-medium text-sm">{p.label}</p>
              <p className={`text-xs mt-0.5 ${purpose === p.value ? 'opacity-70' : 'text-muted-foreground'}`}>{p.desc}</p>
            </button>
          ))}
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

      {groups.length > 0 && (
        <div className="space-y-4">
          <Label className="text-sm font-medium block">
            產生結果 <span className="font-normal text-muted-foreground text-xs">（已存草稿至素材庫）</span>
          </Label>
          {groups.map(g => (
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
    </div>
  )
}
```

- [ ] **Step 2:** `npx tsc --noEmit` — expect **0 errors** project-wide now.

- [ ] **Step 3:** Smoke: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/generator/copy` → expect `200` (preview mode active) or `307` (if auth on). Either is acceptable; report which.

- [ ] **Step 4:** Commit only `components/generator/copy-tab.tsx`:
`git add components/generator/copy-tab.tsx && git commit -m "feat(v2): copy-tab 4-platform UI + grouped results"`

---

### Task V8: Final verify + memory + push

- [ ] **Step 1:** `npx tsc --noEmit` → 0 errors.

- [ ] **Step 2:** Stop the background dev server, then `npx next build` → succeeds; route list includes `ƒ /api/generate/copy`. (Restart dev server after if preview still wanted.)

- [ ] **Step 3:** `git push origin master` — pushes all v1+v2 copy commits (preview-only files and `.claude/` stay unstaged/unpushed).

- [ ] **Step 4:** Update `C:\Users\frodo.MSI\.claude\projects\C--Users-frodo-MSI\memory\project_ai_marketing_platform.md`: mark copy generation API v2 done (4-platform model), note `ANTHROPIC_API_KEY` + migrations 002/003 are live-test prerequisites, note v2 superseded v1 (6-purpose). One MEMORY.md hook line if missing.

- [ ] **Step 5:** Report to user: tsc/build green; live generation needs ANTHROPIC_API_KEY + Supabase migrations 002 & 003 + valid Supabase keys. No success claim about live generation until verified.

## Self-Review

- Spec §1 platform taxonomy → V3. §2 platform groups → V5 `PLATFORM_GROUPS`. §3 role → V5 `COPYWRITER_SYSTEM_PROMPT`. §4 files all mapped (V3/V4b/V5/V6/V7). §5 contract → V3. §6 data flow → V6. §7 errors → V6. §8 out-of-scope: copy-tab no linkedImage UI (payload omits it), Phase-2 box → V7. §9 verify → per-task tsc/curl + V8 build. §10 prereqs → V4b NOT VALID + V8 Step 5. ✓
- Placeholder scan: none; all code complete. ✓
- Type consistency: `AssetPurpose` 4 values (V3) used in `PURPOSE_MODEL_MAP`/`PLATFORM_GROUPS` (V5), route (V6), copy-tab `PLATFORMS` (V7). `CopyGroup{key,label,items}` defined V3, produced V6 `extractGroups`, consumed V7. `GenerateCopyResponse{assetId?,purpose?,groups,content?,error?}` consistent V3/V6/V7. `buildCopyBrief`/`PLATFORM_GROUPS`/`PURPOSE_MODEL_MAP`/`COPYWRITER_SYSTEM_PROMPT` names match V5↔V6. Image route `purpose:'social_post'` (V4b) ∈ new union. No dangling `CopyVariant`. ✓
