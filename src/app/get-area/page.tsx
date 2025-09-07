'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Utensils, LocateFixed, Loader2 } from "lucide-react";

import {
  Alert,
  AlertTitle,
  Box,
  Chip,
  Container,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  LinearProgress,
  Link,
  List,
  ListItem,
  ListItemButton,
  Select as MUISelect,
  MenuItem,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles'; // ★ 追加（半透明色の生成で使用）

import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Genre = { code: string; name: string; catch?: string | null };
type Budget = { code: string; name: string };

type GeoResult = {
  ok: boolean;
  place_id?: number;
  lat?: string;
  lon?: string;
  area?: string;
  locality?: string;
  display_name?: string;
  address?: Record<string, string>;
  boundingbox?: [string, string, string, string];
};

function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function GetAreaPageContent() {
  const [status, setStatus] = useState<'idle' | 'locating' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [area, setArea] = useState<string>('');
  const [result, setResult] = useState<GeoResult | null>(null);
  const [shops, setShops] = useState<any[]>([]);
  const [loadingShops, setLoadingShops] = useState(false);
  const [shopsError, setShopsError] = useState<string | null>(null);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<string>('');
  const [selectedBudget, setSelectedBudget] = useState<string>('');
  const [range, setRange] = useState<number>(3);
  const [searched, setSearched] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const router = useRouter();
  const sp = useSearchParams();
  const returnTo = sp.get('returnTo') || '/';

  useEffect(() => {
    (async () => {
      try {
        const [g, b] = await Promise.all([
          fetch('/api/hpg/masters/genre').then((r) => r.json()),
          fetch('/api/hpg/masters/budget').then((r) => r.json()),
        ]);
        if (g?.ok) setGenres(g.items);
        if (b?.ok) setBudgets(b.items);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const fetchNearby = useCallback(async () => {
    if (!coords) return;
    setLoadingShops(true);
    setShopsError(null);
    try {
      const q = new URLSearchParams({
        lat: String(coords.lat),
        lng: String(coords.lon),
        count: '30',
        order: '4',
      });

      if (range <= 5) q.set('range', String(range));
      else q.set('radius_m', String(range));

      if (selectedGenre) q.set('genre', selectedGenre);
      if (selectedBudget) q.set('budget', selectedBudget);

      const r = await fetch(`/api/hpg/nearby?${q.toString()}`);
      const payload = await r.json().catch(async () => {
        const txt = await r.text().catch(() => '');
        throw new Error(`API ${r.status}: ${txt.slice(0, 500)}`);
      });
      if (!r.ok || !payload?.ok) {
        const reason = payload?.upstreamBody || payload?.detail || payload?.error || `HTTP ${r.status}`;
        throw new Error(`HotPepper取得失敗: ${String(reason).slice(0, 500)}`);
      }
      setShops(payload.items ?? []);
    } catch (e: any) {
      setShopsError(e?.message ?? '不明なエラー');
    } finally {
      setLoadingShops(false);
      setSearched(true);
    }
  }, [coords, selectedGenre, selectedBudget, range]);

  const shopsWithDistance = useMemo(() => {
    if (!coords) return shops;
    return shops
      .map((s) => {
        const d = s.lat && s.lng ? haversine({ lat: coords.lat, lon: coords.lon }, { lat: s.lat, lon: s.lng }) : null;
        return { ...s, distance: d };
      })
      .sort((a, b) => {
        if (a.distance == null && b.distance == null) return 0;
        if (a.distance == null) return 1;
        if (b.distance == null) return -1;
        return a.distance - b.distance;
      });
  }, [shops, coords]);

  const askLocation = useCallback(() => {
    setStatus('locating');
    setError(null);

    if (!('geolocation' in navigator)) {
      setStatus('error');
      setError('この端末では位置情報が利用できません。');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lon: longitude });
        setStatus('loading');

        abortRef.current?.abort();
        abortRef.current = new AbortController();
        const ac = abortRef.current;

        const url = `/api/reverse-geocode?lat=${latitude}&lon=${longitude}`;
        fetch(url, { signal: ac.signal })
          .then(async (r) => {
            if (!r.ok) throw new Error(`API error: ${r.status}`);
            const json = (await r.json()) as GeoResult;
            if (!json.ok) throw new Error('逆ジオコーディングに失敗しました。');
            setResult(json);
            setArea(json.area || '');
            setStatus('done');
          })
          .catch((e: unknown) => {
            if ((e as any)?.name === 'AbortError') return;
            console.error(e);
            setError(e instanceof Error ? e.message : '不明なエラー');
            setStatus('error');
          });
      },
      (err) => {
        console.error(err);
        setStatus('error');
        setError(
          err.code === err.PERMISSION_DENIED
            ? '位置情報の利用が拒否されました。ブラウザの設定を確認してください。'
            : err.code === err.POSITION_UNAVAILABLE
            ? '現在地を取得できませんでした。屋内や地下では精度が低下することがあります。'
            : err.code === err.TIMEOUT
            ? '位置情報の取得がタイムアウトしました。'
            : '位置情報の取得に失敗しました。',
        );
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 15_000 },
    );
  }, []);

  useEffect(() => {
    askLocation();
    return () => abortRef.current?.abort();
  }, [askLocation]);

  const pick = (name: string) => {
    const trimmed = (name ?? '').trim();
    if (!trimmed) return;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('pendingFoodCandidate', trimmed);
      } catch {}
    }
    router.push(returnTo || '/');
  };

  return (
    // ★ 背景をピンク→パープルのグラデに（Tailwindの from-pink-400 via-purple-500 to-indigo-600 相当）
    <Box
      sx={{
        minHeight: '100vh',
        py: 4,
        backgroundImage: 'linear-gradient(135deg, #f472b6 0%, #8b5cf6 55%, #4f46e5 100%)',
      }}
    >
      <Container maxWidth="md">
        <Stack spacing={3}>
          {/* ★ ヘッダー：白文字＆軽めのドロップシャドウ */}
          <Box sx={{ textAlign: 'center' }}>
            <Typography
              variant="h5"
              fontWeight={800}
              sx={{ color: 'white', textShadow: '0 1px 8px rgba(0,0,0,0.25)' }}
            >
              飲食店検索
            </Typography>
            <Typography sx={{ color: alpha('#fff', 0.9) }}>
              現在地から「エリア」を取得して、近くの飲食店を提案します。
            </Typography>
          </Box>

          {/* ★ 位置取得カード */}
          <Stack spacing={1}>
            <Box>
              <Button
                onClick={askLocation}
                disabled={status === "locating" || status === "loading"}
                className="h-12 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-6 font-semibold text-white shadow-lg transition-all duration-200 hover:scale-105 hover:from-purple-600 hover:to-pink-600 hover:shadow-xl disabled:transform-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status === "locating" || status === "loading" ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
                    <span>取得中...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <LocateFixed className="h-5 w-5" />
                    <span>現在地からエリア取得</span>
                  </div>
                )}
              </Button>
            </Box>

            {status === 'error' && (
              <Alert
                severity="error"
                variant="filled"
                sx={{
                  borderRadius: 2,
                  bgcolor: alpha('#ef4444', 0.9),
                  color: 'white',
                }}
              >
                エラー：{error}
              </Alert>
            )}

            {coords && (
              <Typography sx={{ color: alpha('#fff', 0.9) }}>
                取得座標：{coords.lat.toFixed(5)}, {coords.lon.toFixed(5)}
              </Typography>
            )}

            {status === 'done' && result && (
              <Card className="rounded-3xl border border-white/30 bg-white/20 backdrop-blur-md shadow-xl">
                <CardContent className="p-4">
                  <Stack spacing={0.5}>
                    <Typography variant="caption" sx={{ color: alpha('#111', 0.7) }}>
                      推定エリア
                    </Typography>
                    <Typography variant="h6" fontWeight={700} sx={{ color: '#111' }}>
                      {area || '（不明）'}
                    </Typography>
                    {result.locality && (
                      <Typography sx={{ color: alpha('#111', 0.7) }}>
                        近接ローカリティ：{result.locality}
                      </Typography>
                    )}
                    {result.display_name && (
                      <Typography variant="caption" sx={{ color: alpha('#111', 0.6) }}>
                        詳細：{result.display_name}
                      </Typography>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            )}
          </Stack>

          {/* ★ 絞り込みUI */}
          <Card className="rounded-3xl border border-white/30 bg-white/20 backdrop-blur-md shadow-xl">
            <CardContent className="p-4">
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="genre-label">ジャンル</InputLabel>
                    <MUISelect
                      labelId="genre-label"
                      label="ジャンル"
                      value={selectedGenre || ''}
                      onChange={(e) => setSelectedGenre(e.target.value as string)}
                    >
                      <MenuItem value="">指定なし</MenuItem>
                      {genres.map((g) => (
                        <MenuItem key={g.code} value={g.code}>
                          {g.name}
                        </MenuItem>
                      ))}
                    </MUISelect>
                  </FormControl>
                </Grid>

                <Grid item xs={12} sm={4}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="budget-label">価格帯（ディナー予算）</InputLabel>
                    <MUISelect
                      labelId="budget-label"
                      label="価格帯（ディナー予算）"
                      value={selectedBudget || ''}
                      onChange={(e) => setSelectedBudget(e.target.value as string)}
                    >
                      <MenuItem value="">指定なし</MenuItem>
                      {budgets.map((b) => (
                        <MenuItem key={b.code} value={b.code}>
                          {b.name}
                        </MenuItem>
                      ))}
                    </MUISelect>
                  </FormControl>
                </Grid>

                <Grid item xs={12} sm={4}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="range-label">検索範囲</InputLabel>
                    <MUISelect
                      labelId="range-label"
                      label="検索範囲"
                      value={String(range)}
                      onChange={(e) => setRange(Number(e.target.value))}
                    >
                      <MenuItem value="1">300m</MenuItem>
                      <MenuItem value="2">500m</MenuItem>
                      <MenuItem value="3">1000m（既定）</MenuItem>
                      <MenuItem value="4">2000m</MenuItem>
                      <MenuItem value="5">3000m</MenuItem>
                      <MenuItem value="5000">5000m</MenuItem>
                      <MenuItem value="10000">10000m</MenuItem>
                    </MUISelect>
                  </FormControl>
                </Grid>

                <Grid item xs={12}>
                  <Button
                    onClick={fetchNearby}
                    disabled={!coords || loadingShops}
                    className="h-16 w-full transform rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-8 py-4 font-semibold text-white shadow-lg transition-all duration-200 hover:scale-105 hover:from-purple-600 hover:to-pink-600 hover:shadow-xl disabled:transform-none disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loadingShops ? (
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
                        <span>検索中...</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Utensils className="mr-3 h-6 w-6" />
                        <span>条件で検索する</span>
                      </div>
                    )}
                  </Button>
                </Grid>

              </Grid>
            </CardContent>
          </Card>

          {/* 検索結果 */}
          <Stack spacing={1}>
            {shopsError && (
              <Alert
                severity="error"
                variant="filled"
                sx={{ borderRadius: 2, bgcolor: alpha('#ef4444', 0.9), color: 'white' }}
              >
                エラー：{shopsError}
              </Alert>
            )}

            {loadingShops && (
              <LinearProgress
                sx={{
                  height: 6,
                  borderRadius: 3,
                  bgcolor: alpha('#fff', 0.35),
                  '& .MuiLinearProgress-bar': { bgcolor: alpha('#fff', 0.9) },
                }}
              />
            )}

            {!loadingShops && !shopsError && shopsWithDistance.length > 0 && (
              <Card className="rounded-3xl border border-white/30 bg-white/20 backdrop-blur-md shadow-xl">
                <CardContent className="p-4">
                  <List disablePadding>
                    {shopsWithDistance.map((s, idx) => (
                      <Fragment key={s.id}>
                        <ListItem disableGutters sx={{ px: 0 }}>
                          <ListItemButton
                            onClick={() => pick(s.name)}
                            sx={{
                              px: 2,
                              py: 1.5,
                              alignItems: 'flex-start',
                              borderRadius: 2,
                              '&:hover': {
                                bgcolor: alpha('#fff', 0.5),
                              },
                              transition: 'background-color .15s ease',
                            }}
                            title="この店名を候補に入れる"
                          >
                            <Box
                              component={s.photo ? 'img' : 'div'}
                              src={s.photo || undefined}
                              sx={{
                                width: 64,
                                height: 64,
                                borderRadius: 1.5,
                                objectFit: 'cover',
                                bgcolor: alpha('#000', 0.08),
                                mr: 2,
                                flex: '0 0 auto',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                              }}
                            />
                            <Box sx={{ minWidth: 0, flex: 1 }}>
                              <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
                                <Typography variant="subtitle1" noWrap sx={{ color: '#111', fontWeight: 700 }}>
                                  {s.name}
                                </Typography>
                                {s.distance != null && (
                                  <Chip
                                    size="small"
                                    label={`${(s.distance / 1000).toFixed(2)} km`}
                                    sx={{
                                      bgcolor: alpha('#111', 0.08),
                                      borderColor: alpha('#111', 0.2),
                                    }}
                                    variant="outlined"
                                  />
                                )}
                              </Stack>
                              <Typography variant="body2" noWrap sx={{ color: alpha('#111', 0.7) }}>
                                {s.genre ? `${s.genre}・` : ''}
                                {s.address}
                              </Typography>
                              {s.access && (
                                <Typography variant="caption" sx={{ mt: 0.5, display: 'block', color: alpha('#111', 0.6) }}>
                                  {s.access}
                                </Typography>
                              )}
                              {s.url && (
                                <Link
                                  href={s.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  underline="hover"
                                  sx={{ mt: 1, display: 'inline-block', color: '#111', fontWeight: 600 }}
                                >
                                  店舗ページへ
                                </Link>
                              )}
                            </Box>
                          </ListItemButton>
                        </ListItem>
                        {idx < shopsWithDistance.length - 1 && (
                          <Divider component="li" sx={{ borderColor: alpha('#000', 0.12) }} />
                        )}
                      </Fragment>
                    ))}
                  </List>
                </CardContent>
              </Card>
            )}

            {!loadingShops && !shopsError && searched && shopsWithDistance.length === 0 && (
              <Alert
                severity="info"
                sx={{
                  borderRadius: 2,
                  bgcolor: alpha('#ffffff', 0.22),
                  color: 'white',
                  border: `1px solid ${alpha('#ffffff', 0.35)}`,
                  backdropFilter: 'blur(8px)',
                }}
              >
                <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap">
                  <Box>
                    <AlertTitle sx={{ color: 'white' }}>該当する店舗が見つかりませんでした</AlertTitle>
                    <Typography sx={{ color: alpha('#fff', 0.9) }}>
                      条件を緩めるか、検索範囲を広げて再検索してください。
                    </Typography>
                  </Box>
                  <Stack direction="row" gap={1}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const next = Number(range) <= 5 ? 5000 : 10000;
                        setRange(next);
                        fetchNearby();
                      }}
                      className={[
                        'rounded-xl border-white/60 text-white',
                        'hover:bg-white/10',
                      ].join(' ')}
                    >
                      範囲を広げて再検索
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedGenre('');
                        setSelectedBudget('');
                        fetchNearby();
                      }}
                      className={[
                        'rounded-xl text-white',
                        'hover:bg-white/10',
                      ].join(' ')}
                    >
                      絞り込みを解除
                    </Button>
                  </Stack>
                </Stack>
              </Alert>
            )}
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}

export default function GetAreaPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <GetAreaPageContent />
    </Suspense>
  );
}
