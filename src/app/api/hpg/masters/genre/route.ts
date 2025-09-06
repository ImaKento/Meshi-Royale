export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function GET() {
  const KEY = process.env.HOTPEPPER_API_KEY;
  if (!KEY) {
    return NextResponse.json({ ok:false, error:"HOTPEPPER_API_KEY missing" }, { status:500 });
  }

  const url = `http://webservice.recruit.co.jp/hotpepper/genre/v1/?key=${KEY}&format=json`;
  try {
    const r = await fetch(url, { cache: "no-store", headers: { "User-Agent": "DinnerApp/1.0" }});
    if (!r.ok) {
      const text = await r.text().catch(()=> "");
      return NextResponse.json({ ok:false, upstreamStatus:r.status, upstreamBody:text.slice(0,1000) }, { status:502 });
    }
    const json = await r.json();
    const list = (json?.results?.genre ?? []).map((g:any)=> ({
      code: g.code, name: g.name, catch: g.catch ?? null,
    }));
    return NextResponse.json({ ok:true, items:list });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:"Server exception", detail:String(e?.message ?? e) }, { status:500 });
  }
}
