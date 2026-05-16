# 文案生成 API 設計 v2（/api/generate/copy）

- 日期：2026-05-16（v2 取代 v1）
- 狀態：v2 已核准，執行中
- 範圍：AI 行銷平台 Phase 1 — 平台導向文案生成後端 + copy-tab 串接

> v2 變更原因：採用使用者提供的完整文案角色設定，改為「4 平台」交付模型，取代 v1 的 6-purpose / 固定 3 版設計。

## 1. 決策摘要（v2）

| 項目 | 決策 |
|------|------|
| AI | Claude（Anthropic API），按 token 另計費，需 `ANTHROPIC_API_KEY` |
| 平台分類 | `AssetPurpose` 改為 4 值：`google_ads` / `meta_ads` / `social_post`（粉專貼文）/ `line_push` |
| 模型 | `PURPOSE_MODEL_MAP` 可改；4 平台預設皆 `claude-sonnet-4-6`（長文用途已移除） |
| 產出模型 | 一次生成 = 一個平台的整包交付物 = **1 筆 asset**（非多筆）。`content` 存渲染後 Markdown，結構化分組回前端 |
| 字數上限 | 規則寫進 system prompt，模型自律；MVP 不做硬驗證（YAGNI） |
| 儲存 | 生成即存 1 筆 asset（status=draft），需 migration 加 `content`/`model_used`（002）與改 `purpose` CHECK（003） |
| 輸入 | 純文字（門市/平台/情境/額外指示）+ 可選連結已生成圖 `prompt_used`；vision 延後 |
| 取向 | 結構化 tool schema、單次呼叫、非串流 |

## 2. 平台輸出結構

| 平台 (`purpose`) | 群組 (key:數量) | 字數規則（中文） |
|------------------|-----------------|------------------|
| `google_ads` | short_headlines:15、long_headlines:5、descriptions:4、paths:2 | 短標≤15字、長標≤45字、說明≤45字、路徑≤7字（中文1字=2字元換算） |
| `meta_ads` | primary_text:5、headlines:5、descriptions:5、cta:1 | 主文≤60字、標題≤20字(FB feed≤13)、說明12-15字、CTA 三選一 |
| `social_post` | posts:3、hashtags:10-15 | 貼文150-300字、首句Hook、SEO/AEO/GEO、結尾互動/CTA |
| `line_push` | push_titles:3、push_bodies:3、cta:1 | 標題≤20字、內文≤100字、CTA≤8字 |

## 3. 文案師角色（lib/prompts/copywriter.ts → COPYWRITER_SYSTEM_PROMPT）

採用使用者提供的完整角色全文，含：人設（台中中清專賣店資深行銷文案、熟台灣消費者）、語氣（專業但溫暖，朋友推薦非推銷）、核心訊息（德國近百年工藝＋飯店級健康睡眠）、CTA 導向預約試躺/到店體驗、信任元素（圓山飯店/威尼斯人/1938）、**賣點四段排序（感受→技術→背書→CTA，全平台通用）**、禁用詞（工廠直營/最便宜/破盤價/跳樓大拍賣/低價競爭/過度醫療承諾）、各平台規格、SEO/AEO/GEO、共用規則（文案風格依用途自動切換、每組變體切不同切入角度）。

額外保留既有護欄：繁體中文台灣用語、嚴禁簡體與中國慣用語；嚴格療效/醫療宣稱禁令；`BRAND_KNOWLEDGE` 為唯一事實來源。

## 4. 元件與檔案（v2）

| 檔案 | 動作 |
|------|------|
| `lib/anthropic/client.ts` | 已建（T2，不動） |
| `package.json` / env | 已建（T1，不動） |
| `supabase/migrations/002_copy_content.sql` | 已建（T4，不動） |
| `types/index.ts` | 改 `AssetPurpose` 為 4 平台值；改 copy 回應型別為分組模型 |
| `supabase/migrations/003_purpose_v2.sql` | 新增：改 `assets_purpose_check`（用 NOT VALID 避免舊列驗證失敗） |
| `app/api/generate/image/route.ts` | 修：硬寫的 `purpose: 'post'` → `'social_post'`（避免違反新 CHECK） |
| `lib/prompts/copywriter.ts` | 改寫：v2 system prompt + `PLATFORM_GROUPS` + `PURPOSE_MODEL_MAP` + `buildCopyBrief` |
| `app/api/generate/copy/route.ts` | 改寫：依平台群組動態建 tool schema、單次呼叫、存 1 筆 asset |
| `components/generator/copy-tab.tsx` | 改寫：4 平台選擇、分組結果呈現、參考圖標 Phase 2 |

## 5. API 契約（types/index.ts v2）

```ts
export type AssetPurpose = 'google_ads' | 'meta_ads' | 'social_post' | 'line_push'

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

## 6. 資料流

copy-tab → `POST /api/generate/copy {store, purpose, sceneId?, sceneDesc?, instructions?, linkedImageAssetId?}` → 認證(401) → 驗證 store/purpose(400) → 缺 `ANTHROPIC_API_KEY`(502) → 解析情境（場景模板 promptBody 或 sceneDesc；linkedImageAssetId→prompt_used 文字）→ `PURPOSE_MODEL_MAP[purpose]` 選模型 → 依 `PLATFORM_GROUPS[purpose]` 動態組 tool input_schema（每群組 array、min/max、guidance）→ 單次 Anthropic 呼叫（system 開 prompt caching）→ 解析 tool_use（失敗重試 1 次，再失敗 502）→ 渲染 `content` Markdown → 插入 1 筆 asset（type=`copy`）→ 回 `{assetId, purpose, groups, content}`。

## 7. 錯誤處理

401 未登入｜400 缺/非法 store·purpose｜502 缺金鑰｜502 Claude 失敗｜解析失敗重試 1 次再 502｜DB 寫入失敗 500（回已產生 groups + error）。`runtime='nodejs'`、`maxDuration=120`。

## 8. 範圍外（Phase 2，架構留門）

vision/外部圖上傳分析（UI 標即將推出）；字數硬驗證；串流；單組重生；copy-tab 不提供 linkedImage 選圖 UI（API 已支援）。

## 9. 測試與驗收

`npx tsc --noEmit` 0 錯誤；最終 `npx next build` 通過且列出 `ƒ /api/generate/copy`；4 平台各能產出符合群組數量的結構；未登入 curl=401；缺金鑰優雅 502。

## 10. 前置依賴（不擋實作，影響實測）

`ANTHROPIC_API_KEY` + Console 儲值；Supabase 金鑰與 migrations 002/003 須於 Supabase 執行；既有舊 purpose 資料列（若有）需清理或靠 003 的 NOT VALID 容忍。
