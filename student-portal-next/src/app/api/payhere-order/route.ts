import { NextRequest, NextResponse } from "next/server";

function getMainPortalBaseUrl(request: NextRequest) {
  if (process.env.MAIN_PORTAL_BASE_URL) {
    return String(process.env.MAIN_PORTAL_BASE_URL).trim().replace(/\/$/, "");
  }

  const proto = String(request.headers.get("x-forwarded-proto") || request.nextUrl.protocol || "https").replace(/:$/, "");
  const forwardedHost = String(request.headers.get("x-forwarded-host") || request.headers.get("host") || "www.ieltscambridge.com").trim();
  const [hostname, maybePort] = forwardedHost.split(":");
  const port = maybePort === "3000" ? "5500" : maybePort;
  return `${proto}://${port ? `${hostname}:${port}` : hostname}`;
}

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const response = await fetch(`${getMainPortalBaseUrl(request)}/api/payments/create-payhere-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: "Unable to start PayHere payment." }, { status: 502 });
  }
}
