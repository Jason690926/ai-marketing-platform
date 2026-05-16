import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAnthropic } from '@/lib/anthropic/client'
import {
  COPYWRITER_SYSTEM_PROMPT,
  PURPOSE_MODEL_MAP,
  PURPOSE_ASSET_TYPE,
  PURPOSE_FIELDS,
  buildCopyBrief,
} from '@/lib/prompts/copywriter'
import { getSceneById } from '@/lib/prompts/scene-templates'
import type {
  GenerateCopyRequest,
  GenerateCopyResponse,
  CopyVariant,
} from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 120

interface RawVariant {
  fields: Record<string, string | string[]>
}

function renderContent(fields: Record<string, string | string[]>): string {
  return Object.entries(fields)
    .map(([k, v]) => `## ${k}\n${Array.isArray(v) ? v.join('\n') : v}`)
    .join('\n\n')
}

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json<GenerateCopyResponse>(
      { variants: [], error: 'Unauthorized' }, { status: 401 })
  }

  let body: GenerateCopyRequest
  try {
    body = (await req.json()) as GenerateCopyRequest
  } catch {
    return NextResponse.json<GenerateCopyResponse>(
      { variants: [], error: 'Invalid JSON body' }, { status: 400 })
  }

  const { store, purpose, sceneId, sceneDesc, instructions, linkedImageAssetId } = body
  if (!store || !purpose || !PURPOSE_MODEL_MAP[purpose]) {
    return NextResponse.json<GenerateCopyResponse>(
      { variants: [], error: 'Missing or invalid store/purpose' }, { status: 400 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json<GenerateCopyResponse>(
      { variants: [], error: '未設定 ANTHROPIC_API_KEY，無法產生文案' }, { status: 502 })
  }

  // Scene context: template promptBody, freeform desc, or none.
  const scene = sceneId && sceneId !== 'freeform' ? getSceneById(sceneId) : undefined
  const sceneContext = scene?.promptBody ?? (sceneDesc?.trim() || undefined)

  // Optional linked image -> use its stored prompt text (zero vision cost).
  let linkedImagePrompt: string | undefined
  if (linkedImageAssetId) {
    const { data: img } = await supabase
      .from('assets').select('prompt_used').eq('id', linkedImageAssetId).single()
    linkedImagePrompt = img?.prompt_used ?? undefined
  }

  const model = PURPOSE_MODEL_MAP[purpose]
  const brief = buildCopyBrief({ purpose, store, sceneContext, instructions, linkedImagePrompt })

  const tool = {
    name: 'submit_copy',
    description: '回傳 3 個行銷文案版本',
    input_schema: {
      type: 'object' as const,
      properties: {
        variants: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: {
            type: 'object',
            properties: { fields: { type: 'object', description: `必含鍵：${PURPOSE_FIELDS[purpose].join(', ')}` } },
            required: ['fields'],
          },
        },
      },
      required: ['variants'],
    },
  }

  async function callClaude() {
    return getAnthropic().messages.create({
      model,
      max_tokens: 4096,
      system: [{ type: 'text', text: COPYWRITER_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: [tool],
      tool_choice: { type: 'tool', name: 'submit_copy' },
      messages: [{ role: 'user', content: brief }],
    })
  }

  function extractVariants(msg: Awaited<ReturnType<typeof callClaude>>): RawVariant[] | null {
    const block = msg.content.find(b => b.type === 'tool_use')
    if (!block || block.type !== 'tool_use') return null
    const input = block.input as { variants?: RawVariant[] }
    if (!input.variants || input.variants.length === 0) return null
    return input.variants
  }

  let raw: RawVariant[] | null
  try {
    raw = extractVariants(await callClaude())
    if (!raw) raw = extractVariants(await callClaude()) // one retry
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Claude API 失敗'
    return NextResponse.json<GenerateCopyResponse>(
      { variants: [], error: message }, { status: 502 })
  }
  if (!raw) {
    return NextResponse.json<GenerateCopyResponse>(
      { variants: [], error: '模型輸出格式異常' }, { status: 502 })
  }

  const variants: CopyVariant[] = []
  for (const rv of raw) {
    const content = renderContent(rv.fields)
    const { data: row, error: dbError } = await supabase
      .from('assets')
      .insert({
        user_id: user.id,
        type: PURPOSE_ASSET_TYPE[purpose],
        store,
        purpose,
        content,
        prompt_used: brief,
        model_used: model,
        status: 'draft',
        source: 'ai_generated',
      })
      .select()
      .single()
    if (dbError || !row) {
      return NextResponse.json<GenerateCopyResponse>(
        { variants, error: `已產生文案但寫入失敗：${dbError?.message}` }, { status: 500 })
    }
    variants.push({ assetId: row.id, purpose, fields: rv.fields, content })
  }

  return NextResponse.json<GenerateCopyResponse>({ variants })
}
