# Level 2 Complete-Ad Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Enable the existing-but-disabled "Level 2 完整廣告" so gpt-image-1 directly renders ad text (title/subtitle/endorsement/features) into a finished ad image, saved to the asset library.

**Architecture:** Extend `GenerateImageRequest` with `level` + `adContent`; add `buildLevel2Prompt` + `LEVEL2_NEGATIVE_PROMPT` (text allowed, no extra/garbled text); image route branches on `level`; image-tab builds the new request, validates title, and un-disables the Level 2 button. Level 1 path untouched.

**Tech Stack:** Next.js 14 route handler, TypeScript, existing OpenAI/R2/Supabase wiring.

**Spec:** `docs/superpowers/specs/2026-05-16-level2-complete-ad-design.md`

**Verification pattern:** No unit-test runner in repo. Gate every task with `npx tsc --noEmit` (0-error baseline) + curl smoke against the already-running dev server. Full `npx next build` deferred to final task. Never `git push` mid-plan. Never stage preview-only files (middleware.ts, app/generator/copy/page.tsx, app/generator/image/page.tsx, app/library/page.tsx) or `.claude/`.

---

### Task L1: Extend GenerateImageRequest contract

**Files:** Modify `types/index.ts`

- [ ] **Step 1:** Locate the existing `export interface GenerateImageRequest { ... }` block. Add an `AdContent` interface immediately before it and add two fields to it. The resulting block must be exactly:

```ts
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
```

- [ ] **Step 2:** `npx tsc --noEmit` — expect errors ONLY in `components/generator/image-tab.tsx` (it builds `GenerateImageRequest` without the new required `level` — fixed in L5). Errors confined there are expected; report them.

- [ ] **Step 3:** Commit only `types/index.ts`:
`git add types/index.ts && git commit -m "feat: add level + adContent to GenerateImageRequest"`

---

### Task L2: LEVEL2_NEGATIVE_PROMPT

**Files:** Modify `lib/prompts/brand-knowledge.ts`

- [ ] **Step 1:** Append at the end of the file (after the existing `NEGATIVE_PROMPT` export):

```ts
export const LEVEL2_NEGATIVE_PROMPT = `No watermarks, no logos, no people, no plastic 3D render style, no over-saturation, no cartoon style. Do not add any text other than the exact copy provided. Render all Chinese characters accurately and legibly — no garbled, distorted, or invented glyphs.`.trim()
```

- [ ] **Step 2:** `npx tsc --noEmit` — no new errors from this file (only the L1-expected image-tab error remains).

- [ ] **Step 3:** Commit only `lib/prompts/brand-knowledge.ts`:
`git add lib/prompts/brand-knowledge.ts && git commit -m "feat: add LEVEL2_NEGATIVE_PROMPT (text allowed, no garbled text)"`

---

### Task L3: buildLevel2Prompt

**Files:** Modify `lib/prompts/scene-templates.ts`

- [ ] **Step 1:** At the top of the file, the existing import is `import { NEGATIVE_PROMPT } from './brand-knowledge'`. Change it to:

```ts
import { NEGATIVE_PROMPT, LEVEL2_NEGATIVE_PROMPT } from './brand-knowledge'
```

- [ ] **Step 2:** Append this function at the END of the file (after `getSceneById`). It mirrors `buildPrompt`'s scene/style logic but renders ad text instead of the Level 1 empty-space + NEGATIVE_PROMPT lines. `AdContent` is imported from `@/types`:

```ts
import type { AdContent } from '@/types'

export function buildLevel2Prompt({
  mode,
  sceneTemplate,
  freeformDescription,
  stylePreset,
  additionalNotes,
  adContent,
}: {
  mode: 'scene' | 'reference' | 'freeform'
  sceneTemplate?: SceneTemplate
  freeformDescription?: string
  stylePreset: StylePreset
  additionalNotes?: string
  adContent: AdContent
}): string {
  const parts: string[] = []

  if (mode === 'scene' && sceneTemplate) {
    parts.push(sceneTemplate.promptBody)
  } else if (mode === 'freeform' && freeformDescription) {
    parts.push(
      `A professional product photograph of a Musterring premium mattress. Scene: ${freeformDescription}. Real photography feel, not CGI or 3D render.`
    )
  } else if (mode === 'reference') {
    parts.push(
      `A professional product photograph of a Musterring premium mattress, styled in the same composition and atmosphere as the reference image provided. Maintain the same mood, lighting angle, and color palette. Real photography feel.`
    )
  } else {
    parts.push(
      `A professional product photograph of a Musterring premium mattress. Real photography feel, not CGI or 3D render.`
    )
  }

  const styleModifier = STYLE_MODIFIERS[stylePreset]
  if (styleModifier) parts.push(styleModifier)

  if (additionalNotes) parts.push(`Additional requirement: ${additionalNotes}`)

  const ad: string[] = [
    'This is a FINISHED advertisement creative. Integrate the following Traditional Chinese marketing copy into the image as clean, professional, highly legible typography. The mattress stays the hero; text must not cover the product.',
    `Main headline (most prominent): 「${adContent.title}」`,
  ]
  if (adContent.subtitle) ad.push(`Subheading (secondary): 「${adContent.subtitle}」`)
  if (adContent.endorsement) ad.push(`Endorsement badge (small, trustworthy): 「${adContent.endorsement}」`)
  if (adContent.features && adContent.features.length > 0) {
    const feats = adContent.features
      .filter(f => f.title.trim())
      .map(f => f.subtitle?.trim() ? `「${f.title}：${f.subtitle}」` : `「${f.title}」`)
      .join('、')
    if (feats) ad.push(`Up to three feature callouts: ${feats}`)
  }
  ad.push('High contrast text, balanced advertising layout, typography harmonized with the scene lighting.')
  parts.push(ad.join('\n'))

  parts.push(LEVEL2_NEGATIVE_PROMPT)
  return parts.join('\n\n')
}
```

(Place the `import type { AdContent } from '@/types'` line with the other imports at the top, not inline — move it up; the code above shows it for clarity.)

- [ ] **Step 3:** `npx tsc --noEmit` — scene-templates.ts must be error-free; only the L1-expected image-tab error remains. (`STYLE_MODIFIERS`, `SceneTemplate`, `StylePreset` already exist in this file/imports.)

- [ ] **Step 4:** Commit only `lib/prompts/scene-templates.ts`:
`git add lib/prompts/scene-templates.ts && git commit -m "feat: add buildLevel2Prompt for finished-ad text rendering"`

---

### Task L4: Image route Level 2 branch

**Files:** Modify `app/api/generate/image/route.ts`

- [ ] **Step 1:** Change the import of prompt builders. The existing line is `import { buildPrompt, getSceneById } from '@/lib/prompts/scene-templates'`. Replace with:

```ts
import { buildPrompt, buildLevel2Prompt, getSceneById } from '@/lib/prompts/scene-templates'
```

- [ ] **Step 2:** Replace the body-destructuring block. Current:

```ts
  const {
    mode,
    store,
    sceneId,
    freeformDescription,
    stylePreset,
    sizePreset,
    additionalNotes,
  } = body
```

with:

```ts
  const {
    mode,
    store,
    sceneId,
    freeformDescription,
    stylePreset,
    sizePreset,
    additionalNotes,
    level,
    adContent,
  } = body

  const lvl = level === 'level2' ? 'level2' : 'level1'
  if (lvl === 'level2' && !adContent?.title?.trim()) {
    return NextResponse.json<GenerateImageResponse>(
      { assets: [], error: 'Level 2 需填廣告標題' },
      { status: 400 }
    )
  }
```

- [ ] **Step 3:** Replace the prompt construction. Current:

```ts
  const sceneTemplate =
    mode === 'scene' && sceneId ? getSceneById(sceneId) : undefined

  const prompt = buildPrompt({
    mode,
    sceneTemplate,
    freeformDescription,
    stylePreset,
    additionalNotes,
  })
```

with:

```ts
  const sceneTemplate =
    mode === 'scene' && sceneId ? getSceneById(sceneId) : undefined

  const prompt =
    lvl === 'level2'
      ? buildLevel2Prompt({
          mode,
          sceneTemplate,
          freeformDescription,
          stylePreset,
          additionalNotes,
          adContent: adContent!,
        })
      : buildPrompt({
          mode,
          sceneTemplate,
          freeformDescription,
          stylePreset,
          additionalNotes,
        })
```

- [ ] **Step 4:** In the `.insert({ ... })` object, change the hardcoded `image_level: 'level1_base',` to:

```ts
        image_level: lvl === 'level2' ? 'level2_complete' : 'level1_base',
```

- [ ] **Step 5:** `npx tsc --noEmit` — route must be error-free; only the L1-expected image-tab error remains.

- [ ] **Step 6:** Smoke: `curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/generate/image -H "Content-Type: application/json" -d "{}"` → expect `401` (retry once after 3s if 404).

- [ ] **Step 7:** Commit only `app/api/generate/image/route.ts`:
`git add app/api/generate/image/route.ts && git commit -m "feat: image route Level 2 branch (buildLevel2Prompt + level2_complete)"`

---

### Task L5: Enable Level 2 in image-tab

**Files:** Modify `components/generator/image-tab.tsx`

- [ ] **Step 1:** In `buildRequest(sizePreset)`, the current `return { ... }` ends with `additionalNotes: notes || undefined,`. Add `level` and `adContent` to the returned object so it becomes:

```tsx
    return {
      mode: effectiveMode,
      store,
      sceneId: mode === 'scene' && !isFreeformScene ? sceneId : undefined,
      freeformDescription:
        effectiveMode === 'freeform'
          ? (mode === 'freeform' ? freeformDesc : description).trim()
          : undefined,
      stylePreset: (style === 'custom' ? 'auto' : style) as StylePreset,
      sizePreset,
      additionalNotes: notes || undefined,
      level,
      adContent:
        level === 'level2'
          ? {
              title: adTitle.trim(),
              subtitle: adSubtitle.trim() || undefined,
              endorsement: adEndorsement.trim() || undefined,
              features: adFeatures
                .filter(f => f.title.trim())
                .map(f => ({
                  title: f.title.trim(),
                  subtitle: f.subtitle.trim() || undefined,
                })),
            }
          : undefined,
    }
```

(Keep the existing `effectiveMode` / `notes` lines above the return exactly as they are.)

- [ ] **Step 2:** Add a derived validity flag near the other derived values (just after the `apiCallCount` line):

```tsx
  const level2NeedsTitle = level === 'level2' && !adTitle.trim()
```

- [ ] **Step 3:** Remove the amber Level 2 notice block entirely:

```tsx
      {level === 'level2' && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          Level 2 完整廣告（含廣告文字直出）尚未串接，目前僅支援 Level 1 底圖生成。
        </p>
      )}
```

- [ ] **Step 4:** Replace the generate button block. Current:

```tsx
      <Button
        className="w-full"
        size="lg"
        onClick={handleGenerate}
        disabled={loading || level === 'level2' || sizes.length === 0}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" />
            {progress || '產生中...'}
          </span>
        ) : (
          `產生底圖（${apiCallCount} 次 API 呼叫）`
        )}
      </Button>
```

with:

```tsx
      <Button
        className="w-full"
        size="lg"
        onClick={handleGenerate}
        disabled={loading || sizes.length === 0 || level2NeedsTitle}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" />
            {progress || '產生中...'}
          </span>
        ) : level === 'level2' ? (
          `產生完整廣告（${apiCallCount} 次 API 呼叫）`
        ) : (
          `產生底圖（${apiCallCount} 次 API 呼叫）`
        )}
      </Button>
      {level2NeedsTitle && (
        <p className="text-xs text-muted-foreground">Level 2 需先填「廣告標題」才能產生。</p>
      )}
```

- [ ] **Step 5:** `npx tsc --noEmit` — expect **0 errors project-wide**.

- [ ] **Step 6:** Smoke: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/generator/image` → expect `200` (preview) or `307`. Report which.

- [ ] **Step 7:** Commit only `components/generator/image-tab.tsx`:
`git add components/generator/image-tab.tsx && git commit -m "feat: enable Level 2 complete-ad in image-tab with title validation"`

---

### Task L6: Final verify + memory + push

- [ ] **Step 1:** `npx tsc --noEmit` → 0 errors.

- [ ] **Step 2:** Stop the background dev server, delete `.next` (production/dev artifact contention is a known issue in this repo: `rm -rf .next`), then `npx next build` → succeeds; route list includes `ƒ /api/generate/image`. Restart dev server (`npm run dev`) afterward if preview is still wanted.

- [ ] **Step 3:** `git push origin master` (preview-only files and `.claude/` stay unstaged/unpushed).

- [ ] **Step 4:** Update `C:\Users\frodo.MSI\.claude\projects\C--Users-frodo-MSI\memory\project_ai_marketing_platform.md`: move Level 2 complete-ad from 待辦 to done (model-direct text, title required, commits), keep deploy + OPENAI/Supabase keys as live-test prerequisites.

- [ ] **Step 5:** Report: tsc/build green; live Level 2 generation needs valid `OPENAI_API_KEY` + Supabase keys/migrations. No success claim about live image generation until verified.

## Self-Review

**1. Spec coverage:** §3 contract → L1 (AdContent + level/adContent). §4.1 LEVEL2_NEGATIVE_PROMPT → L2. §4.2 buildLevel2Prompt (3 scene branches + style + notes + ad block + level2 negative) → L3. §5 route branch (lvl, 400 on missing title, buildLevel2Prompt, image_level conditional, rest unchanged) → L4. §6 image-tab (buildRequest level+adContent filtered features, un-disable, title validation, button text) → L5. §7 error handling → L4 Step 2 (400) + L5 Step 2/4 (front-end disable+hint). §8 testing → per-task tsc/curl + L6 build. §9 out-of-scope: not implemented (correct). §10 prereqs → L6 Step 5. ✓

**2. Placeholder scan:** No TBD/TODO; all code blocks complete; commands concrete. ✓

**3. Type consistency:** `AdContent` defined L1, imported/used in L3 (`buildLevel2Prompt` param) and constructed in L5. `level: 'level1'|'level2'` consistent L1↔L4↔L5. `buildLevel2Prompt` signature identical in L3 definition and L4 call site (mode, sceneTemplate, freeformDescription, stylePreset, additionalNotes, adContent). `LEVEL2_NEGATIVE_PROMPT` exported L2, imported L3. `image_level` values `'level1_base'`/`'level2_complete'` match the 001 schema CHECK. image-tab state vars (`level`, `adTitle`, `adSubtitle`, `adEndorsement`, `adFeatures`, `style`, `sizes`, `apiCallCount`) all pre-exist in the file (confirmed this session). No dangling references. ✓

No gaps.
