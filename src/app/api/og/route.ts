import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import sharp from "sharp";

const MAX_BYTES = 300 * 1024;

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const path = join(process.cwd(), "public", "preview.png");
    const buffer = await readFile(path);

    let result = await sharp(buffer)
      .resize(1200, 630, { fit: "cover", position: "center" })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();

    if (result.length > MAX_BYTES) {
      let quality = 82;
      while (quality >= 40) {
        result = await sharp(buffer)
          .resize(1200, 630, { fit: "cover", position: "center" })
          .jpeg({ quality, mozjpeg: true })
          .toBuffer();
        if (result.length <= MAX_BYTES) {
          return new NextResponse(result.buffer as ArrayBuffer, {
            headers: {
              "Content-Type": "image/jpeg",
              "Cache-Control": "public, max-age=86400",
            },
          });
        }
        quality -= 10;
      }
    }

    return new NextResponse(result.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (e) {
    console.error("[research-rodeo] [og] error:", e);
    return new NextResponse(null, { status: 404 });
  }
}
