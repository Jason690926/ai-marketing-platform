import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAnthropic } from '@/lib/anthropic/client'
import {
  COPYWRITER_SYSTEM_PROMPT,
  PURPOSE_MODEL_MAP,
  PLATFORM_GROUPS,
  buildCopyBrief,
} from '@/lib/prompts/copywriter'
import { getSceneById } from '@/lib/prompts/scene-templates'
import type {
  GenerateCopyRequest,
  GenerateCopyResponse,
  CopyGroup,
} from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 120

function renderContent(groups: CopyGroup[]): string {
  return groups
    .map(g => `## ${g.label}\n` + g.items.map((it, i) => `${i + 1}. ${it}`).join('\n'))
    .join('\n\n')
}

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json<GenerateCopyResponse>(
      { groups: [], error: 'Unauthorized' }, { status: 401 })
  }

  let body: GenerateCopyRequest
  try {
    body = (await req.json()) as GenerateCopyRequest
  } catch {
    return NextResponse.json<GenerateCopyResponse>(
      { groups: [], error: 'Invalid JSON body' }, { status: 400 })
  }

  const { store, purpose, sceneId, sceneDesc, instructions, linkedImageAssetId } = body
  if (!store || !purpose || !PLATFORM_GROUPS[purpose]) {
    return NextResponse.json<GenerateCopyResponse>(
      { groups: [], error: 'Missing or invalid store/purpose' }, { status: 400 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json<GenerateCopyResponse>(
      { groups: [], error: '未設定 ANTHROPIC_API_KEY，無法產生文案' }, { status: 502 })
  }

  const scene = sceneId && sceneId !== 'freeform' ? getSceneById(sceneId) : undefined
  const sceneContext = scene?.promptBody ?? (sceneDesc?.trim() || undefined)

  let linkedImagePrompt: string | undefined
  if (linkedImageAssetId) {
    const { data: img } = await supabase
      .from('assets').select('prompt_used').eq('id', linkedImageAssetId).single()
    linkedImagePrompt = img?.prompt_used ?? undefined
  }

  const model = PURPOSE_MODEL_MAP[purpose]
  const specs = PLATFORM_GROUPS[purpose]
  const brief = buildCopyBrief({ purpose, store, sceneContext, instructions, linkedImagePrompt })

  const properties: Record<string, unknown> = {}
  for (const s of specs) {
    properties[s.key] = {
      type: 'array',
      minItems: s.min,
      maxItems: s.max,
      items: { type: 'string' },
      description: `${s.label}：${s.guidance}`,
    }
  }
  const tool = {
    name: 'submit_copy',
    description: '依平台規格回傳分組文案',
    input_schema: {
      type: 'object' as const,
      properties,
      required: specs.map(s => s.key),
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

  function extractGroups(msg: Awaited<ReturnType<typeof callClaude>>): CopyGroup[] | null {
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

  let groups: CopyGroup[] | null
  try {
    groups = extractGroups(await callClaude())
    if (!groups) groups = extractGroups(await callClaude())
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Claude API 失敗'
    return NextResponse.json<GenerateCopyResponse>(
      { groups: [], error: message }, { status: 502 })
  }
  if (!groups) {
    return NextResponse.json<GenerateCopyResponse>(
      { groups: [], error: '模型輸出格式異常' }, { status: 502 })
  }

  const content = renderContent(groups)
  const { data: row, error: dbError } = await supabase
    .from('assets')
    .insert({
      user_id: user.id,
      type: 'copy',
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
      { groups, error: `已產生文案但寫入失敗：${dbError?.message}` }, { status: 500 })
  }

  return NextResponse.json<GenerateCopyResponse>({
    assetId: row.id, purpose, groups, content,
  })
}
