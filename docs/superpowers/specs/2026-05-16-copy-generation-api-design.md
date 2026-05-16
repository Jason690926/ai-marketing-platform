# 文案生成 API 設計（/api/generate/copy）

- 日期：2026-05-16
- 狀態：已核准，待實作
- 範圍：AI 行銷平台 Phase 1 — 文案生成後端 + copy-tab 串接

## 1. 目標

讓 copy-tab（UI 已完成、按鈕目前 disabled）能呼叫 Claude 產生品牌一致的繁體中文行銷文案，每次產出 3 個版本並自動存入中央素材庫，供行銷部後續審核與重用。

## 2. 決策摘要

| 項目 | 決策 |
|------|------|
| AI 供應商 | Claude（Anthropic API），按 token 另計費（與 Claude 訂閱無關，需 `ANTHROPIC_API_KEY` + Console 儲值） |
| 模型策略 | 可改的「用途→模型」設定表。預設：SEO 長文 / 品牌故事 / 商品介紹 → `claude-opus-4-7`；廣告 / 貼文 / Thread → `claude-sonnet-4-6` |
| 版本數 | 每次生成 3 個版本 |
| 儲存 | 生成即存，3 版本 = 3 筆 asset（status=draft）。需 migration 加 `content`、`model_used` 欄位 |
| 輸入來源 | 純文字（門市/用途/場景/額外指示）+ 可選連結已生成圖的 `prompt_used`（文字情境，零 vision 成本） |
| Vision/外部圖分析 | 本次不做（Phase 2）。架構保留選填 image 欄位，UI 上傳框標「即將推出」 |
| 取向 | A：結構化 JSON、單次呼叫產 3 版、非串流 |

## 3. 文案師角色設定（lib/prompts/copywriter.ts）

`COPYWRITER_SYSTEM_PROMPT` 包含 5 部分，並注入現有 `BRAND_KNOWLEDGE`：

1. **專業人設**：資深品牌行銷文案，專精高端家居 / 精品床墊，熟台灣市場。
2. **語言**：繁體中文、台灣在地用語；**禁簡體字與中國慣用語/思維**。
3. **品牌語氣**：高端內斂・信賴感 — 強調德國近百年工藝、飯店背書（圓山飯店、澳門威尼斯人）、健康睡眠；用詞克制不浮誇，像精品品牌，非叫賣式促銷。
4. **硬性禁用**：
   - 嚴格療效護欄：禁止「治療 / 改善病症 / 醫療等級 / 保證健康」等醫療或療效宣稱，避免台灣不實廣告（公平交易法）風險。
   - 不捏造未提供的數據、認證或事實。
   - 不浮濫促銷感、不灌水。
   - **不得抄襲競品文案或直接套用其句式；可參考競品訴求手法與切角，但須轉化為原創、更優、具 Musterring 差異化的內容**（突出本品牌獨有資產：德國工藝、飯店背書、核心材質、Oeko-Tex 認證）。
5. **依用途切文體**：廣告短促有力 / SEO 長文資訊結構化 / 品牌故事敘事 / Thread 口語短串 / 商品介紹規格導向 / 貼文社群口吻。

`PURPOSE_MODEL_MAP`：`Record<AssetPurpose, string>`，預設如決策摘要；集中於此檔，改設定即可換模型，不動其他程式。

## 4. 元件與檔案

| 檔案 | 內容 | 新增/修改 |
|------|------|-----------|
| `lib/anthropic/client.ts` | `getAnthropic()` 單例（仿 `lib/openai/client.ts`） | 新增 |
| `lib/prompts/copywriter.ts` | system prompt、`PURPOSE_MODEL_MAP`、各用途輸出 schema、`buildCopyBrief()` | 新增 |
| `supabase/migrations/002_copy_content.sql` | `ALTER TABLE assets ADD COLUMN content TEXT; ADD COLUMN model_used TEXT;` | 新增 |
| `types/index.ts` | `GenerateCopyRequest` / `GenerateCopyResponse` / `CopyVariant` | 修改 |
| `app/api/generate/copy/route.ts` | 主邏輯 | 新增 |
| `components/generator/copy-tab.tsx` | 接 API、loading、3 版卡片、複製按鈕、上傳框標 Phase 2 | 修改 |
| `package.json` | 新增依賴 `@anthropic-ai/sdk`（**安裝前查證 publisher 與安全性**） | 修改 |
| `.env.local` / `.env.local.example` | 新增 `ANTHROPIC_API_KEY` | 修改 |

## 5. 資料流

1. copy-tab 表單送出 → `POST /api/generate/copy`
   body：`{ store, purpose, sceneId?, sceneDesc?, instructions?, linkedImageAssetId? }`
2. route：`createClient()` 取 user；無 → 401。
3. 驗證必填 `store`、`purpose`；缺 → 400。
4. 若帶 `linkedImageAssetId`：查該 asset 的 `prompt_used`，作為文字情境（不送圖、零 vision）。
5. 依 `PURPOSE_MODEL_MAP[purpose]` 選模型。
6. 組訊息：system = `COPYWRITER_SYSTEM_PROMPT` + `BRAND_KNOWLEDGE`（靜態區塊開 prompt caching）；user = `buildCopyBrief()` 產生的結構化需求（用途、場景模板 promptBody 或自由描述、額外指示、連結圖情境）。
7. 單次 Anthropic 呼叫，用 tool input schema 約束輸出為「3 個版本、每版依該用途的欄位結構」。
8. 解析結果；解析失敗 → 以更嚴格指示重試 1 次；再失敗 → 502。
9. 每個版本：把結構化欄位組成可讀文字寫入 `content`，插入一筆 asset（`type` 依用途映射、`store`、`purpose`、`content`、`prompt_used`=brief、`model_used`、`status='draft'`、`source='ai_generated'`）。
10. 回 `GenerateCopyResponse { variants: CopyVariant[], error? }`，每個 variant 含 `assetId` 與結構化欄位供前端漂亮呈現。

## 6. 各用途輸出結構

| purpose | 結構欄位 | asset.type |
|---------|----------|-----------|
| ad | hook, headline, subhead, body, cta | copy |
| post | caption, hashtags[] | copy |
| thread | posts[]（每則短文） | thread_post |
| web_brand | title, body（敘事段落） | copy |
| web_product | title, spec_highlights[], body | copy |
| seo_article | title, meta_description, outline[], body | article |

DB `content` 存組合後的可讀文字（Markdown）；前端同時拿結構化欄位呈現。

## 7. API 契約（types/index.ts）

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
  fields: Record<string, string | string[]>  // 依用途結構
  content: string                              // 組合後可讀文字
}

export interface GenerateCopyResponse {
  variants: CopyVariant[]
  error?: string
}
```

## 8. 錯誤處理

| 情境 | 行為 |
|------|------|
| 未登入 | 401 `{ variants: [], error: 'Unauthorized' }` |
| 缺 store/purpose | 400 |
| Claude API 失敗 | 502，回模型錯誤訊息 |
| JSON 解析失敗 | 自動重試 1 次（更嚴格指示）；再失敗 502「模型輸出格式異常」 |
| 部分 DB 寫入失敗 | 回已成功 variants + error（比照 `/api/generate/image`） |
| 缺 `ANTHROPIC_API_KEY` | 502，明確提示需設定金鑰 |

route 設定：`export const runtime = 'nodejs'`、`export const maxDuration = 120`。

## 9. 成本控制

- 單次呼叫產 3 版，共用 system + 品牌知識 token。
- 靜態 system + `BRAND_KNOWLEDGE` 區塊啟用 Anthropic prompt caching，重複呼叫大幅降低輸入成本。
- 模型可經 `PURPOSE_MODEL_MAP` 調整；預設短文走較便宜的 Sonnet。
- `model_used` 落庫，便於日後成本對帳。

## 10. 本次範圍外（Phase 2，架構已留門）

- Vision / 外部上傳圖分析（copy-tab 上傳框標「即將推出」）。
- `linkedImageAssetId` 為 API 層能力（已實作於 route），但 **copy-tab MVP 不提供挑選已生成圖的 UI**；該欄位供 Phase 2「為這張圖寫文案」介面使用。本次前端一律不帶此欄位。
- 串流輸出。
- 單一版本「重新生成」。
- 手動「加入素材庫」（本設計改為自動存草稿）。

## 11. 測試與驗收

- `npx tsc --noEmit` 0 錯誤；`npx next build` 通過。
- 6 種用途各能產生 3 個結構正確的版本。
- Supabase 金鑰有效時：3 筆 asset 寫入，素材庫（/api/assets、library-client）能看到 type=copy/article/thread_post 的文案。
- 缺 `ANTHROPIC_API_KEY` 時優雅報錯，不致 crash。
- copy-tab：loading 狀態、3 版卡片、複製按鈕可用；上傳框顯示 Phase 2 標示。

## 12. 已知前置依賴（不擋本設計，但影響實測）

- Anthropic API 金鑰 + Console 儲值需另行設定。
- Supabase 金鑰先前疑似無效；migration 002 與落庫實測需待金鑰處理。
- `@anthropic-ai/sdk` 安裝前依使用者規矩先查證 publisher。
