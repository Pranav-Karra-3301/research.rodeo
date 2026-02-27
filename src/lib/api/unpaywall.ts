const UNPAYWALL_BASE_URL = "https://api.unpaywall.org/v2";

function getEmail(): string {
  const email = process.env.UNPAYWALL_EMAIL;
  if (!email)
    throw new Error("UNPAYWALL_EMAIL environment variable is not set");
  return email;
}

interface UnpaywallOALocation {
  url: string;
  url_for_pdf?: string;
  url_for_landing_page?: string;
  evidence?: string;
  license?: string;
  version?: string;
  host_type?: string;
  is_best?: boolean;
}

interface UnpaywallResponse {
  doi: string;
  title?: string;
  is_oa: boolean;
  best_oa_location?: UnpaywallOALocation;
  oa_locations?: UnpaywallOALocation[];
}

export interface OpenAccessResult {
  isOpenAccess: boolean;
  bestUrl?: string;
  pdfUrl?: string;
  landingPageUrl?: string;
  license?: string;
  version?: string;
}

export async function findOpenAccess(doi: string): Promise<OpenAccessResult> {
  const email = getEmail();
  const encodedDoi = encodeURIComponent(doi);
  const url = `${UNPAYWALL_BASE_URL}/${encodedDoi}?email=${encodeURIComponent(email)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Request to Unpaywall timed out after 15s`);
    }
    throw err;
  }

  if (res.status === 404) {
    return { isOpenAccess: false };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`Unpaywall API error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as UnpaywallResponse;

  if (!data.is_oa || !data.best_oa_location) {
    return { isOpenAccess: false };
  }

  const best = data.best_oa_location;
  return {
    isOpenAccess: true,
    bestUrl: best.url_for_pdf || best.url_for_landing_page || best.url,
    pdfUrl: best.url_for_pdf,
    landingPageUrl: best.url_for_landing_page,
    license: best.license,
    version: best.version,
  };
}
