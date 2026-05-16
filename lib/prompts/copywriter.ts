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
