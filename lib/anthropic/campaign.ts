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
  const userContent = `${axisAsContext(args.axis)}\n\n────\n以下為產出規格，請在嚴格遵守上方主軸的前提下完成：\n${brief}`
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
      messages: [{ role: 'user', content: userContent }],
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
