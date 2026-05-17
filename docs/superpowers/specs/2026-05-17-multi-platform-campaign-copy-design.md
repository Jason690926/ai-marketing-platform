# 多平台活動文案（Campaign Copy）設計

- 日期：2026-05-17
- 狀態：設計已確認，待寫實作計畫
- 範圍：文案產生器 + 素材庫 + 資料模型

## 1. 問題與動機

目前文案產生器一次只能選**一個平台**，要對同一檔活動產出 Meta、Google、貼文等多平台文案，必須重跑多次、每次重填相同 brief（門市/場景/指示）。

真正痛點不是 token（system prompt 已掛 `cache_control: ephemeral`，大塊品牌知識/護欄跨呼叫已命中快取；每平台輸出 token 是成品本身，不可省）。痛點是：

1. **UX 摩擦**：重複描述同一主軸。
2. **跨平台一致性**：分次獨立生成會讓 campaign 切角/賣點發散。

解法：先由 brief 生成一份**結構化核心創意主軸**，再以該主軸衍生各平台文案；主軸獨立成「活動」記錄、可重用。

## 2. 已確認的設計決策

| 主題 | 決策 |
|------|------|
| 互動模型 | 預設一鍵到底（主軸→全部選取平台）；結果頁可展開**編輯主軸並重衍生**，重衍生**不重花主軸 token** |
| 主軸形態 | 結構化：`大創意` + `主打賣點[]` + `語氣/切角` + `受眾/情境` |
| 資料組織 | Campaign 活動群組：主軸獨立成記錄，各平台 asset 掛其下，主軸可重用補新平台 |
| 刪活動 | `ON DELETE SET NULL`（保留已產文案，僅脫離群組） |
| 產生器模式 | 不保留單平台快速模式，copy-tab 一律走活動流程；單選即「單平台活動」 |
| 素材庫活動卡 | 預設收合 |
| 素材庫時間 | 顯示日期 + 期間篩選（本月 / 近 30 天 / 自訂區間） |

## 3. 資料模型

新 migration `supabase/migrations/004_campaigns.sql`（沿用 001–003 additive 風格）。

### `campaigns` 表

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | UUID PK `DEFAULT uuid_generate_v4()` | |
| `user_id` | UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE | RLS 依此 |
| `store` | TEXT NOT NULL DEFAULT 'mattress' CHECK (store IN ('mattress','bedding')) | |
| `big_idea` | TEXT NOT NULL | 大創意一句話 |
| `selling_points` | TEXT[] NOT NULL DEFAULT '{}' | 主打賣點 |
| `tone` | TEXT NOT NULL | 語氣/切角 |
| `audience` | TEXT NOT NULL | 受眾/情境 |
| `scene_id` | TEXT | 原始 brief（重衍生/追溯） |
| `scene_desc` | TEXT | 原始 brief |
| `instructions` | TEXT | 原始 brief |
| `model_used` | TEXT | 產主軸用的模型 |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | 時間標記來源 |

- 索引：`idx_campaigns_user_id (user_id)`、`idx_campaigns_created_at (created_at DESC)`
- RLS：`ENABLE ROW LEVEL SECURITY`；select/insert/update own，policy 用 `auth.uid() = user_id`（與 assets 同 pattern）

### 擴充 `assets`

```sql
ALTER TABLE assets ADD COLUMN IF NOT EXISTS campaign_id UUID
  REFERENCES campaigns(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_assets_campaign_id ON assets(campaign_id);
```

- `campaign_id` 可為空 → 現有單平台文案/圖片與舊 `/api/generate/copy` 路徑完全不受影響（向後相容）。
- 主軸用扁平欄位（TEXT/TEXT[]）而非 JSON：符合本專案慣例、可查詢、RLS 單純、編輯點明確。

### 型別（`types/index.ts`）

- 新增 `Campaign` interface（對應上表）。
- `Asset` 加 `campaign_id: string | null`。

## 4. API

### 新端點 `POST /api/generate/campaign`

現有 `POST /api/generate/copy` **完全不動**（向後相容；UI 不再使用，但保留不破壞）。

**Request**
```ts
{
  store: AssetStore,
  platforms: AssetPurpose[],            // 勾選的多平台，至少 1
  sceneId?: string,
  sceneDesc?: string,
  instructions?: string,
  campaignId?: string,                  // 帶了＝重衍生/補平台
  axis?: { big_idea: string; selling_points: string[]; tone: string; audience: string }
                                        // 帶了（需同時帶 campaignId）＝編輯過主軸
}
```

**流程分支**

1. **新建活動**（無 `campaignId`）
   - ① Claude 呼叫（tool schema 產結構化主軸）→ insert `campaigns` 列。
   - ② 對 `platforms` 每個平台各一次呼叫；沿用既有 per-platform tool schema、`PURPOSE_MODEL_MAP`、`PLATFORM_GROUPS`、`buildCopyBrief`。`system`（已 cache）+ 主軸放獨立 cache 區塊 → 同批多平台重用主軸快取。成功者 insert asset（`type:'copy'`、`purpose:平台`、`campaign_id`、`status:'draft'`、`source:'ai_generated'`）。
2. **重衍生 / 補平台**（帶 `campaignId`，無 `axis`）
   - 讀既有 campaign 列（RLS 保證本人）→ **跳過 ①** → 只跑 ② 指定 `platforms`。補平台＝同端點帶該 `campaignId` + 新平台。
3. **編輯主軸後重衍生**（帶 `campaignId` + `axis`）
   - 先 `UPDATE campaigns` 為新 `axis` → 再跑 ② 指定 `platforms`（仍跳過 ①）。

**Response**
```ts
{
  campaignId: string,
  axis: { big_idea: string; selling_points: string[]; tone: string; audience: string },
  results: { purpose: AssetPurpose; groups: CopyGroup[]; assetId: string }[],
  errors:  { purpose: AssetPurpose; message: string }[]
}
```

**要點**
- 主軸 token 只在分支 1 花一次；分支 2/3 永不重跑 ①（落實「重衍生不重花主軸 token」）。
- 新增的僅「產主軸」prompt 與 tool schema；其餘沿用，不重造。

**取捨（已確認）**：因採純活動流程（無單平台快速模式），**即使只選一個平台也走分支 1**，仍會生成主軸（多一次 ① 呼叫）並建一筆 campaign。代價是每次文案生成多一次主軸推論；換得心智模型單一、無雙路徑維護、單素材日後也可補平台。此取捨已在設計討論中確認接受。

### 讀取端點

- 新增 `GET /api/campaigns`：回傳本人 campaigns + 各自掛的平台 assets（活動分組視圖用），`created_at DESC`。
- 既有 `GET /api/assets` 保留；新增 `from` / `to`（ISO 日期）查詢參數支援期間篩選，套用於 `created_at`。

## 5. UI

### 產生器 `components/generator/copy-tab.tsx`

- 投放平台改**多選**（複選 toggle）；門市/情境場景/額外指示等 brief 欄位不變。
- 「產生文案」→ 呼叫 `/api/generate/campaign` 帶 `platforms[]`。
- 結果頁：
  - 頂部「核心創意主軸」卡，**預設收合**；展開可編輯 `大創意/主打賣點/語氣/受眾`，附「依此重新衍生」（帶 campaignId+axis，跳過①）。
  - 各平台一區塊：文案分組 + 「複製全部」 + 「重新生成此平台」（帶 campaignId、單平台、跳過①）。
  - 失敗平台另列一區 + 「重試此平台」。

### 素材庫 `components/library/library-client.tsx`

- 有 `campaign_id` 的素材收攏成**可展開活動卡**（**預設收合**）：顯示 `big_idea` + 日期 + 門市 + 平台數；展開看各平台文案（沿用既有 content 全文 + 複製鈕）。
- 無 `campaign_id` 的舊素材維持平鋪。
- 新增「期間」篩選（本月 / 近 30 天 / 自訂區間）；卡片與活動卡顯示日期。

## 6. 錯誤處理

| 情境 | 行為 |
|------|------|
| 主軸生成失敗（①） | 不寫 campaign、不衍生；502 + 訊息（原子性，不留半殘活動） |
| 某平台衍生失敗（②） | 隔離進 `errors[]`，成功平台照存照回；可帶 `campaignId` 重試失敗平台 |
| 模型輸出格式異常 | 沿用現有「retry 一次」；二次仍失敗 → 進 `errors[]` |
| 缺 `ANTHROPIC_API_KEY` | 與現況一致 502 訊息，前置不呼叫 |
| `campaignId` 非本人/不存在 | RLS + 查無 → 404/403，不外洩他人活動 |
| 編輯主軸 `big_idea` 空 | 400 擋下（比照現有必填驗證） |
| `platforms[]` 空 | 400「請至少選一個平台」 |
| 部分成功 | HTTP 200 同時帶 `results` 與 `errors`；UI 綠/紅並陳，不視為整批失敗 |

## 7. 測試 / 相容性

**相容性**：全 additive，零破壞。`campaign_id` 可空、新表、新端點、新 prompt；`/api/generate/copy`、舊 assets、現行平鋪素材庫不受影響。`004` 用 `IF NOT EXISTS`/additive `ALTER`，新欄位可空故不需 NOT VALID。

**驗證關卡（沿用既定 gate）**
1. `npx tsc --noEmit` 0 錯誤
2. `npx next build` 通過
3. Supabase SQL Editor 手動跑 `004_campaigns.sql`（比照 002/003）
4. Live smoke（dev server）：
   - 多平台活動：產出 → 主軸＋各平台都存、素材庫活動分組（收合）、日期顯示、期間篩選
   - 編輯主軸重衍生：確認跳過①（主軸 token 不重花）
   - 事後補平台：同活動帶 `campaignId` 加新平台成功掛入
   - 部分失敗：一平台失敗其餘照存、失敗可重試
   - 向後相容：舊單素材（`campaign_id = NULL`）平鋪正常顯示

## 8. 不做（YAGNI）

- 不保留單平台快速模式 / 不維護雙路徑。
- 不引入 JSON 欄位、不做活動級審核流程、不做時間軸式分組視圖（僅期間篩選）。
- 不改動圖片生成、不改 `/api/generate/copy`。
