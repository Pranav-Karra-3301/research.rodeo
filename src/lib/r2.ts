/**
 * Cloudflare R2 helpers (server-side only – never import from client components).
 * R2 is S3-compatible, so we use @aws-sdk/client-s3 with a custom endpoint.
 *
 * All graph objects are scoped by user ID: `users/{userId}/graphs/{rabbitHoleId}.json`
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

// Accept both prefixed and legacy naming conventions
const ACCOUNT_ID =
  process.env.CLOUDFLARE_R2_ACCOUNT_ID ?? process.env.CLOUDFLARE_ACCOUNT_ID;
const ACCESS_KEY_ID =
  process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ?? process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY =
  process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ?? process.env.R2_SECRET_ACCESS_KEY;
const BUCKET = process.env.CLOUDFLARE_R2_BUCKET;

export function isR2Configured(): boolean {
  return !!(ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY && BUCKET);
}

function getClient(): S3Client {
  if (!isR2Configured()) {
    throw new Error("Cloudflare R2 is not configured. Set CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY, and CLOUDFLARE_R2_BUCKET.");
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${ACCOUNT_ID!}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: ACCESS_KEY_ID!,
      secretAccessKey: SECRET_ACCESS_KEY!,
    },
  });
}

/** Sanitize user ID for use in R2 keys. */
function sanitizeUserId(userId: string): string {
  return userId.replace(/\|/g, "_");
}

function graphKey(userId: string, rabbitHoleId: string): string {
  return `users/${sanitizeUserId(userId)}/graphs/${rabbitHoleId}.json`;
}

/** Legacy key (pre-auth migration). */
function legacyGraphKey(rabbitHoleId: string): string {
  return `graphs/${rabbitHoleId}.json`;
}

/** Fetch the stored graph JSON for a rabbit hole. Returns null if it doesn't exist. */
export async function getGraphObject(userId: string, rabbitHoleId: string): Promise<string | null> {
  const client = getClient();

  // Try user-scoped path first
  const result = await fetchObject(client, graphKey(userId, rabbitHoleId));
  if (result !== null) return result;

  // Fallback to legacy path (pre-auth migration)
  return fetchObject(client, legacyGraphKey(rabbitHoleId));
}

async function fetchObject(client: S3Client, key: string): Promise<string | null> {
  try {
    const response = await client.send(
      new GetObjectCommand({ Bucket: BUCKET!, Key: key })
    );
    if (!response.Body) return null;
    return await response.Body.transformToString("utf-8");
  } catch (err) {
    const code = (err as { name?: string; $metadata?: { httpStatusCode?: number } })?.name;
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (code === "NoSuchKey" || status === 404) return null;
    throw err;
  }
}

/** Write the graph JSON for a rabbit hole. Overwrites any existing snapshot. */
export async function putGraphObject(userId: string, rabbitHoleId: string, json: string): Promise<void> {
  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET!,
      Key: graphKey(userId, rabbitHoleId),
      Body: json,
      ContentType: "application/json",
    })
  );
}

/** Delete the stored graph for a rabbit hole. No-op if it doesn't exist. */
export async function deleteGraphObject(userId: string, rabbitHoleId: string): Promise<void> {
  const client = getClient();
  // Delete both new and legacy paths
  for (const key of [graphKey(userId, rabbitHoleId), legacyGraphKey(rabbitHoleId)]) {
    try {
      await client.send(
        new DeleteObjectCommand({ Bucket: BUCKET!, Key: key })
      );
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if (status === 404) continue;
      throw err;
    }
  }
}

/** List all stored graph rabbit hole IDs for a user. */
export async function listGraphObjects(userId: string): Promise<string[]> {
  const client = getClient();
  const prefix = `users/${sanitizeUserId(userId)}/graphs/`;
  const response = await client.send(
    new ListObjectsV2Command({ Bucket: BUCKET!, Prefix: prefix })
  );
  return (response.Contents ?? [])
    .map((obj) => obj.Key ?? "")
    .filter((key) => key.endsWith(".json"))
    .map((key) => key.replace(prefix, "").replace(/\.json$/, ""));
}
