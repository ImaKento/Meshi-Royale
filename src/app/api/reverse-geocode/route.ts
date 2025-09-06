// src/app/api/reverse-geocode/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

const UA = "DinnerApp/1.0 (contact: e.nao.0921.nao.e@gmail.com)";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = searchParams.get("lat");
    const lon = searchParams.get("lon");
    if (!lat || !lon) {
      return NextResponse.json({ ok:false, error:"lat/lon required" }, { status:400 });
    }

    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", lat);
    url.searchParams.set("lon", lon);
    url.searchParams.set("zoom", "14");
    url.searchParams.set("addressdetails", "1");

    const res = await fetch(url.toString(), {
      cache: "no-store",
      headers: {
        "User-Agent": UA,
        "Accept-Language": "ja,en;q=0.8",
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { ok:false, upstreamStatus:res.status, upstreamBody:text.slice(0,1000) },
        { status:502 }
      );
    }

    const data = await res.json();
    const a = data.address || {};
    const area =
      a.city || a.town || a.village || a.municipality ||
      a.suburb || a.city_district || a.county || a.state || a.region || "";
    const locality =
      a.neighbourhood || a.suburb || a.hamlet || a.quarter || a.residential || "";

    return NextResponse.json({
      ok:true,
      place_id: data.place_id,
      lat: data.lat, lon: data.lon,
      area, locality,
      display_name: data.display_name,
      address: data.address,
      boundingbox: data.boundingbox,
    });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:"Server exception", detail:String(e?.message ?? e) }, { status:500 });
  }
}
