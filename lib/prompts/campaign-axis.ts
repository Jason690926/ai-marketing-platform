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
    `本次文案的最高指導原則——核心訴求、切角與賣點必須明確反映以下主軸，不可只是語氣沾邊：`,
    `- 大創意：${axis.big_idea}`,
    `- 主打賣點：${axis.selling_points.join('、')}`,
    `- 語氣/切角：${axis.tone}`,
    `- 受眾/情境：${axis.audience}`,
    `寫作時請以「大創意」為主軸核心、「主打賣點」為必帶賣點，明確體現於標題與內文。`,
  ].join('\n')
}
