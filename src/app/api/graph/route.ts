import { NextResponse } from "next/server";
import { getGraphObject, putGraphObject, isR2Configured } from "@/lib/r2";
import { parseGraphSnapshot } from "@/lib/graph/snapshot";
import type { GraphSnapshot } from "@/lib/graph/snapshot";
import { getUserId } from "@/lib/auth/helpers";

/** GET /api/graph?rabbitHoleId=<id> — Load a graph snapshot from R2. */
export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const rabbitHoleId = searchParams.get("rabbitHoleId");

  if (!rabbitHoleId) {
    return NextResponse.json(
      { error: "rabbitHoleId query parameter is required", status: "error" },
      { status: 400 }
    );
  }

  if (!isR2Configured()) {
    return NextResponse.json({ graph: null, r2Available: false }, { status: 200 });
  }

  try {
    const json = await getGraphObject(userId, rabbitHoleId);
    if (!json) {
      return NextResponse.json({ graph: null, r2Available: true }, { status: 200 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      console.error(`[r2/graph] Failed to parse stored JSON for hole ${rabbitHoleId}`);
      return NextResponse.json({ graph: null, r2Available: true }, { status: 200 });
    }

    const snapshot = parseGraphSnapshot(parsed);
    if (!snapshot) {
      console.warn(`[r2/graph] Invalid snapshot format for hole ${rabbitHoleId}; ignoring`);
      return NextResponse.json({ graph: null, r2Available: true }, { status: 200 });
    }

    return NextResponse.json({ graph: snapshot, r2Available: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[r2/graph] GET error for hole ${rabbitHoleId}:`, message);
    return NextResponse.json(
      { error: message, status: "error" },
      { status: 500 }
    );
  }
}

/** POST /api/graph — Save a graph snapshot to R2. */
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: { rabbitHoleId?: string; graph?: GraphSnapshot };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", status: "error" },
      { status: 400 }
    );
  }

  const { rabbitHoleId, graph } = body;

  if (!rabbitHoleId || typeof rabbitHoleId !== "string") {
    return NextResponse.json(
      { error: "rabbitHoleId is required", status: "error" },
      { status: 400 }
    );
  }

  if (!graph) {
    return NextResponse.json(
      { error: "graph payload is required", status: "error" },
      { status: 400 }
    );
  }

  const snapshot = parseGraphSnapshot(graph);
  if (!snapshot) {
    return NextResponse.json(
      { error: "Invalid graph snapshot (must have version:1, nodes, edges, clusters, weights)", status: "error" },
      { status: 400 }
    );
  }

  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "Cloudflare R2 is not configured on this server", status: "error" },
      { status: 503 }
    );
  }

  try {
    await putGraphObject(userId, rabbitHoleId, JSON.stringify(snapshot));
    return NextResponse.json({ status: "ok", updatedAt: snapshot.updatedAt }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[r2/graph] POST error for hole ${rabbitHoleId}:`, message);
    return NextResponse.json(
      { error: message, status: "error" },
      { status: 500 }
    );
  }
}
