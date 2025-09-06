// src/app/api/hpg/nearby/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

const HPG_ENDPOINT = "http://webservice.recruit.co.jp/hotpepper/gourmet/v1/";

// 3km (range=5) を並べて広域をカバーするためのグリッド生成
function metersToDegrees(lat: number, dx: number, dy: number) {
  const mPerDegLat = 111_320; // おおよそ
  const mPerDegLon = 111_320 * Math.cos((lat * Math.PI) / 180);
  return { dLat: dy / mPerDegLat, dLon: dx / mPerDegLon };
}

function buildGridCenters(lat: number, lon: number, radiusM: number) {
  // 1点あたり 3000m（range=5）の検索を使う。少し重ねるために 2400m ピッチで配置
  const step = 2400; // m（オーバーラップを持たせる）
  const centers: Array<{ lat: number; lon: number }> = [];

  for (let y = -radiusM; y <= radiusM; y += step) {
    for (let x = -radiusM; x <= radiusM; x += step) {
      // 円の外はスキップ（四隅を減らす）
      if (Math.hypot(x, y) > radiusM) continue;
      const { dLat, dLon } = metersToDegrees(lat, x, y);
      centers.push({ lat: lat + dLat, lon: lon + dLon });
    }
  }

  // 原点（中心）を先頭に
  centers.sort((a, b) => {
    const da = Math.hypot(a.lat - lat, a.lon - lon);
    const db = Math.hypot(b.lat - lat, b.lon - lon);
    return da - db;
  });

  return centers;
}

export async function GET(req: Request) {
  try {
    const KEY = process.env.HOTPEPPER_API_KEY;
    if (!KEY) {
      return NextResponse.json(
        { ok: false, error: "HOTPEPPER_API_KEY missing (.env.local)" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const lat = Number(searchParams.get("lat"));
    const lng = Number(searchParams.get("lng"));
    const count = Number(searchParams.get("count") ?? "30");
    const order = searchParams.get("order") ?? "3";

    // 新パラメータ：radius_m（任意）。無い場合は range を使う。
    const radiusMParam = searchParams.get("radius_m");
    const radiusM = radiusMParam ? Number(radiusMParam) : null;

    // 従来の range も受けつつ、UIからは radius_m を送れるようにする
    const rangeRaw = searchParams.get("range");
    const range = rangeRaw ? Number(rangeRaw) : undefined;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ ok: false, error: "lat/lng required" }, { status: 400 });
    }

    // === 3km以下：素直に 1..5 にマップ ===
    if (!radiusM || radiusM <= 3000) {
      const qp = new URLSearchParams({
        key: KEY,
        format: "json",
        type: "lite",
        lat: String(lat),
        lng: String(lng),
        range: String(range ?? 3),
        order,
        count: String(count),
      });

      // 任意フィルターをパススルー
      const passthrough = ["keyword","genre","budget","start","datum"];
      for (const [k, v] of searchParams.entries()) {
        if (passthrough.includes(k) && v) qp.append(k, v);
      }

      const url = `${HPG_ENDPOINT}?${qp.toString()}`;
      const r = await fetch(url, { cache: "no-store", headers: { "User-Agent": "DinnerApp/1.0" } });
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        return NextResponse.json({ ok: false, upstreamStatus: r.status, upstreamBody: text.slice(0, 2000) }, { status: 502 });
      }
      const json = await r.json();
      const shops: any[] = json?.results?.shop ?? [];
      const items = shops.map((s: any) => ({
        id: s.id,
        name: s.name,
        address: s.address,
        access: s.access,
        genre: s.genre?.name,
        lat: s.lat ? Number(s.lat) : undefined,
        lng: s.lng ? Number(s.lng) : undefined,
        url: s.urls?.pc,
        photo: s.photo?.pc?.l || s.photo?.pc?.m || s.photo?.pc?.s || null,
      }));
      return NextResponse.json({
        ok: true,
        total: Number(json?.results?.results_available ?? items.length),
        returned: Number(json?.results?.results_returned ?? items.length),
        start: Number(json?.results?.results_start ?? 1),
        items,
      });
    }

    // === 3km超：グリッドで複数回叩いてマージ（各回 range=5） ===
    const centers = buildGridCenters(lat, lng, radiusM);
    // フィルタ類
    const passthrough = ["keyword","genre","budget","datum"];
    const extra = new URLSearchParams();
    for (const [k, v] of searchParams.entries()) {
      if (passthrough.includes(k) && v) extra.append(k, v);
    }

    // 1回あたりの取得件数（多すぎると重いので抑制）
    const perCall = Math.min(30, Math.max(10, Math.floor(count / 2) || 20));

    const requests = centers.map(({ lat: clat, lon: clon }) => {
      const qp = new URLSearchParams({
        key: KEY,
        format: "json",
        type: "lite",
        lat: String(clat),
        lng: String(clon),
        range: "5",  // 最大3km
        order,
        count: String(perCall),
      });
      for (const [k, v] of extra.entries()) qp.append(k, v);
      const url = `${HPG_ENDPOINT}?${qp.toString()}`;
      return fetch(url, { cache: "no-store", headers: { "User-Agent": "DinnerApp/1.0" } })
        .then(async (r) => (r.ok ? r.json() : { _error: await r.text().catch(() => "") }))
        .catch((e) => ({ _error: String(e) }));
    });

    const results = await Promise.allSettled(requests);

    const map = new Map<string, any>();
    for (const res of results) {
      if (res.status !== "fulfilled" || (res.value as any)?._error) continue;
      const json = res.value as any;
      const shops: any[] = json?.results?.shop ?? [];
      for (const s of shops) {
        if (!map.has(s.id)) {
          map.set(s.id, {
            id: s.id,
            name: s.name,
            address: s.address,
            access: s.access,
            genre: s.genre?.name,
            lat: s.lat ? Number(s.lat) : undefined,
            lng: s.lng ? Number(s.lng) : undefined,
            url: s.urls?.pc,
            photo: s.photo?.pc?.l || s.photo?.pc?.m || s.photo?.pc?.s || null,
          });
        }
      }
      // 取得件数が十分集まったら早期終了（軽量化）
      if (map.size >= count * 2) break;
    }

    // 近い順で上位 count 件を返す（距離計算の簡易版）
    const toRad = (x: number) => (x * Math.PI) / 180;
    const dist = (aLat: number, aLon: number, bLat?: number, bLon?: number) => {
      if (bLat == null || bLon == null) return Number.POSITIVE_INFINITY;
      const R = 6371000;
      const dLat = toRad(bLat - aLat);
      const dLon = toRad(bLon - aLon);
      const la1 = toRad(aLat);
      const la2 = toRad(bLat);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(h));
    };

    const merged = Array.from(map.values())
      .map((s: any) => ({ ...s, _d: dist(lat, lng, s.lat, s.lng) }))
      .sort((a, b) => a._d - b._d)
      .slice(0, count)
      .map(({ _d, ...rest }) => rest);

    return NextResponse.json({
      ok: true,
      total: merged.length,
      returned: merged.length,
      start: 1,
      items: merged,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Server exception", detail: String(e?.message ?? e) }, { status: 500 });
  }
}
