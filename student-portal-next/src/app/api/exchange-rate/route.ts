import { NextResponse } from "next/server";

function getMainPortalBaseUrl() {
  if (process.env.MAIN_PORTAL_BASE_URL) {
    return String(process.env.MAIN_PORTAL_BASE_URL).trim().replace(/\/$/, "");
  }

  return "https://www.ieltscambridge.com";
}

export async function GET() {
  try {
    const response = await fetch(`${getMainPortalBaseUrl()}/api/exchange-rate`, {
      cache: "no-store",
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: "Unable to retrieve the live USD/LKR exchange rate." }, { status: 502 });
  }
}
