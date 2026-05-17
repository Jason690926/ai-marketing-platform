import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { CampaignWithAssets, Campaign, Asset } from '@/types'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json<{ campaigns: CampaignWithAssets[]; error?: string }>(
    { campaigns: [], error: 'Unauthorized' }, { status: 401 })

  const { data: campaigns, error } = await supabase
    .from('campaigns').select('*').eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ campaigns: [], error: error.message }, { status: 500 })

  const ids = (campaigns ?? []).map(c => c.id)
  const { data: assets } = ids.length
    ? await supabase.from('assets').select('*').in('campaign_id', ids)
        .order('created_at', { ascending: false })
    : { data: [] as Asset[] }

  const out: CampaignWithAssets[] = (campaigns ?? []).map((c: Campaign) => ({
    campaign: c,
    assets: (assets ?? []).filter((a: Asset) => a.campaign_id === c.id),
  }))
  return NextResponse.json<{ campaigns: CampaignWithAssets[] }>({ campaigns: out })
}
