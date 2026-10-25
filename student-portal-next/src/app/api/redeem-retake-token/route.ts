import { NextRequest, NextResponse } from "next/server";

function getMainPortalBaseUrl(request: NextRequest) {
  if (process.env.MAIN_PORTAL_BASE_URL) {
    return String(process.env.MAIN_PORTAL_BASE_URL).trim().replace(/\/$/, "");
  }

  return "https://www.ieltscambridge.com";
}

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const response = await fetch(`${getMainPortalBaseUrl(request)}/api/retake-tokens/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: "Unable to redeem retake token." }, { status: 502 });
  }
}
