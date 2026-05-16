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
