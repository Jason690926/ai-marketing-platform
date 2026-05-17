# 多平台活動文案（Workstream B）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓使用者勾選多個投放平台、由一個結構化創意主軸一次衍生多平台文案；單選平台維持零額外成本的快速單素材路徑。

**Architecture:** 新增 `campaigns` 表存結構化主軸 + `assets.campaign_id`(ON DELETE SET NULL)。新端點 `/api/generate/campaign` 依勾選平台數自動分流（1=不生主軸快速路徑、≥2=主軸→衍生活動流程，支援重衍生/編輯主軸/補平台）。`/api/campaigns` 供素材庫活動分組。產生器改平台多選＋結果頁雙模式；素材庫活動分組(預設收合)＋期間篩選。沿用既有 `PURPOSE_MODEL_MAP`/`PLATFORM_GROUPS`/`buildCopyBrief`/`COPYWRITER_SYSTEM_PROMPT` 與 prompt caching。

**Tech Stack:** Next.js 14 App Router、TypeScript、Supabase(PostgreSQL+RLS)、Anthropic SDK、shadcn/ui、Tailwind。

**驗證關卡（本專案既定，無單元測試框架，勿引入）：** 每個 code 任務以 `npx tsc --noEmit`（0 錯誤）＋ `npx next build`（通過）為閘門；DB/流程任務追加 dev server live smoke。

---

## File Structure

| 檔案 | 動作 | 責任 |
|------|------|------|
| `supabase/migrations/004_campaigns.sql` | Create | campaigns 表 + assets.campaign_id + 索引 + RLS |
| `types/index.ts` | Modify | 新增 `Campaign`、`CampaignAxis`；`Asset` 已含 `campaign_id`（前次已加，確認）；新增 campaign API 請求/回應型別 |
| `lib/prompts/campaign-axis.ts` | Create | 主軸 system prompt + `submit_axis` tool schema + `buildAxisBrief()` |
| `lib/anthropic/campaign.ts` | Create | `generateAxis()`、`derivePlatform()`（封裝 Claude 呼叫，沿用既有 helper） |
| `app/api/generate/campaign/route.ts` | Create | 4 分支端點（0 快速單素材／1 新活動／2 重衍生補平台／3 編輯主軸重衍生） |
| `app/api/campaigns/route.ts` | Create | GET 本人 campaigns + 掛載 assets |
| `app/api/assets/route.ts` | Modify | 新增 `from`/`to` 日期篩選參數 |
| `components/generator/copy-tab.tsx` | Modify | 平台單選→多選；呼叫 campaign 端點；結果頁雙模式（單素材／活動） |
| `components/library/library-client.tsx` | Modify | 活動分組卡(預設收合)＋日期顯示＋期間篩選 |

---

## Task 1: DB migration — campaigns 表與 assets.campaign_id

**Files:**
- Create: `supabase/migrations/004_campaigns.sql`

- [ ] **Step 1: 建立 migration 檔**

`supabase/migrations/004_campaigns.sql`：
```sql
-- v2.1: campaigns hold a structured creative axis; copy assets can hang under one.
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store TEXT NOT NULL DEFAULT 'mattress' CHECK (store IN ('mattress', 'bedding')),
  big_idea TEXT NOT NULL,
  selling_points TEXT[] NOT NULL DEFAULT '{}',
  tone TEXT NOT NULL,
  audience TEXT NOT NULL,
  scene_id TEXT,
  scene_desc TEXT,
  instructions TEXT,
  model_used TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at DESC);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own campaigns"
  ON campaigns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own campaigns"
  ON campaigns FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own campaigns"
  ON campaigns FOR UPDATE USING (auth.uid() = user_id);

ALTER TABLE assets ADD COLUMN IF NOT EXISTS campaign_id UUID
  REFERENCES campaigns(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_assets_campaign_id ON assets(campaign_id);
```

- [ ] **Step 2: 語法檢查（離線，不需連線）**

Run: `node -e "const f=require('fs').readFileSync('supabase/migrations/004_campaigns.sql','utf8'); if(!/CREATE TABLE IF NOT EXISTS campaigns/.test(f)||!/assets ADD COLUMN IF NOT EXISTS campaign_id/.test(f)) throw new Error('missing core DDL'); console.log('004 DDL OK')"`
Expected: 印出 `004 DDL OK`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/004_campaigns.sql
git commit -m "feat(db): 004 campaigns table + assets.campaign_id"
```

> 註：實際套用由使用者在 Supabase SQL Editor 手動執行（比照 002/003），列入最終 live smoke 前置；本任務不需連線。

---

## Task 2: 型別定義

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: 確認 `Asset.campaign_id` 已存在**

Run: `grep -n "campaign_id" types/index.ts`
Expected: 已有 `campaign_id: string | null`（前次提交已加）。若無，於 `Asset` 介面 `prompt_used` 後加一行 `campaign_id: string | null`。

- [ ] **Step 2: 新增 Campaign 與 API 型別**

在 `types/index.ts` 末尾加入：
```ts
export interface CampaignAxis {
  big_idea: string
  selling_points: string[]
  tone: string
  audience: string
}

export interface Campaign extends CampaignAxis {
  id: string
  user_id: string
  store: AssetStore
  scene_id: string | null
  scene_desc: string | null
  instructions: string | null
  model_used: string | null
  created_at: string
}

export interface GenerateCampaignRequest {
  store: AssetStore
  platforms: AssetPurpose[]
  sceneId?: string
  sceneDesc?: string
  instructions?: string
  campaignId?: string
  axis?: CampaignAxis
}

export interface CampaignPlatformResult {
  purpose: AssetPurpose
  groups: CopyGroup[]
  assetId: string
}

export interface GenerateCampaignResponse {
  campaignId: string | null
  axis: CampaignAxis | null
  results: CampaignPlatformResult[]
  errors: { purpose: AssetPurpose; message: string }[]
}

export interface CampaignWithAssets {
  campaign: Campaign
  assets: Asset[]
}
```

- [ ] **Step 3: 型別閘門**

Run: `npx tsc --noEmit`
Expected: 0 錯誤（exit 0，無輸出）

- [ ] **Step 4: Commit**

```bash
git add types/index.ts
git commit -m "feat(types): Campaign + campaign generate API types"
```

---

## Task 3: 主軸 prompt 與 tool schema

**Files:**
- Create: `lib/prompts/campaign-axis.ts`

- [ ] **Step 1: 確認既有 copywriter prompt 名稱**

Run: `grep -n "export const COPYWRITER_SYSTEM_PROMPT\|export function buildCopyBrief\|PROHIBITED\|禁用" lib/prompts/copywriter.ts | head`
Expected: 取得 `COPYWRITER_SYSTEM_PROMPT` 實際匯出名與護欄段落位置（供主軸 prompt 沿用同護欄語氣）。

- [ ] **Step 2: 建立 campaign-axis.ts**

`lib/prompts/campaign-axis.ts`：
```ts
import type { AssetStore, CampaignAxis } from '@/types'

/** System prompt for distilling a brief into a reusable structured creative axis. */
export const AXIS_SYSTEM_PROMPT = `你是資深行銷策略人員。根據輸入 brief，提煉一個「核心創意主軸」，供後續各投放平台文案沿用以維持一致性。

嚴守護欄：禁醫療/療效宣稱；禁用詞：工廠直營、最便宜、破盤價、跳樓大拍賣、低價競爭。不得杜撰未提供的第三方/客戶/獎項背書。

輸出必須透過 submit_axis 工具，欄位：
- big_idea：一句話大創意（不含平台字眼）
- selling_points：3–6 個主打賣點（短語）
- tone：語氣/切角（如「熱血應援、口語」）
- audience：目標受眾/情境（如「看球熬夜的上班族」）`

export const AXIS_TOOL = {
  name: 'submit_axis',
  description: '回傳結構化核心創意主軸',
  input_schema: {
    type: 'object' as const,
    properties: {
      big_idea: { type: 'string' },
      selling_points: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 6 },
      tone: { type: 'string' },
      audience: { type: 'string' },
    },
    required: ['big_idea', 'selling_points', 'tone', 'audience'],
  },
}

export function buildAxisBrief(input: {
  store: AssetStore
  sceneContext?: string
  instructions?: string
}): string {
  const lines = [`門市類別：${input.store === 'mattress' ? '床墊' : '寢具'}`]
  if (input.sceneContext) lines.push(`情境場景：${input.sceneContext}`)
  if (input.instructions) lines.push(`額外指示：${input.instructions}`)
  return lines.join('\n')
}

/** Render an axis into the shared context block injected before per-platform derivation. */
export function axisAsContext(axis: CampaignAxis): string {
  return [
    `核心創意主軸（所有平台須一致沿用）：`,
    `- 大創意：${axis.big_idea}`,
    `- 主打賣點：${axis.selling_points.join('、')}`,
    `- 語氣/切角：${axis.tone}`,
    `- 受眾/情境：${axis.audience}`,
  ].join('\n')
}
```

- [ ] **Step 3: 型別閘門**

Run: `npx tsc --noEmit`
Expected: 0 錯誤

- [ ] **Step 4: Commit**

```bash
git add lib/prompts/campaign-axis.ts
git commit -m "feat(prompts): campaign axis system prompt + submit_axis tool"
```

---

## Task 4: Anthropic 封裝 — generateAxis / derivePlatform

**Files:**
- Create: `lib/anthropic/campaign.ts`

- [ ] **Step 1: 比對既有 copy route 的 Claude 呼叫慣例**

Run: `grep -n "getAnthropic\|messages.create\|cache_control\|tool_choice\|PURPOSE_MODEL_MAP\|PLATFORM_GROUPS\|buildCopyBrief\|extractGroups" app/api/generate/copy/route.ts`
Expected: 取得 `getAnthropic()` 來源、現有 per-platform tool 組法、`PURPOSE_MODEL_MAP`/`PLATFORM_GROUPS`/`buildCopyBrief` 匯入路徑、`extractGroups` 重試邏輯（本任務沿用，不重造）。

- [ ] **Step 2: 建立 campaign.ts**

`lib/anthropic/campaign.ts`（依 Step 1 結果調整 import 路徑；以下為預期形態）：
```ts
import { getAnthropic } from '@/lib/anthropic/client'
import { AXIS_SYSTEM_PROMPT, AXIS_TOOL, axisAsContext } from '@/lib/prompts/campaign-axis'
import { COPYWRITER_SYSTEM_PROMPT } from '@/lib/prompts/copywriter'
import { PURPOSE_MODEL_MAP, PLATFORM_GROUPS, buildCopyBrief } from '@/lib/prompts/copywriter'
import type { AssetPurpose, AssetStore, CampaignAxis, CopyGroup } from '@/types'

const AXIS_MODEL = 'claude-sonnet-4-6'

export async function generateAxis(args: {
  store: AssetStore
  briefText: string
}): Promise<{ axis: CampaignAxis; model: string }> {
  const msg = await getAnthropic().messages.create({
    model: AXIS_MODEL,
    max_tokens: 1024,
    system: [{ type: 'text', text: AXIS_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    tools: [AXIS_TOOL],
    tool_choice: { type: 'tool', name: 'submit_axis' },
    messages: [{ role: 'user', content: args.briefText }],
  })
  const block = msg.content.find(b => b.type === 'tool_use')
  if (!block || block.type !== 'tool_use') throw new Error('主軸輸出格式異常')
  const a = block.input as Record<string, unknown>
  if (!a.big_idea || !Array.isArray(a.selling_points)) throw new Error('主軸輸出格式異常')
  return {
    axis: {
      big_idea: String(a.big_idea),
      selling_points: (a.selling_points as unknown[]).map(String),
      tone: String(a.tone ?? ''),
      audience: String(a.audience ?? ''),
    },
    model: AXIS_MODEL,
  }
}

/** Derive one platform's grouped copy, axis injected as a cached shared context block. */
export async function derivePlatform(args: {
  purpose: AssetPurpose
  store: AssetStore
  axis: CampaignAxis
  sceneContext?: string
  instructions?: string
}): Promise<CopyGroup[]> {
  const specs = PLATFORM_GROUPS[args.purpose]
  const properties: Record<string, unknown> = {}
  for (const s of specs) {
    properties[s.key] = {
      type: 'array', minItems: s.min, maxItems: s.max,
      items: { type: 'string' }, description: `${s.label}：${s.guidance}`,
    }
  }
  const tool = {
    name: 'submit_copy',
    description: '依平台規格回傳分組文案',
    input_schema: { type: 'object' as const, properties, required: specs.map(s => s.key) },
  }
  const brief = buildCopyBrief({
    purpose: args.purpose, store: args.store,
    sceneContext: args.sceneContext, instructions: args.instructions,
  })
  async function call() {
    return getAnthropic().messages.create({
      model: PURPOSE_MODEL_MAP[args.purpose],
      max_tokens: 4096,
      system: [
        { type: 'text', text: COPYWRITER_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: axisAsContext(args.axis), cache_control: { type: 'ephemeral' } },
      ],
      tools: [tool],
      tool_choice: { type: 'tool', name: 'submit_copy' },
      messages: [{ role: 'user', content: brief }],
    })
  }
  function extract(msg: Awaited<ReturnType<typeof call>>): CopyGroup[] | null {
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
  const groups = extract(await call()) ?? extract(await call())
  if (!groups) throw new Error('模型輸出格式異常')
  return groups
}
```

- [ ] **Step 3: 校正 import 後型別閘門**

Run: `npx tsc --noEmit`
Expected: 0 錯誤（若 `buildCopyBrief` 參數名不符，依 Step 1 grep 結果修正）

- [ ] **Step 4: Commit**

```bash
git add lib/anthropic/campaign.ts
git commit -m "feat(anthropic): generateAxis + derivePlatform helpers"
```

---

## Task 5: `/api/generate/campaign` 端點（4 分支）

**Files:**
- Create: `app/api/generate/campaign/route.ts`

- [ ] **Step 1: 對照既有 copy route 的 auth/scene 解析**

Run: `grep -n "supabase.auth.getUser\|getSceneById\|sceneContext\|createClient\|runtime\|maxDuration" app/api/generate/copy/route.ts`
Expected: 取得 auth guard、`sceneContext` 組法（sceneId→模板 / sceneDesc 自由描述）、`createClient` 來源、`runtime`/`maxDuration` 設定，本任務沿用。

- [ ] **Step 2: 建立 route**

`app/api/generate/campaign/route.ts`：
```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateAxis, derivePlatform } from '@/lib/anthropic/campaign'
import { getSceneById } from '@/lib/prompts/scene-templates'
import { buildAxisBrief } from '@/lib/prompts/campaign-axis'
import type {
  GenerateCampaignRequest, GenerateCampaignResponse,
  CampaignPlatformResult, CampaignAxis, AssetPurpose,
} from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 300

function err(message: string, status: number) {
  return NextResponse.json<GenerateCampaignResponse>(
    { campaignId: null, axis: null, results: [], errors: [] satisfies never[] as never, },
    { status },
  ) // overwritten below; see fail()
}
function fail(message: string, status: number) {
  return NextResponse.json<GenerateCampaignResponse & { error: string }>(
    { campaignId: null, axis: null, results: [], errors: [], error: message }, { status },
  )
}

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('Unauthorized', 401)

  let body: GenerateCampaignRequest
  try { body = (await req.json()) as GenerateCampaignRequest }
  catch { return fail('Invalid JSON body', 400) }

  const { store, platforms, sceneId, sceneDesc, instructions, campaignId } = body
  if (!store || !Array.isArray(platforms) || platforms.length === 0)
    return fail('請至少選一個平台', 400)

  const sceneContext = sceneId
    ? getSceneById(sceneId)?.description ?? sceneDesc
    : sceneDesc

  // ---- Branch 0: single platform, no campaign → fast standalone, no axis ----
  if (!campaignId && platforms.length === 1) {
    const purpose = platforms[0]
    try {
      // reuse derivePlatform with a trivial axis-less context by passing a minimal axis
      const minimalAxis: CampaignAxis = {
        big_idea: '', selling_points: [], tone: '', audience: '',
      }
      const groups = await derivePlatform({
        purpose, store, axis: minimalAxis, sceneContext, instructions,
      })
      const { data: row, error: dbErr } = await supabase.from('assets').insert({
        user_id: user.id, type: 'copy', store, purpose,
        content: groups.map(g => `【${g.label}】\n${g.items.join('\n')}`).join('\n\n'),
        prompt_used: buildAxisBrief({ store, sceneContext, instructions }),
        status: 'draft', source: 'ai_generated', campaign_id: null,
      }).select().single()
      if (dbErr || !row) return fail(`已產生但寫入失敗：${dbErr?.message}`, 500)
      return NextResponse.json<GenerateCampaignResponse>({
        campaignId: null, axis: null,
        results: [{ purpose, groups, assetId: row.id }], errors: [],
      })
    } catch (e) {
      return fail(e instanceof Error ? e.message : '生成失敗', 502)
    }
  }

  // ---- resolve axis: load existing campaign, or generate (branch 1) ----
  let axis: CampaignAxis
  let cid: string

  if (campaignId) {
    const { data: c } = await supabase
      .from('campaigns').select('*').eq('id', campaignId).single()
    if (!c) return fail('活動不存在或無權限', 404)
    if (body.axis) {
      // branch 3: edit axis then re-derive
      const { error: upErr } = await supabase.from('campaigns')
        .update({
          big_idea: body.axis.big_idea, selling_points: body.axis.selling_points,
          tone: body.axis.tone, audience: body.axis.audience,
        }).eq('id', campaignId)
      if (upErr) return fail(`主軸更新失敗：${upErr.message}`, 500)
      axis = body.axis
    } else {
      axis = {
        big_idea: c.big_idea, selling_points: c.selling_points,
        tone: c.tone, audience: c.audience,
      }
    }
    cid = campaignId
  } else {
    // branch 1: new campaign
    try {
      const { axis: a, model } = await generateAxis({
        store, briefText: buildAxisBrief({ store, sceneContext, instructions }),
      })
      const { data: c, error: cErr } = await supabase.from('campaigns').insert({
        user_id: user.id, store, big_idea: a.big_idea, selling_points: a.selling_points,
        tone: a.tone, audience: a.audience, scene_id: sceneId ?? null,
        scene_desc: sceneDesc ?? null, instructions: instructions ?? null, model_used: model,
      }).select().single()
      if (cErr || !c) return fail(`主軸寫入失敗：${cErr?.message}`, 500)
      axis = a
      cid = c.id
    } catch (e) {
      return fail(e instanceof Error ? e.message : '主軸生成失敗', 502)
    }
  }

  // ---- derive each platform (branches 1/2/3) ----
  const results: CampaignPlatformResult[] = []
  const errors: { purpose: AssetPurpose; message: string }[] = []
  for (const purpose of platforms) {
    try {
      const groups = await derivePlatform({ purpose, store, axis, sceneContext, instructions })
      const { data: row, error: dbErr } = await supabase.from('assets').insert({
        user_id: user.id, type: 'copy', store, purpose,
        content: groups.map(g => `【${g.label}】\n${g.items.join('\n')}`).join('\n\n'),
        prompt_used: buildAxisBrief({ store, sceneContext, instructions }),
        status: 'draft', source: 'ai_generated', campaign_id: cid,
      }).select().single()
      if (dbErr || !row) { errors.push({ purpose, message: dbErr?.message ?? 'DB insert failed' }); continue }
      results.push({ purpose, groups, assetId: row.id })
    } catch (e) {
      errors.push({ purpose, message: e instanceof Error ? e.message : '生成失敗' })
    }
  }
  return NextResponse.json<GenerateCampaignResponse>({ campaignId: cid, axis, results, errors })
}
```

- [ ] **Step 3: 移除暫用 `err()` 殘骸並型別閘門**

刪掉未使用的 `err()` 函式（只保留 `fail()`）。
Run: `npx tsc --noEmit`
Expected: 0 錯誤

- [ ] **Step 4: 建置閘門**

Run: `npx next build`
Expected: 通過，路由清單出現 `ƒ /api/generate/campaign`

- [ ] **Step 5: Commit**

```bash
git add app/api/generate/campaign/route.ts
git commit -m "feat(api): /api/generate/campaign with 4 auto-branches"
```

---

## Task 6: `/api/campaigns` 讀取端點

**Files:**
- Create: `app/api/campaigns/route.ts`

- [ ] **Step 1: 建立 route**

`app/api/campaigns/route.ts`：
```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { CampaignWithAssets, Campaign, Asset } from '@/types'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json<{ campaigns: CampaignWithAssets[]; error?: string }>(
    { campaigns: [], error: 'Unauthorized' }, { status: 401 })

  const { data: campaigns, error } = await supabase
    .from('campaigns').select('*').eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ campaigns: [], error: error.message }, { status: 500 })

  const ids = (campaigns ?? []).map(c => c.id)
  const { data: assets } = ids.length
    ? await supabase.from('assets').select('*').in('campaign_id', ids)
        .order('created_at', { ascending: false })
    : { data: [] as Asset[] }

  const out: CampaignWithAssets[] = (campaigns ?? []).map((c: Campaign) => ({
    campaign: c,
    assets: (assets ?? []).filter((a: Asset) => a.campaign_id === c.id),
  }))
  return NextResponse.json<{ campaigns: CampaignWithAssets[] }>({ campaigns: out })
}
```

- [ ] **Step 2: 閘門**

Run: `npx tsc --noEmit && npx next build`
Expected: tsc 0 錯誤；build 通過，出現 `ƒ /api/campaigns`

- [ ] **Step 3: Commit**

```bash
git add app/api/campaigns/route.ts
git commit -m "feat(api): GET /api/campaigns (campaigns + nested assets)"
```

---

## Task 7: `/api/assets` 期間篩選

**Files:**
- Modify: `app/api/assets/route.ts`

- [ ] **Step 1: 查目前查詢組法**

Run: `grep -n "searchParams\|query = supabase\|ilike\|limit\|created_at" app/api/assets/route.ts`
Expected: 取得既有 `query` 連鎖位置與 `searchParams` 解析段。

- [ ] **Step 2: 加入 from/to 過濾**

在既有 `const q = ...` 解析附近加：
```ts
const from = searchParams.get('from')
const to = searchParams.get('to')
```
在既有 `if (q) query = query.ilike('prompt_used', ...)` 之後加：
```ts
if (from) query = query.gte('created_at', from)
if (to)   query = query.lte('created_at', to)
```

- [ ] **Step 3: 閘門**

Run: `npx tsc --noEmit && npx next build`
Expected: tsc 0 錯誤；build 通過

- [ ] **Step 4: Commit**

```bash
git add app/api/assets/route.ts
git commit -m "feat(api): /api/assets from/to date range filter"
```

---

## Task 8: 產生器 UI — 平台多選 + 結果頁雙模式（首個使用者可見里程碑）

**Files:**
- Modify: `components/generator/copy-tab.tsx`

- [ ] **Step 1: 平台改多選 state**

將單一 `purpose` state 改為 `const [platforms, setPlatforms] = useState<AssetPurpose[]>(['meta_ads'])`；平台格子點擊 toggle 加入/移除（保留 ≥1 個，全空時不可送出）。沿用既有 `PLATFORMS` 清單與樣式 class，僅 active 判斷改為 `platforms.includes(p.value)`。

- [ ] **Step 2: 改呼叫 campaign 端點**

`handleGenerate` 改打 `/api/generate/campaign`，body：
```ts
const payload: GenerateCampaignRequest = {
  store, platforms,
  sceneId: sceneId && !isFreeformScene ? sceneId : undefined,
  sceneDesc: isFreeformScene ? sceneDesc.trim() || undefined : undefined,
  instructions: instructions.trim() || undefined,
}
```
回應型別改 `GenerateCampaignResponse`；新增 state：`const [resp, setResp] = useState<GenerateCampaignResponse | null>(null)`。送出前 `if (platforms.length === 0) { setError('請至少選一個平台'); return }`。

- [ ] **Step 3: 結果頁雙模式**

- `resp.campaignId === null`（單素材）：不顯示主軸卡；單一平台區塊顯示 `resp.results[0].groups`（沿用現有分組渲染 + 複製鈕 `navigator.clipboard.writeText`）。
- `resp.campaignId !== null`（活動）：頂部「核心創意主軸」可收合卡（預設收合，`useState(false)`），展開顯示 `resp.axis` 四欄為可編輯 input/textarea；按鈕「依此重新衍生」→ 再打 campaign 端點帶 `campaignId: resp.campaignId, axis: 編輯後值, platforms: 已選平台`。各平台一區塊渲染 `results`，每塊「複製全部」+「重新生成此平台」（帶 `campaignId`、`platforms:[該平台]`）。`resp.errors` 以紅框列出每個 `{purpose,message}`。

- [ ] **Step 4: 型別 + 建置閘門**

Run: `npx tsc --noEmit && npx next build`
Expected: tsc 0 錯誤；build 通過，`ƒ /generator/copy` 仍存在

- [ ] **Step 5: Commit**

```bash
git add components/generator/copy-tab.tsx
git commit -m "feat(ui): platform multi-select + dual-mode result panel"
```

---

## Task 9: 素材庫 — 活動分組 + 日期 + 期間篩選

**Files:**
- Modify: `components/library/library-client.tsx`

- [ ] **Step 1: 取活動資料**

新增 `useEffect` 載入 `/api/campaigns` → `campaigns: CampaignWithAssets[]`。既有 `/api/assets` 載入維持（用於無 campaign 的素材平鋪）。

- [ ] **Step 2: 期間篩選 UI**

篩選列加一個「期間」select：選項 `全部 / 本月 / 近 30 天 / 自訂`。選定後計算 `from`/`to`（ISO）：本月＝當月 1 日 00:00 起；近 30 天＝now-30d；自訂＝顯示兩個 date input。把 `from`/`to` 併入 `/api/assets` 查詢字串與 `/api/campaigns` 後端無 from/to 則前端以 `campaign.created_at` 過濾。

- [ ] **Step 3: 活動分組卡（預設收合）**

渲染順序：先列 `campaigns`（每個一張卡：顯示 `campaign.big_idea`、`new Date(created_at).toLocaleDateString()`、門市、`assets.length` 平台數；右側收合箭頭，`useState` 預設收合；展開後逐 asset 沿用前次已做的 content 全文 + 複製鈕區塊）。其後列 `campaign_id === null` 的素材平鋪（沿用現有卡片）。卡片與活動卡都顯示日期。

- [ ] **Step 4: 型別 + 建置閘門**

Run: `npx tsc --noEmit && npx next build`
Expected: tsc 0 錯誤；build 通過

- [ ] **Step 5: Commit**

```bash
git add components/library/library-client.tsx
git commit -m "feat(ui): library campaign grouping + date + period filter"
```

---

## Task 10: 整合 live smoke（需先套用 migration 004）

**Files:** 無（驗證任務）

- [ ] **Step 1: 套用 migration**

請使用者於 Supabase SQL Editor 貼上並執行 `supabase/migrations/004_campaigns.sql`（比照 002/003）。確認 `campaigns` 表與 `assets.campaign_id` 建立成功、無錯誤。

- [ ] **Step 2: 啟動 dev server**

Run: `npm run dev`（背景）
Expected: `Ready`，載入 `.env.local`

- [ ] **Step 3: 多平台活動冒煙**

登入後 `/generator/copy`：勾 **Meta 廣告 + 粉專貼文**，按產生。
Expected（看 dev server log + 畫面）：`POST /api/generate/campaign 200`；結果頁出現可收合主軸卡 + 2 個平台區塊；`/library` 出現 1 張收合活動卡（big_idea + 日期 + 2 平台）。

- [ ] **Step 4: 單平台快速路徑冒煙**

只勾 **LINE 推播**，按產生。
Expected：200；回應 `campaignId:null`；結果頁**無主軸卡**；`/library` 該筆為平鋪素材（非活動卡）。

- [ ] **Step 5: 編輯主軸重衍生 / 補平台 / 期間篩選冒煙**

在活動結果頁展開主軸、改 `big_idea`、按「依此重新衍生」→ Expected：200、新文案反映改動、dev log 無第二次主軸呼叫（分支 3 跳過①）。
帶該活動補一個新平台（Google 廣告）→ Expected：掛入同活動卡。
`/library` 期間選「本月」→ Expected：本月素材正常列出。

- [ ] **Step 6: 記錄結果並 commit（若有修正）**

將冒煙結果回報；如過程修 bug，逐項 `git commit`。

---

## Self-Review

**1. Spec coverage：**
- §3 資料模型 → Task 1、2 ✓
- §4 API 四分支 + Response 可空 → Task 5 ✓；讀取端點 → Task 6 ✓；/api/assets from/to → Task 7 ✓
- §5 UI 產生器雙模式 + 素材庫活動分組(收合)+期間 → Task 8、9 ✓
- §6 錯誤處理（單平台 502 / 主軸失敗不留半殘 / 平台隔離 errors[] / 必填 400 / 部分成功 200）→ Task 5 邏輯涵蓋 ✓
- §7 相容性 + 既定閘門 + live smoke → 各 Task 閘門 + Task 10 ✓
- §8/§9 不做長文/Workstream A → 計畫未涉及 ✓

**2. Placeholder scan：** 無 TBD/TODO；每 code 步驟含實際程式碼；live smoke 步驟含明確預期輸出。Task 5 Step 3 明確要求刪除暫用 `err()` 殘骸（避免死碼）。

**3. Type consistency：** `GenerateCampaignRequest/Response`、`CampaignAxis`、`CampaignPlatformResult`、`CampaignWithAssets`（Task 2 定義）於 Task 5/6/8/9 一致使用；`derivePlatform`/`generateAxis`（Task 4）簽章與 Task 5 呼叫一致；沿用既有 `PURPOSE_MODEL_MAP`/`PLATFORM_GROUPS`/`buildCopyBrief`/`getSceneById`/`getAnthropic` 皆以 grep 步驟先確認實際名稱再用，避免命名漂移。

修正：Task 5 初稿含暫用 `err()`，已於 Step 3 明列移除，避免與 `fail()` 並存的死碼。

---

## 已知前置依賴（非本計畫程式碼）
- migration 004 需使用者在 Supabase 手動套用（Task 10 Step 1）。
- `ANTHROPIC_API_KEY` 已於 `.env.local`（本 session 已驗證可用）。
