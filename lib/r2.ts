import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});

const BUCKET = () => process.env.R2_BUCKET!;

export async function r2Put(key: string, body: string, contentType = 'application/json'): Promise<void> {
  await r2.send(new PutObjectCommand({
    Bucket: BUCKET(),
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
}

export async function r2Get<T>(key: string): Promise<T | null> {
  try {
    const res = await r2.send(new GetObjectCommand({ Bucket: BUCKET(), Key: key }));
    const text = await res.Body?.transformToString();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'NoSuchKey') return null;
    return null;
  }
}

export async function r2Del(keys: string | string[]): Promise<void> {
  const arr = Array.isArray(keys) ? keys : [keys];
  if (arr.length === 0) return;
  if (arr.length === 1) {
    await r2.send(new DeleteObjectCommand({ Bucket: BUCKET(), Key: arr[0] })).catch(() => {});
  } else {
    await r2.send(new DeleteObjectsCommand({
      Bucket: BUCKET(),
      Delete: { Objects: arr.map(Key => ({ Key })) },
    })).catch(() => {});
  }
}

export async function r2List(prefix: string): Promise<string[]> {
  const res = await r2.send(new ListObjectsV2Command({ Bucket: BUCKET(), Prefix: prefix }));
  return (res.Contents ?? []).map(obj => obj.Key!).filter(Boolean);
}
