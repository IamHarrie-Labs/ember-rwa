import { NextRequest, NextResponse } from "next/server";

/// A thin, same-origin proxy over Cloudflare's DoH JSON API. Exists only so the self-serve
/// listing flow can check a domain's TXT records from the browser without depending on a
/// third-party endpoint's CORS policy holding steady in production.
export async function GET(req: NextRequest) {
  const domain = req.nextUrl.searchParams.get("domain")?.trim().toLowerCase();
  if (!domain) {
    return NextResponse.json({ error: "missing domain" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=TXT`,
      { headers: { accept: "application/dns-json" }, cache: "no-store" }
    );
    if (!res.ok) {
      return NextResponse.json({ error: `resolver returned ${res.status}` }, { status: 502 });
    }
    const body = await res.json();
    // DoH wraps each string chunk in quotes and may split long values; strip the quoting,
    // the agent's own resolver already handles multi-chunk joins for the values that matter.
    const records: string[] = (body.Answer || [])
      .map((a: { data?: string }) => (a.data || "").replace(/^"|"$/g, ""))
      .filter(Boolean);
    return NextResponse.json({ records });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "resolver request failed" },
      { status: 502 }
    );
  }
}
