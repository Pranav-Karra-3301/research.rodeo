import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// The only page is prerendered at build time and nothing revalidates, so the
// read-only static assets cache is enough (no R2/KV bindings needed). API
// routes are dynamic and bypass the cache.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
});
