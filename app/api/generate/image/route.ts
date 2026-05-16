import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { getOpenAI } from '@/lib/openai/client'
import { uploadToR2 } from '@/lib/r2/client'
import { buildPrompt, getSceneById } from '@/lib/prompts/scene-templates'
import type {
  GenerateImageRequest,
  GenerateImageResponse,
  SizePreset,
} from '@/types'

export const runtime = 'nodejs'
// gpt-image-1 generations are slow; allow up to 5 min on Vercel.
export const maxDuration = 300

const IMAGE_COUNT = 3

/** gpt-image-1 only accepts these sizes — map our presets by orientation. */
type GptImageSize = '1024x1024' | '1024x1536' | '1536x1024'

function parsePreset(preset: SizePreset): {
  width: number
  height: number
  gptSize: GptImageSize
  aspectRatio: string
} {
  const [w, h] = preset.split('x').map(Number)
  let gptSize: GptImageSize
  if (w === h) gptSize = '1024x1024'
  else if (w < h) gptSize = '1024x1536'
  else gptSize = '1536x1024'

  const g = gcd(w, h)
  return { width: w, height: h, gptSize, aspectRatio: `${w / g}:${h / g}` }
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

export async function POST(req: Request) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json<GenerateImageResponse>(
      { assets: [], error: 'Unauthorized' },
      { status: 401 }
    )
  }

  let body: GenerateImageRequest
  try {
    body = (await req.json()) as GenerateImageRequest
  } catch {
    return NextResponse.json<GenerateImageResponse>(
      { assets: [], error: 'Invalid JSON body' },
      { status: 400 }
    )
  }

  const {
    mode,
    store,
    sceneId,
    freeformDescription,
    stylePreset,
    sizePreset,
    additionalNotes,
  } = body

  if (!mode || !store || !stylePreset || !sizePreset) {
    return NextResponse.json<GenerateImageResponse>(
      { assets: [], error: 'Missing required fields' },
      { status: 400 }
    )
  }

  const sceneTemplate =
    mode === 'scene' && sceneId ? getSceneById(sceneId) : undefined

  const prompt = buildPrompt({
    mode,
    sceneTemplate,
    freeformDescription,
    stylePreset,
    additionalNotes,
  })

  const { width, height, gptSize, aspectRatio } = parsePreset(sizePreset)

  let images: { b64_json?: string }[]
  try {
    const result = await getOpenAI().images.generate({
      model: 'gpt-image-1',
      prompt,
      n: IMAGE_COUNT,
      size: gptSize,
      quality: 'high',
    })
    images = result.data ?? []
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Image generation failed'
    return NextResponse.json<GenerateImageResponse>(
      { assets: [], error: message },
      { status: 502 }
    )
  }

  const assets: GenerateImageResponse['assets'] = []

  for (const img of images) {
    if (!img.b64_json) continue
    const buffer = Buffer.from(img.b64_json, 'base64')
    const id = randomUUID()
    const key = `assets/${user.id}/${id}.png`

    const imageUrl = await uploadToR2(buffer, key, 'image/png')

    const { data: row, error: dbError } = await supabase
      .from('assets')
      .insert({
        id,
        user_id: user.id,
        type: 'image',
        store,
        purpose: 'post',
        image_url: imageUrl,
        image_level: 'level1_base',
        aspect_ratio: aspectRatio,
        width,
        height,
        prompt_used: prompt,
        status: 'draft',
        source: mode === 'reference' ? 'reference_remix' : 'ai_generated',
      })
      .select()
      .single()

    if (dbError || !row) {
      return NextResponse.json<GenerateImageResponse>(
        { assets, error: `Saved image but DB insert failed: ${dbError?.message}` },
        { status: 500 }
      )
    }
    assets.push(row)
  }

  if (assets.length === 0) {
    return NextResponse.json<GenerateImageResponse>(
      { assets: [], error: 'No images were returned by the model' },
      { status: 502 }
    )
  }

  return NextResponse.json<GenerateImageResponse>({ assets })
}
