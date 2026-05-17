import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Asset } from '@/types'

export const runtime = 'nodejs'

interface ListResponse {
  assets: Asset[]
  error?: string
}

/**
 * GET /api/assets
 * Query params (all optional):
 *   type    image | copy | article | thread_post
 *   store   mattress | bedding
 *   status  draft | pending | approved | rejected
 *   q       free-text search over prompt_used / tags
 *   limit   default 60, max 200
 */
export async function GET(req: Request) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json<ListResponse>(
      { assets: [], error: 'Unauthorized' },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  const store = searchParams.get('store')
  const status = searchParams.get('status')
  const q = searchParams.get('q')?.trim()
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const limit = Math.min(Number(searchParams.get('limit')) || 60, 200)

  let query = supabase
    .from('assets')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (type) query = query.eq('type', type)
  if (store) query = query.eq('store', store)
  if (status) query = query.eq('status', status)
  if (q) query = query.ilike('prompt_used', `%${q}%`)
  if (from) query = query.gte('created_at', from)
  if (to)   query = query.lte('created_at', to)

  const { data, error } = await query

  if (error) {
    return NextResponse.json<ListResponse>(
      { assets: [], error: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json<ListResponse>({ assets: (data ?? []) as Asset[] })
}
