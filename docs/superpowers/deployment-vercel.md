# Vercel 部署 Runbook（Task 14）

- 日期：2026-05-16
- 狀態：準備完成，待執行（需有效金鑰與 Vercel 帳號）
- 目標：把 `ai-marketing-platform`（GitHub master）部署到 Vercel 並完成線上 smoke test

## 0. 已完成的部署準備（程式面，已 commit）

- 移除多餘的空 `next.config.mjs`，保留 `next.config.js`（內含 `images.remotePatterns`：`*.r2.dev`、`*.supabase.co`）。雙 config 會讓 Next 擇一、可能丟失設定，已修正。
- 不需要 `vercel.json`：Vercel 會自動辨識 Next.js 14（App Router），build 指令 `next build`、輸出自動處理。
- 本機 `npx next build` 通過，所有路由（含 `/api/generate/image`、`/api/generate/copy`、`/api/assets`）為 dynamic functions。

## 1. 前置依賴（部署前必須備齊）

| 項目 | 說明 |
|------|------|
| Vercel 帳號 | 個人帳號即可；建議用 GitHub 登入後直接 import repo |
| 有效 `OPENAI_API_KEY` | 圖片生成（gpt-image-1）必需，需 OpenAI 平台已啟用付費 |
| 有效 `ANTHROPIC_API_KEY` | 文案生成必需；Anthropic Console 另開 API key + 儲值（與 Claude 訂閱無關）|
| Supabase 專案金鑰有效 | `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`（目前 `.env.local` 內的 service role 疑似無效，需到 Supabase 後台重新取得正確值）|
| Cloudflare R2 金鑰 | `R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET_NAME`/`R2_PUBLIC_URL`（沿用現有 .env.local）|

## 2. Supabase 後台（部署前先做）

1. SQL Editor 依序執行：
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_copy_content.sql`
   - `supabase/migrations/003_purpose_v2.sql`
2. **登入帳號問題（重要）**：登入頁 `app/login/page.tsx` 是 **email + 密碼**（`signInWithPassword`），不是 Google SSO，且系統沒有任何帳號 → 部署後沒人能登入。解法擇一：
   - Supabase 後台 → Authentication → Users → Add user，手動建一個 email/密碼帳號給行銷部用；或
   - 後續改登入頁為 Supabase Google OAuth（另案，PRD 原規劃；不在本次範圍）。
3. 確認 Authentication → Providers 的 Email 已啟用。

## 3. Vercel 專案設定

1. vercel.com → Add New → Project → Import `Jason690926/ai-marketing-platform`。
2. Framework Preset：Next.js（自動偵測，勿改 build/output 指令）。
3. **Environment Variables**（Production 全部要設，值取自有效金鑰，**勿**直接照搬可能失效的舊值）：

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
ANTHROPIC_API_KEY
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
R2_PUBLIC_URL
NEXT_PUBLIC_APP_URL   ← 設成正式網域，例如 https://<project>.vercel.app（先部署取得網域後回填再 redeploy）
```

4. **絕對不要**在 Vercel 設 `PREVIEW_NO_AUTH` —— 那是本機免登入預覽用，線上必須保留登入保護。
5. 部署後若 `NEXT_PUBLIC_APP_URL` 先前填佔位值，更新成實際網域再 Redeploy。

## 4. 函式執行時間限制（重要付費注意）

- `app/api/generate/image/route.ts` 設 `maxDuration = 300`、`app/api/generate/copy/route.ts` 設 `maxDuration = 120`。
- Vercel **Hobby（免費）方案** serverless function 上限約 60s（預設更低）→ gpt-image-1 高品質 3 張可能逾時。
- 若要穩定跑圖片生成，需 **Vercel Pro**（支援到 300s），否則改小 `IMAGE_COUNT` 或降 quality（另案調整）。

## 5. 部署步驟（需使用者操作互動式登入）

方式 A（建議，GitHub 整合）：照第 3 節在 Vercel 網站 import，按 Deploy。之後 push master 自動部署。

方式 B（CLI）：在本機輸入框執行（互動式，需親自操作）：
```
! npx vercel login
! npx vercel --prod
```
（`npx vercel` 為下載類指令，依規矩執行前先查證 publisher。）

## 6. 上線後 smoke test 清單

1. 開 `https://<網域>/` → 應被導到 `/login`（未登入）。
2. 用第 2 步建立的帳號登入 → 進 `/generator/image`。
3. Level 1：選場景＋尺寸 → 產生底圖 → 應出現 3 張、可下載、素材庫看得到。
4. Level 2：填廣告標題 → 產生完整廣告 → 圖內含文字、`image_level=level2_complete`。
5. `/generator/copy`：選平台（如 Meta 廣告）→ 產生文案 → 分組結果出現、素材庫有 type=copy 的草稿。
6. `/library`：篩選 type/store/status、搜尋、下載皆正常。
7. 檢查 Supabase `assets` 表確實寫入；R2 bucket 有圖片物件。

## 7. 已知風險與回滾

- 任一金鑰無效 → 對應功能在 runtime 回 502/錯誤訊息（不會整站掛）。逐項在 Vercel env 修正後 Redeploy。
- 回滾：Vercel Deployments → 選上一個成功部署 → Promote to Production。
- master 上不含 preview 繞過，線上一定要登入；測試帳號務必先在 Supabase 建好。
