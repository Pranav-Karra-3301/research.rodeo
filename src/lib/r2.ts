/**
 * Cloudflare R2 helpers (server-side only – never import from client components).
 * R2 is S3-compatible, so we use @aws-sdk/client-s3 with a custom endpoint.
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

function graphKey(rabbitHoleId: string): string {
  return `graphs/${rabbitHoleId}.json`;
}

/** Fetch the stored graph JSON for a rabbit hole. Returns null if it doesn't exist. */
export async function getGraphObject(rabbitHoleId: string): Promise<string | null> {
  const client = getClient();
  try {
    const response = await client.send(
      new GetObjectCommand({ Bucket: BUCKET!, Key: graphKey(rabbitHoleId) })
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
export async function putGraphObject(rabbitHoleId: string, json: string): Promise<void> {
  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET!,
      Key: graphKey(rabbitHoleId),
      Body: json,
      ContentType: "application/json",
    })
  );
}

/** Delete the stored graph for a rabbit hole. No-op if it doesn't exist. */
export async function deleteGraphObject(rabbitHoleId: string): Promise<void> {
  const client = getClient();
  try {
    await client.send(
      new DeleteObjectCommand({ Bucket: BUCKET!, Key: graphKey(rabbitHoleId) })
    );
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (status === 404) return;
    throw err;
  }
}

/** List all stored graph rabbit hole IDs. */
export async function listGraphObjects(): Promise<string[]> {
  const client = getClient();
  const response = await client.send(
    new ListObjectsV2Command({ Bucket: BUCKET!, Prefix: "graphs/" })
  );
  return (response.Contents ?? [])
    .map((obj) => obj.Key ?? "")
    .filter((key) => key.endsWith(".json"))
    .map((key) => key.replace(/^graphs\//, "").replace(/\.json$/, ""));
}
