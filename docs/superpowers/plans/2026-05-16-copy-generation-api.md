# Copy Generation API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `/api/generate/copy` (Claude-backed, 3 variants, auto-saved to the asset library) and wire it into the existing copy-tab UI.

**Architecture:** A Next.js Node route authenticates via Supabase, selects a Claude model per `purpose` from a configurable map, makes one Anthropic call constrained by a tool input schema to return 3 structured variants, persists each as a `draft` asset row, and returns structured fields to the UI. Static system + brand text uses Anthropic prompt caching.

**Tech Stack:** Next.js 14 (App Router, route handlers), TypeScript, `@anthropic-ai/sdk`, Supabase (`@supabase/ssr`), existing `lib/openai/client.ts` pattern.

**Testing note:** This project has **no unit-test runner** (no jest/vitest in `package.json`); the established verification pattern (see `/api/generate/image`) is `npx tsc --noEmit` + `npx next build` + manual route checks. This plan follows that existing pattern instead of introducing a test framework (out of spec scope). Each task ends with a concrete verification command and expected output.

**Spec:** `docs/superpowers/specs/2026-05-16-copy-generation-api-design.md`

---

### Task 1: Add Anthropic SDK dependency + env var

**Files:**
- Modify: `package.json`
- Modify: `.env.local`
- Modify: `.env.local.example`

- [ ] **Step 1: Verify publisher before install (user policy)**

Run an Agent/web check that `@anthropic-ai/sdk` on npm is published by Anthropic (npm page `https://www.npmjs.com/package/@anthropic-ai/sdk`, publisher "anthropic", repo `github.com/anthropics/anthropic-sdk-typescript`). Do not proceed to Step 2 until confirmed official.
Expected: confirmed Anthropic-official package.

- [ ] **Step 2: Install the SDK**

Run: `npm install @anthropic-ai/sdk`
Expected: `package.json` dependencies gains `@anthropic-ai/sdk`, `npm install` exits 0.

- [ ] **Step 3: Add env var to example and local**

Append to `.env.local.example`:

```
# Anthropic (copy generation)
ANTHROPIC_API_KEY=
```

Append to `.env.local`:

```
# Anthropic (copy generation)
ANTHROPIC_API_KEY=
```

(Leave the local value blank; real key is supplied out-of-band. `.env.local` is gitignored.)

- [ ] **Step 4: Verify build still green**

Run: `npx tsc --noEmit`
Expected: no errors (same 0-error baseline as before).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.local.example
git commit -m "build: add @anthropic-ai/sdk dependency + ANTHROPIC_API_KEY env"
```

(`.env.local` is gitignored — not staged.)

---

### Task 2: Anthropic client singleton

**Files:**
- Create: `lib/anthropic/client.ts`

- [ ] **Step 1: Write the client**

```ts
import Anthropic from '@anthropic-ai/sdk'

let _client: Anthropic | null = null

export function getAnthropic(): Anthropic {
  if (_client) return _client
  _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  return _client
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/anthropic/client.ts
git commit -m "feat: add Anthropic client singleton"
```

---

### Task 3: API contract types

**Files:**
- Modify: `types/index.ts` (append at end of file)

- [ ] **Step 1: Append the types**

Add to the end of `types/index.ts`:

```ts
export interface GenerateCopyRequest {
  store: AssetStore
  purpose: AssetPurpose
  sceneId?: string
  sceneDesc?: string
  instructions?: string
  linkedImageAssetId?: string
}

export interface CopyVariant {
  assetId: string
  purpose: AssetPurpose
  fields: Record<string, string | string[]>
  content: string
}

export interface GenerateCopyResponse {
  variants: CopyVariant[]
  error?: string
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add types/index.ts
git commit -m "feat: add copy generation API contract types"
```

---

### Task 4: DB migration for copy content

**Files:**
- Create: `supabase/migrations/002_copy_content.sql`

- [ ] **Step 1: Write migration**

```sql
-- Copy/article assets need a text body and the model that produced them.
ALTER TABLE assets ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS model_used TEXT;
```

- [ ] **Step 2: Verify SQL is well-formed (syntax read-through)**

No DB connection assumed in this environment. Confirm by reading: two idempotent `ADD COLUMN IF NOT EXISTS` statements, no constraints that could fail on existing rows (both nullable).
Expected: file matches above exactly.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/002_copy_content.sql
git commit -m "feat: migration add assets.content and assets.model_used"
```

> Operational note (not a code step): this migration must be run in the Supabase SQL editor before copy persistence works in a live environment. Recorded in spec §12.

---

### Task 5: Copywriter prompts, model map, output schemas, brief builder

**Files:**
- Create: `lib/prompts/copywriter.ts`

- [ ] **Step 1: Write the copywriter module**

```ts
import type { AssetPurpose } from '@/types'
import { BRAND_KNOWLEDGE } from './brand-knowledge'

/** Configurable purpose -> Claude model map. Change here only; no other code edits. */
export const PURPOSE_MODEL_MAP: Record<AssetPurpose, string> = {
  ad:          'claude-sonnet-4-6',
  post:        'claude-sonnet-4-6',
  thread:      'claude-sonnet-4-6',
  web_brand:   'claude-opus-4-7',
  web_product: 'claude-opus-4-7',
  seo_article: 'claude-opus-4-7',
}

/** purpose -> assets.type */
export const PURPOSE_ASSET_TYPE: Record<AssetPurpose, 'copy' | 'article' | 'thread_post'> = {
  ad:          'copy',
  post:        'copy',
  web_brand:   'copy',
  web_product: 'copy',
  thread:      'thread_post',
  seo_article: 'article',
}

/** Per-purpose output field keys the model must return for each variant. */
export const PURPOSE_FIELDS: Record<AssetPurpose, string[]> = {
  ad:          ['hook', 'headline', 'subhead', 'body', 'cta'],
  post:        ['caption', 'hashtags'],
  thread:      ['posts'],
  web_brand:   ['title', 'body'],
  web_product: ['title', 'spec_highlights', 'body'],
  seo_article: ['title', 'meta_description', 'outline', 'body'],
}

export const COPYWRITER_SYSTEM_PROMPT = `
你是一位資深品牌行銷文案，專精高端家居與精品床墊，深諳台灣市場。

語言：一律使用繁體中文與台灣在地用語。嚴禁簡體字、中國大陸慣用語或思維。

品牌語氣：高端內斂、具信賴感。強調德國近百年工藝、飯店背書（圓山飯店、澳門威尼斯人酒店）、健康睡眠體驗。用詞克制、不浮誇，呈現精品品牌質感，而非叫賣式促銷。

絕對禁止：
- 療效或醫療宣稱：不得出現「治療、改善病症、醫療等級、保證健康」等字眼或暗示，避免台灣不實廣告（公平交易法）風險。
- 不得捏造未提供的數據、認證或事實；僅能使用品牌知識中明列的資訊。
- 不浮濫促銷感、不灌水湊字數。
- 不得抄襲競品文案或直接套用其句式。可參考競品的訴求手法與切角，但必須轉化為原創、更優、且具 Musterring 差異化的內容（突出本品牌獨有資產：德國工藝、飯店背書、核心材質、Oeko-Tex 認證）。

依用途切換文體：廣告短促有力；SEO 長文資訊結構化且符合搜尋意圖；品牌故事敘事性；Thread 口語化短串；商品介紹規格導向；社群貼文親切社群口吻。

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
  const parts: string[] = [
    `文案用途：${input.purpose}`,
    `產品線：${storeLabel}`,
  ]
  if (input.sceneContext) parts.push(`情境場景：${input.sceneContext}`)
  if (input.linkedImagePrompt)
    parts.push(`對應視覺（請讓文案調性與此畫面一致）：${input.linkedImagePrompt}`)
  if (input.instructions) parts.push(`額外指示：${input.instructions}`)
  parts.push(
    `請產生 3 個彼此切角不同的版本，每個版本需包含欄位：${PURPOSE_FIELDS[input.purpose].join('、')}。`
  )
  return parts.join('\n')
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: no errors (imports `AssetPurpose`, `BRAND_KNOWLEDGE` both exist).

- [ ] **Step 3: Commit**

```bash
git add lib/prompts/copywriter.ts
git commit -m "feat: copywriter system prompt, model map, brief builder"
```

---

### Task 6: Copy generation route

**Files:**
- Create: `app/api/generate/copy/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAnthropic } from '@/lib/anthropic/client'
import {
  COPYWRITER_SYSTEM_PROMPT,
  PURPOSE_MODEL_MAP,
  PURPOSE_ASSET_TYPE,
  PURPOSE_FIELDS,
  buildCopyBrief,
} from '@/lib/prompts/copywriter'
import { getSceneById } from '@/lib/prompts/scene-templates'
import type {
  GenerateCopyRequest,
  GenerateCopyResponse,
  CopyVariant,
} from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 120

interface RawVariant {
  fields: Record<string, string | string[]>
}

function renderContent(fields: Record<string, string | string[]>): string {
  return Object.entries(fields)
    .map(([k, v]) => `## ${k}\n${Array.isArray(v) ? v.join('\n') : v}`)
    .join('\n\n')
}

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json<GenerateCopyResponse>(
      { variants: [], error: 'Unauthorized' }, { status: 401 })
  }

  let body: GenerateCopyRequest
  try {
    body = (await req.json()) as GenerateCopyRequest
  } catch {
    return NextResponse.json<GenerateCopyResponse>(
      { variants: [], error: 'Invalid JSON body' }, { status: 400 })
  }

  const { store, purpose, sceneId, sceneDesc, instructions, linkedImageAssetId } = body
  if (!store || !purpose || !PURPOSE_MODEL_MAP[purpose]) {
    return NextResponse.json<GenerateCopyResponse>(
      { variants: [], error: 'Missing or invalid store/purpose' }, { status: 400 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json<GenerateCopyResponse>(
      { variants: [], error: '未設定 ANTHROPIC_API_KEY，無法產生文案' }, { status: 502 })
  }

  // Scene context: template promptBody, freeform desc, or none.
  const scene = sceneId && sceneId !== 'freeform' ? getSceneById(sceneId) : undefined
  const sceneContext = scene?.promptBody ?? (sceneDesc?.trim() || undefined)

  // Optional linked image -> use its stored prompt text (zero vision cost).
  let linkedImagePrompt: string | undefined
  if (linkedImageAssetId) {
    const { data: img } = await supabase
      .from('assets').select('prompt_used').eq('id', linkedImageAssetId).single()
    linkedImagePrompt = img?.prompt_used ?? undefined
  }

  const model = PURPOSE_MODEL_MAP[purpose]
  const brief = buildCopyBrief({ purpose, store, sceneContext, instructions, linkedImagePrompt })

  const tool = {
    name: 'submit_copy',
    description: '回傳 3 個行銷文案版本',
    input_schema: {
      type: 'object' as const,
      properties: {
        variants: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: {
            type: 'object',
            properties: { fields: { type: 'object', description: `必含鍵：${PURPOSE_FIELDS[purpose].join(', ')}` } },
            required: ['fields'],
          },
        },
      },
      required: ['variants'],
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

  function extractVariants(msg: Awaited<ReturnType<typeof callClaude>>): RawVariant[] | null {
    const block = msg.content.find(b => b.type === 'tool_use')
    if (!block || block.type !== 'tool_use') return null
    const input = block.input as { variants?: RawVariant[] }
    if (!input.variants || input.variants.length === 0) return null
    return input.variants
  }

  let raw: RawVariant[] | null
  try {
    raw = extractVariants(await callClaude())
    if (!raw) raw = extractVariants(await callClaude()) // one retry
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Claude API 失敗'
    return NextResponse.json<GenerateCopyResponse>(
      { variants: [], error: message }, { status: 502 })
  }
  if (!raw) {
    return NextResponse.json<GenerateCopyResponse>(
      { variants: [], error: '模型輸出格式異常' }, { status: 502 })
  }

  const variants: CopyVariant[] = []
  for (const rv of raw) {
    const content = renderContent(rv.fields)
    const { data: row, error: dbError } = await supabase
      .from('assets')
      .insert({
        user_id: user.id,
        type: PURPOSE_ASSET_TYPE[purpose],
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
        { variants, error: `已產生文案但寫入失敗：${dbError?.message}` }, { status: 500 })
    }
    variants.push({ assetId: row.id, purpose, fields: rv.fields, content })
  }

  return NextResponse.json<GenerateCopyResponse>({ variants })
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify build registers the route**

Run: `npx next build`
Expected: build succeeds and route list shows `ƒ /api/generate/copy`.

- [ ] **Step 4: Runtime smoke (no key path)**

Start dev (`npm run dev`), then:
Run: `curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/generate/copy -H "Content-Type: application/json" -d '{}'`
Expected: `401` (unauthenticated — middleware/route guard returns before key check). This confirms the route is wired without needing a valid Claude key.

- [ ] **Step 5: Commit**

```bash
git add app/api/generate/copy/route.ts
git commit -m "feat: /api/generate/copy route (Claude, 3 variants, auto-save)"
```

---

### Task 7: Wire copy-tab to the API

**Files:**
- Modify: `components/generator/copy-tab.tsx`

- [ ] **Step 1: Add imports, state, and submit handler**

Replace the import line `import type { AssetStore, AssetPurpose } from '@/types'` with:

```tsx
import { Loader2, Copy as CopyIcon } from 'lucide-react'
import type { AssetStore, AssetPurpose, GenerateCopyRequest, GenerateCopyResponse, CopyVariant } from '@/types'
```

Inside `CopyTab()`, after the existing `fileInputRef` line, add:

```tsx
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [variants, setVariants] = useState<CopyVariant[]>([])

  async function handleGenerate() {
    setError(null)
    setVariants([])
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
      setVariants(data.variants)
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失敗')
    } finally {
      setLoading(false)
    }
  }
```

- [ ] **Step 2: Mark the reference-image box as Phase 2**

Replace the label text line `參考圖片` (inside the `<Label>` for the upload section) and its sibling span with:

```tsx
          參考圖片
          <span className="font-normal text-muted-foreground ml-1">（即將推出 · Phase 2）</span>
```

And add `pointer-events-none opacity-50` to the upload drop `<div>`'s className (the `flex items-center gap-3 border-2 border-dashed ...` element) so it is visibly disabled.

- [ ] **Step 3: Replace the disabled button and add results UI**

Replace:

```tsx
      <Button className="w-full" size="lg" disabled>
        產生文案（API 串接中）
      </Button>
```

with:

```tsx
      <Button className="w-full" size="lg" onClick={handleGenerate} disabled={loading}>
        {loading
          ? <span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" />產生中...</span>
          : '產生文案（3 個版本）'}
      </Button>

      {error && (
        <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3">
          {error}
        </p>
      )}

      {variants.length > 0 && (
        <div className="space-y-3">
          <Label className="text-sm font-medium block">
            產生結果 <span className="font-normal text-muted-foreground text-xs">（{variants.length} 版・已存草稿至素材庫）</span>
          </Label>
          <div className="space-y-3">
            {variants.map((v, i) => (
              <div key={v.assetId} className="rounded-lg border border-border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">版本 {i + 1}</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(v.content)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <CopyIcon size={12} /> 複製
                  </button>
                </div>
                <pre className="whitespace-pre-wrap text-sm font-sans">{v.content}</pre>
              </div>
            ))}
          </div>
        </div>
      )}
```

- [ ] **Step 4: Verify type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Verify build**

Run: `npx next build`
Expected: build succeeds; `/generator/copy` still listed.

- [ ] **Step 6: Commit**

```bash
git add components/generator/copy-tab.tsx
git commit -m "feat: wire copy-tab to /api/generate/copy with 3-variant results"
```

---

### Task 8: Final verification + memory update

**Files:**
- Modify: `C:\Users\frodo.MSI\.claude\projects\C--Users-frodo-MSI\memory\project_ai_marketing_platform.md`

- [ ] **Step 1: Full type-check + build**

Run: `npx tsc --noEmit && npx next build`
Expected: 0 type errors; build succeeds; route list includes `ƒ /api/generate/copy`.

- [ ] **Step 2: Push code commits**

```bash
git push origin master
```

Expected: Tasks 1–7 commits pushed to `origin/master`.

- [ ] **Step 3: Update project memory**

In the memory file, move the `copy` row from "待完成" to a new completed entry: copy generation API + copy-tab wiring done, commit hash, note `ANTHROPIC_API_KEY` + Supabase migration 002 are operational prerequisites for live testing. Add one MEMORY.md hook line only if not already present.

- [ ] **Step 4: Report deferred/prereqs to user**

State plainly: code complete + build green; live generation needs (a) `ANTHROPIC_API_KEY` set in `.env.local`, (b) migration `002_copy_content.sql` run in Supabase, (c) valid Supabase keys. No success claim about live generation until those are verified.

---

## Self-Review

**1. Spec coverage:**
- §3 model strategy → Task 5 `PURPOSE_MODEL_MAP`. ✓
- §3 copywriter role (5 parts incl. strict efficacy guardrail + competitor wording) → Task 5 `COPYWRITER_SYSTEM_PROMPT`. ✓
- §4 files: anthropic client (T2), copywriter (T5), migration (T4), types (T3), route (T6), copy-tab (T7), package/env (T1). ✓
- §5 data flow incl. linkedImageAssetId → prompt_used → Task 6 Step 1. ✓
- §6 per-purpose output structure → Task 5 `PURPOSE_FIELDS`, Task 6 tool schema. ✓
- §7 contract types → Task 3. ✓
- §8 error handling (401/400/502/parse-retry/partial-insert/missing key) → Task 6 Step 1. ✓
- §9 cost control: single call 3 variants + prompt caching → Task 6 (`cache_control` on system). ✓
- §10 out of scope: copy-tab no linked-image picker (payload omits it), upload box Phase 2 label → Task 7 Steps 1–2. ✓
- §11 testing → tsc/build/curl gates per task; Task 8 final. ✓
- §12 prereqs → Task 4 note, Task 8 Step 4. ✓

**2. Placeholder scan:** No TBD/TODO; all code blocks complete; verification commands concrete. ✓

**3. Type consistency:** `GenerateCopyRequest/CopyVariant/GenerateCopyResponse` defined in Task 3, used identically in Tasks 6–7. `PURPOSE_MODEL_MAP/PURPOSE_ASSET_TYPE/PURPOSE_FIELDS/COPYWRITER_SYSTEM_PROMPT/buildCopyBrief` defined in Task 5, imported with same names in Task 6. `getAnthropic` (T2) used in T6. `getSceneById` already exists in `lib/prompts/scene-templates.ts` (verified this session). `assets.content`/`model_used` added in T4, written in T6. ✓

No gaps found.
