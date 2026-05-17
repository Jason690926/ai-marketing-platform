import OpenAI from 'openai'

let _client: OpenAI | null = null

export function getOpenAI(): OpenAI {
  if (_client) return _client
  _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
  return _client
}

export type ImageLevel = 'level1' | 'level2'

/**
 * Image model per level (env-overridable):
 *  - Level 1 情境圖（無文字）  → gpt-image-1.5
 *  - Level 2 完稿廣告（含中文）→ gpt-image-2（多語言文字渲染最強）
 * All three gpt-image models accept the 1024x1024 / 1024x1536 / 1536x1024
 * size subset we map to, so the size logic in the route stays unchanged.
 */
export function getImageModel(level: ImageLevel): string {
  return level === 'level2'
    ? process.env.OPENAI_IMAGE_MODEL_L2 ?? 'gpt-image-2'
    : process.env.OPENAI_IMAGE_MODEL_L1 ?? 'gpt-image-1.5'
}
