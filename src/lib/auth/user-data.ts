/**
 * Per-user metadata stored in R2.
 * Maps user ownership of rabbit holes and visibility settings.
 * Server-side only.
 */
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

const ACCOUNT_ID =
  process.env.CLOUDFLARE_R2_ACCOUNT_ID ?? process.env.CLOUDFLARE_ACCOUNT_ID;
const ACCESS_KEY_ID =
  process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ?? process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY =
  process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ?? process.env.R2_SECRET_ACCESS_KEY;
const BUCKET = process.env.CLOUDFLARE_R2_BUCKET;

function isConfigured(): boolean {
  return !!(ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY && BUCKET);
}

function getClient(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${ACCOUNT_ID!}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: ACCESS_KEY_ID!,
      secretAccessKey: SECRET_ACCESS_KEY!,
    },
  });
}

function sanitizeUserId(userId: string): string {
  return userId.replace(/\|/g, "_");
}

function metadataKey(userId: string): string {
  return `users/${sanitizeUserId(userId)}/metadata.json`;
}

export type RabbitHoleVisibility = "private" | "public";

export interface RabbitHoleOwnership {
  rabbitHoleId: string;
  visibility: RabbitHoleVisibility;
  createdAt: number;
}

export interface UserMetadata {
  userId: string;
  rabbitHoles: RabbitHoleOwnership[];
  updatedAt: number;
}

/** Get user metadata from R2. Returns empty metadata if not found. */
export async function getUserMetadata(userId: string): Promise<UserMetadata> {
  if (!isConfigured()) {
    return { userId, rabbitHoles: [], updatedAt: Date.now() };
  }

  const client = getClient();
  try {
    const response = await client.send(
      new GetObjectCommand({ Bucket: BUCKET!, Key: metadataKey(userId) })
    );
    if (!response.Body) {
      return { userId, rabbitHoles: [], updatedAt: Date.now() };
    }
    const json = await response.Body.transformToString("utf-8");
    return JSON.parse(json) as UserMetadata;
  } catch (err) {
    const code = (err as { name?: string })?.name;
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (code === "NoSuchKey" || status === 404) {
      return { userId, rabbitHoles: [], updatedAt: Date.now() };
    }
    throw err;
  }
}

/** Save user metadata to R2. */
export async function putUserMetadata(metadata: UserMetadata): Promise<void> {
  if (!isConfigured()) return;

  const client = getClient();
  metadata.updatedAt = Date.now();
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET!,
      Key: metadataKey(metadata.userId),
      Body: JSON.stringify(metadata),
      ContentType: "application/json",
    })
  );
}

/** Register a rabbit hole as owned by a user. */
export async function claimRabbitHole(
  userId: string,
  rabbitHoleId: string,
  visibility: RabbitHoleVisibility = "private"
): Promise<void> {
  const metadata = await getUserMetadata(userId);
  const existing = metadata.rabbitHoles.find((rh) => rh.rabbitHoleId === rabbitHoleId);
  if (existing) {
    existing.visibility = visibility;
  } else {
    metadata.rabbitHoles.push({
      rabbitHoleId,
      visibility,
      createdAt: Date.now(),
    });
  }
  await putUserMetadata(metadata);
}

/** Remove a rabbit hole from user ownership. */
export async function unclaimRabbitHole(userId: string, rabbitHoleId: string): Promise<void> {
  const metadata = await getUserMetadata(userId);
  metadata.rabbitHoles = metadata.rabbitHoles.filter((rh) => rh.rabbitHoleId !== rabbitHoleId);
  await putUserMetadata(metadata);
}

/** Update visibility of a rabbit hole. */
export async function setRabbitHoleVisibility(
  userId: string,
  rabbitHoleId: string,
  visibility: RabbitHoleVisibility
): Promise<void> {
  const metadata = await getUserMetadata(userId);
  const hole = metadata.rabbitHoles.find((rh) => rh.rabbitHoleId === rabbitHoleId);
  if (hole) {
    hole.visibility = visibility;
    await putUserMetadata(metadata);
  }
}

/** Check if a user owns a specific rabbit hole. */
export async function userOwnsRabbitHole(userId: string, rabbitHoleId: string): Promise<boolean> {
  const metadata = await getUserMetadata(userId);
  return metadata.rabbitHoles.some((rh) => rh.rabbitHoleId === rabbitHoleId);
}

/** Get all rabbit hole IDs owned by a user. */
export async function getUserRabbitHoleIds(userId: string): Promise<RabbitHoleOwnership[]> {
  const metadata = await getUserMetadata(userId);
  return metadata.rabbitHoles;
}
