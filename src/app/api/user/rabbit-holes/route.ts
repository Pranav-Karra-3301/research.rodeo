import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth/helpers";
import {
  getUserRabbitHoleIds,
  claimRabbitHole,
  unclaimRabbitHole,
  setRabbitHoleVisibility,
  type RabbitHoleVisibility,
} from "@/lib/auth/user-data";

/** GET /api/user/rabbit-holes — Get rabbit hole ownership for current user. */
export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const holes = await getUserRabbitHoleIds(userId);
    return NextResponse.json({ rabbitHoles: holes });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/user/rabbit-holes — Claim or update a rabbit hole. */
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const VALID_VISIBILITIES: RabbitHoleVisibility[] = ["private", "public"];

  let body: { rabbitHoleId?: string; visibility?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { rabbitHoleId, action } = body;
  const visibility = body.visibility as RabbitHoleVisibility | undefined;

  if (!rabbitHoleId || typeof rabbitHoleId !== "string") {
    return NextResponse.json({ error: "rabbitHoleId is required" }, { status: 400 });
  }

  if (visibility && !VALID_VISIBILITIES.includes(visibility)) {
    return NextResponse.json({ error: "visibility must be 'private' or 'public'" }, { status: 400 });
  }

  try {
    if (action === "unclaim") {
      await unclaimRabbitHole(userId, rabbitHoleId);
      return NextResponse.json({ status: "ok", action: "unclaimed" });
    }

    if (action === "set-visibility") {
      if (!visibility) {
        return NextResponse.json({ error: "visibility is required for set-visibility" }, { status: 400 });
      }
      await setRabbitHoleVisibility(userId, rabbitHoleId, visibility);
      return NextResponse.json({ status: "ok", visibility });
    }

    // Default: claim
    const v = visibility ?? "private";
    await claimRabbitHole(userId, rabbitHoleId, v);
    return NextResponse.json({ status: "ok", action: "claimed", visibility: v });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
