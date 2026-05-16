# Level 2 完整廣告 設計

- 日期：2026-05-16
- 狀態：已核准，待實作
- 範圍：AI 行銷平台 Phase 1 — gpt-image-1 直出含廣告文字的完稿圖

## 1. 目標

讓 image-tab 既有但 disabled 的「Level 2 完整廣告」可用：使用者填廣告標題（必填）/副標/背書/賣點，gpt-image-1 直接產出**已含文字排版的完稿廣告圖**（非 Level 1 留白底圖），自動存入素材庫。

## 2. 決策摘要

| 項目 | 決策 |
|------|------|
| 文字生成方式 | 模型直出：文字寫進 prompt，gpt-image-1 直接畫進圖（接受中文字形可能誤差，符合現 UI「直出含文字完稿」意圖）|
| 必填欄位 | 僅「廣告標題」(`adContent.title`)；副標/背書/賣點皆選填 |
| 影像數量/尺寸 | 沿用現有：n:3、SizePreset→gpt-image-1 尺寸映射不變 |
| 儲存 | 沿用現有 asset 寫入；`image_level='level2_complete'` |
| 伺服器端疊字 | 範圍外（Phase 2）；以獨立 `buildLevel2Prompt` 函式作為日後切換點 |

## 3. 契約擴充（types/index.ts）

`GenerateImageRequest` 新增：

```ts
export interface AdContent {
  title: string
  subtitle?: string
  endorsement?: string
  features?: { title: string; subtitle?: string }[]
}

// 加入 GenerateImageRequest：
  level: 'level1' | 'level2'
  adContent?: AdContent
```

route 對缺少 `level` 的請求視為 `'level1'`（向後相容；目前唯一呼叫者是 image-tab，會明確帶 level）。

## 4. Prompt 與 Negative（lib/prompts/）

### 4.1 brand-knowledge.ts 新增

```ts
export const LEVEL2_NEGATIVE_PROMPT = `No watermarks, no logos, no people, no plastic 3D render style, no over-saturation, no cartoon style. Do not add any text other than the exact copy provided. Render all Chinese characters accurately and legibly — no garbled, distorted, or invented glyphs.`.trim()
```

（相對 `NEGATIVE_PROMPT`：移除 "No text"，新增「除提供文案外不得有多餘文字、繁中字形需正確」。）

### 4.2 scene-templates.ts 新增 `buildLevel2Prompt`

輸入：`{ mode, sceneTemplate?, freeformDescription?, stylePreset, additionalNotes?, adContent }`。
組成：
1. 場景描述（同 `buildPrompt`：scene `promptBody` / freeform / reference 同樣三分支）。
2. 風格修飾（同 `buildPrompt` 的 `STYLE_MODIFIERS`）。
3. `additionalNotes`（若有）。
4. **Level 2 指示區塊**（取代 Level 1 留白句）：說明這是完稿廣告，需把下列繁中文字以乾淨、專業、可讀的排版整合進畫面，產品仍為主角：
   - 主標題：`adContent.title`（畫面主視覺文字）
   - 副標題：`adContent.subtitle`（若有，次級）
   - 背書標語：`adContent.endorsement`（若有，小型信任標示）
   - 產品賣點：`adContent.features`（若有，最多 3 條 callout，各含標題與副說明）
   - 排版要求：文字高對比、清晰易讀、專業廣告版面、與場景光影協調。
5. 結尾附 `LEVEL2_NEGATIVE_PROMPT`（非 `NEGATIVE_PROMPT`）。

`buildPrompt`（Level 1）維持不動。

## 5. Route（app/api/generate/image/route.ts）

- 從 body 取 `level`、`adContent`；`const lvl = level === 'level2' ? 'level2' : 'level1'`。
- `lvl === 'level2'`：
  - 驗證 `adContent?.title?.trim()`，缺 → 400 `{ assets:[], error:'Level 2 需填廣告標題' }`。
  - `prompt = buildLevel2Prompt({ mode, sceneTemplate, freeformDescription, stylePreset, additionalNotes, adContent })`。
  - asset 寫入 `image_level: 'level2_complete'`。
- 否則維持現狀：`buildPrompt(...)`、`image_level:'level1_base'`。
- 其餘（n:3、`parsePreset` 尺寸映射、R2 上傳、asset 欄位、錯誤分支 401/400/502/500）完全不變。`prompt_used` = 實際使用的 prompt。

## 6. image-tab.tsx

- `buildRequest(sizePreset)`：加 `level`（用既有 `level` state），`level==='level2'` 時組 `adContent`：`title=adTitle.trim()`、`subtitle/endorsement` 空則省略、`features = adFeatures.filter(f => f.title.trim())`（再 trim；空陣列則省略）。
- 解除 Level 2：移除 `<Button disabled={... || level === 'level2' || ...}>` 中的 `level === 'level2'`；移除 amber「Level 2 完整廣告…尚未串接」提示段落；按鈕文案 Level 2 顯示「產生完整廣告（N 次 API 呼叫）」。
- 驗證：`level==='level2' && !adTitle.trim()` → 按鈕 disabled 並於按鈕下方顯示一行提示「Level 2 需先填廣告標題」。
- 既有結果 grid、loading、error 區塊兩個 level 共用，不需改。

## 7. 錯誤處理

| 情境 | 行為 |
|------|------|
| level2 缺廣告標題（後端） | 400 `{assets:[], error:'Level 2 需填廣告標題'}` |
| level2 缺標題（前端） | 按鈕 disabled + 行內提示，不發請求 |
| 其餘 401/400/502/500 | 沿用現有 image route 行為，不變 |

## 8. 測試與驗收

- `npx tsc --noEmit` 0 錯誤；`npx next build` 通過，`ƒ /api/generate/image` 仍在。
- 未登入 `curl -X POST /api/generate/image` → 401。
- `curl` 帶 `{"level":"level2"}` 但無 adContent.title（且能過認證的情境）邏輯上回 400（實機需登入；至少型別/編譯與分支可由 build 驗證）。
- image-tab：切到 Level 2 時，未填標題按鈕停用＋提示；填標題後可送出；既有結果 grid 正常顯示。
- 實際產圖需有效 `OPENAI_API_KEY`（前置依賴，不擋 build/型別驗收）。

## 9. 範圍外（Phase 2，架構留門）

- 伺服器端精準疊字（sharp/canvas）— `buildLevel2Prompt` 獨立函式即為日後替換點。
- 逐賣點精準像素級版面控制。
- reference 模式真正吃上傳圖（沿用既有 reference 文字描述分支）。

## 10. 前置依賴（不擋實作，影響 live 實測）

有效 `OPENAI_API_KEY`；Supabase 金鑰有效且 migration 已套用（與既有圖片生成相同前置）。
