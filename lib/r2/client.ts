import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const accountId = process.env.R2_ACCOUNT_ID!
const bucket = process.env.R2_BUCKET_NAME!
const publicUrl = process.env.R2_PUBLIC_URL!.replace(/\/+$/, '')

let _client: S3Client | null = null

function getClient(): S3Client {
  if (_client) return _client
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  })
  return _client
}

/**
 * Upload a binary object to R2 and return its public URL.
 * `key` is the object path inside the bucket, e.g. `assets/<userId>/<uuid>.png`.
 */
export async function uploadToR2(
  body: Buffer | Uint8Array,
  key: string,
  contentType: string
): Promise<string> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  )
  return `${publicUrl}/${key}`
}
