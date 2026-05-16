export type UserRole = 'admin' | 'editor'

export interface AppUser {
  id: string
  email: string
  name: string
  role: UserRole
  created_at: string
}

export type AssetType = 'image' | 'copy' | 'article' | 'thread_post'
export type AssetStore = 'mattress' | 'bedding'
export type AssetPurpose = 'google_ads' | 'meta_ads' | 'social_post' | 'line_push'
export type AssetStatus = 'draft' | 'pending' | 'approved' | 'rejected'
export type AssetSource = 'ai_generated' | 'user_uploaded' | 'reference_remix'
export type ImageLevel = 'level1_base' | 'level2_complete'
export type AspectRatio = '1:1' | '4:5' | '9:16' | '16:9' | '1.91:1' | '21:9' | '4:3'

export interface Asset {
  id: string
  user_id: string
  type: AssetType
  store: AssetStore
  purpose: AssetPurpose
  // image fields
  image_url: string | null
  image_level: ImageLevel | null
  aspect_ratio: string | null
  width: number | null
  height: number | null
  prompt_used: string | null
  // review
  status: AssetStatus
  review_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  // meta
  is_starred: boolean
  tags: string[]
  source: AssetSource
  reference_image_url: string | null
  created_at: string
}

export type InputMode = 'scene' | 'reference' | 'freeform'
export type StylePreset = 'hotel_dark' | 'cozy_warm' | 'minimal_clean' | 'outdoor_natural' | 'auto'
export type SizePreset = '1080x1080' | '1080x1350' | '1080x1920' | '1200x675' | '1200x628' | '1920x800'

export interface SceneTemplate {
  id: string
  name: string
  description: string
  promptBody: string
}

export interface AdContent {
  title: string
  subtitle?: string
  endorsement?: string
  features?: { title: string; subtitle?: string }[]
}

export interface GenerateImageRequest {
  mode: InputMode
  store: AssetStore
  sceneId?: string
  referenceImageBase64?: string
  freeformDescription?: string
  stylePreset: StylePreset
  sizePreset: SizePreset
  additionalNotes?: string
  level: 'level1' | 'level2'
  adContent?: AdContent
}

export interface GenerateImageResponse {
  assets: Asset[]
  error?: string
}

export interface GenerateCopyRequest {
  store: AssetStore
  purpose: AssetPurpose
  sceneId?: string
  sceneDesc?: string
  instructions?: string
  linkedImageAssetId?: string
}

export interface CopyGroup {
  key: string
  label: string
  items: string[]
}

export interface GenerateCopyResponse {
  assetId?: string
  purpose?: AssetPurpose
  groups: CopyGroup[]
  content?: string
  error?: string
}
