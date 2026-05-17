import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateAxis, derivePlatform } from '@/lib/anthropic/campaign'
import { getSceneById } from '@/lib/prompts/scene-templates'
import { buildAxisBrief } from '@/lib/prompts/campaign-axis'
import type {
  GenerateCampaignRequest, GenerateCampaignResponse,
  CampaignPlatformResult, CampaignAxis, AssetPurpose,
} from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 300

function fail(message: string, status: number) {
  return NextResponse.json<GenerateCampaignResponse & { error: string }>(
    { campaignId: null, axis: null, results: [], errors: [], error: message }, { status },
  )
}

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('Unauthorized', 401)

  let body: GenerateCampaignRequest
  try { body = (await req.json()) as GenerateCampaignRequest }
  catch { return fail('Invalid JSON body', 400) }

  const { store, platforms, sceneId, sceneDesc, instructions, campaignId } = body
  if (!store || !Array.isArray(platforms) || platforms.length === 0)
    return fail('請至少選一個平台', 400)

  const scene = sceneId && sceneId !== 'freeform' ? getSceneById(sceneId) : undefined
  const sceneContext = scene?.promptBody ?? (sceneDesc?.trim() || undefined)

  // ---- Branch 0: single platform, no campaign → fast standalone, no axis ----
  if (!campaignId && platforms.length === 1) {
    const purpose = platforms[0]
    try {
      // reuse derivePlatform with a trivial axis-less context by passing a minimal axis
      const minimalAxis: CampaignAxis = {
        big_idea: '', selling_points: [], tone: '', audience: '',
      }
      const groups = await derivePlatform({
        purpose, store, axis: minimalAxis, sceneContext, instructions,
      })
      const { data: row, error: dbErr } = await supabase.from('assets').insert({
        user_id: user.id, type: 'copy', store, purpose,
        content: groups.map(g => `【${g.label}】\n${g.items.join('\n')}`).join('\n\n'),
        prompt_used: buildAxisBrief({ store, sceneContext, instructions }),
        status: 'draft', source: 'ai_generated', campaign_id: null,
      }).select().single()
      if (dbErr || !row) return fail(`已產生但寫入失敗：${dbErr?.message}`, 500)
      return NextResponse.json<GenerateCampaignResponse>({
        campaignId: null, axis: null,
        results: [{ purpose, groups, assetId: row.id }], errors: [],
      })
    } catch (e) {
      return fail(e instanceof Error ? e.message : '生成失敗', 502)
    }
  }

  // ---- resolve axis: load existing campaign, or generate (branch 1) ----
  let axis: CampaignAxis
  let cid: string

  if (campaignId) {
    const { data: c } = await supabase
      .from('campaigns').select('*').eq('id', campaignId).single()
    if (!c) return fail('活動不存在或無權限', 404)
    if (body.axis) {
      // branch 3: edit axis then re-derive
      const { error: upErr } = await supabase.from('campaigns')
        .update({
          big_idea: body.axis.big_idea, selling_points: body.axis.selling_points,
          tone: body.axis.tone, audience: body.axis.audience,
        }).eq('id', campaignId)
      if (upErr) return fail(`主軸更新失敗：${upErr.message}`, 500)
      axis = body.axis
    } else {
      axis = {
        big_idea: c.big_idea, selling_points: c.selling_points,
        tone: c.tone, audience: c.audience,
      }
    }
    cid = campaignId
  } else {
    // branch 1: new campaign
    try {
      const { axis: a, model } = await generateAxis({
        store, briefText: buildAxisBrief({ store, sceneContext, instructions }),
      })
      const { data: c, error: cErr } = await supabase.from('campaigns').insert({
        user_id: user.id, store, big_idea: a.big_idea, selling_points: a.selling_points,
        tone: a.tone, audience: a.audience, scene_id: sceneId ?? null,
        scene_desc: sceneDesc ?? null, instructions: instructions ?? null, model_used: model,
      }).select().single()
      if (cErr || !c) return fail(`主軸寫入失敗：${cErr?.message}`, 500)
      axis = a
      cid = c.id
    } catch (e) {
      return fail(e instanceof Error ? e.message : '主軸生成失敗', 502)
    }
  }

  // ---- derive each platform (branches 1/2/3) ----
  const results: CampaignPlatformResult[] = []
  const errors: { purpose: AssetPurpose; message: string }[] = []
  for (const purpose of platforms) {
    try {
      const groups = await derivePlatform({ purpose, store, axis, sceneContext, instructions })
      const { data: row, error: dbErr } = await supabase.from('assets').insert({
        user_id: user.id, type: 'copy', store, purpose,
        content: groups.map(g => `【${g.label}】\n${g.items.join('\n')}`).join('\n\n'),
        prompt_used: buildAxisBrief({ store, sceneContext, instructions }),
        status: 'draft', source: 'ai_generated', campaign_id: cid,
      }).select().single()
      if (dbErr || !row) { errors.push({ purpose, message: dbErr?.message ?? 'DB insert failed' }); continue }
      results.push({ purpose, groups, assetId: row.id })
    } catch (e) {
      errors.push({ purpose, message: e instanceof Error ? e.message : '生成失敗' })
    }
  }
  return NextResponse.json<GenerateCampaignResponse>({ campaignId: cid, axis, results, errors })
}
