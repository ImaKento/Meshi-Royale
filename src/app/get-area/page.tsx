'use client';

import {
  Alert,
  AlertTitle,
  Box,
  Button,
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

import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Genre = { code: string; name: string; catch?: string | null };
type Budget = { code: string; name: string };

type GeoResult = {
  ok: boolean;
  place_id?: number;
  lat?: string;
  lon?: string;
  area?: string; // ここをメインに使う
  locality?: string;
  display_name?: string;
  address?: Record<string, string>;
  boundingbox?: [string, string, string, string];
};

function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371000; // meters
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h)); // meters
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
  const [selectedGenre, setSelectedGenre] = useState<string>(''); // HotPepper genre code
  const [selectedBudget, setSelectedBudget] = useState<string>(''); // HotPepper budget code
  const [range, setRange] = useState<number>(3); // 1:300m, 2:500m, 3:1000m, 4:2000m, 5:3000m, 6:5000m, 7:10000m
  const [searched, setSearched] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const router = useRouter();
  const sp = useSearchParams();
  const returnTo = sp.get('returnTo') || '/';

  useEffect(() => {
    (async () => {
      try {
        const [g, b] = await Promise.all([
          fetch('/api/hpg/masters/genre').then(r => r.json()),
          fetch('/api/hpg/masters/budget').then(r => r.json()),
        ]);
        if (g?.ok) setGenres(g.items);
        if (b?.ok) setBudgets(b.items);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  // --- 近くの飲食店を取得（ジャンル/予算/範囲 反映） ---
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

      // 3000m までは HotPepper の range を使う
      if (range <= 5) {
        q.set('range', String(range));
      } else {
        // 5000 / 10000 → サーバーで広域サーチ
        q.set('radius_m', String(range)); // ここでは「メートル値」を直接入れる
      }

      // 任意: ジャンル・価格帯
      if (selectedGenre) q.set('genre', selectedGenre);
      if (selectedBudget) q.set('budget', selectedBudget);

      const r = await fetch(`/api/hpg/nearby?${q.toString()}`);
      const payload = await r.json().catch(async () => {
        const txt = await r.text().catch(() => '');
        throw new Error(`API ${r.status}: ${txt.slice(0, 500)}`);
      });
      if (!r.ok || !payload?.ok) {
        const reason =
          payload?.upstreamBody || payload?.detail || payload?.error || `HTTP ${r.status}`;
        throw new Error(`HotPepper取得失敗: ${String(reason).slice(0, 500)}`);
      }
      setShops(payload.items ?? []);
    } catch (e: any) {
      setShopsError(e?.message ?? '不明なエラー');
    } finally {
      setLoadingShops(false);
      setSearched(true); // ← 検索を一度でも実行したことを記録
    }
  }, [coords, selectedGenre, selectedBudget, range]);

  // --- 並び替え（距離が近い順） ---
  const shopsWithDistance = useMemo(() => {
    if (!coords) return shops;
    return shops
      .map(s => {
        const d =
          s.lat && s.lng
            ? haversine({ lat: coords.lat, lon: coords.lon }, { lat: s.lat, lon: s.lng })
            : null;
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
      pos => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lon: longitude });
        setStatus('loading');

        // API 呼び出し
        abortRef.current?.abort();
        abortRef.current = new AbortController();
        const ac = abortRef.current;

        const url = `/api/reverse-geocode?lat=${latitude}&lon=${longitude}`;
        fetch(url, { signal: ac.signal })
          .then(async r => {
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
      err => {
        console.error(err);
        setStatus('error');
        setError(
          err.code === err.PERMISSION_DENIED
            ? '位置情報の利用が拒否されました。ブラウザの設定を確認してください。'
            : err.code === err.POSITION_UNAVAILABLE
              ? '現在地を取得できませんでした。屋内や地下では精度が低下することがあります。'
              : err.code === err.TIMEOUT
                ? '位置情報の取得がタイムアウトしました。'
                : '位置情報の取得に失敗しました。'
        );
      },
      {
        enableHighAccuracy: true, // 可能なら高精度
        maximumAge: 60_000, // 最近のキャッシュを許可
        timeout: 15_000, // 15秒で打ち切り
      }
    );
  }, []);

  useEffect(() => {
    // ページ表示時に自動で取得（初回体験を良くする）
    askLocation();
    return () => abortRef.current?.abort();
  }, [askLocation]);

  // 店名をセットして戻る
  const pick = (name: string) => {
    const trimmed = (name ?? '').trim();
    if (!trimmed) return;

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('pendingFoodCandidate', trimmed);
      } catch {}
    }

    // returnTo が無ければホームへ
    router.push(returnTo || '/');
  };

  return (
    <Container maxWidth='md' sx={{ py: 4 }}>
      <Stack spacing={3}>
        {/* ヘッダー */}
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant='h5' fontWeight={700}>
            飲食店検索
          </Typography>
          <Typography variant='body2' color='text.secondary'>
            現在地から「エリア」を取得して、近くの飲食店を提案します。
          </Typography>
        </Box>

        {/* 現在地→エリア取得 */}
        <Stack spacing={1}>
          <Box>
            <Button
              variant='outlined'
              onClick={askLocation}
              disabled={status === 'locating' || status === 'loading'}
            >
              {status === 'locating' || status === 'loading' ? '取得中...' : '現在地からエリア取得'}
            </Button>
          </Box>

          {status === 'error' && (
            <Alert severity='error' variant='outlined'>
              エラー：{error}
            </Alert>
          )}

          {coords && (
            <Typography variant='body2' color='text.secondary'>
              取得座標：{coords.lat.toFixed(5)}, {coords.lon.toFixed(5)}
            </Typography>
          )}

          {status === 'done' && result && (
            <Paper variant='outlined' sx={{ p: 2, borderRadius: 3 }}>
              <Stack spacing={0.5}>
                <Typography variant='caption' color='text.secondary'>
                  推定エリア
                </Typography>
                <Typography variant='h6' fontWeight={600}>
                  {area || '（不明）'}
                </Typography>
                {result.locality && (
                  <Typography variant='body2' color='text.secondary'>
                    近接ローカリティ：{result.locality}
                  </Typography>
                )}
                {result.display_name && (
                  <Typography variant='caption' color='text.secondary'>
                    詳細：{result.display_name}
                  </Typography>
                )}
              </Stack>
            </Paper>
          )}
        </Stack>

        {/* 絞り込みUI（ジャンル / 価格帯 / 範囲） */}
        <Paper variant='outlined' sx={{ borderRadius: 3, p: 2 }}>
          <Grid container spacing={2}>
            {/* ジャンル */}
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth size='small'>
                <InputLabel id='genre-label'>ジャンル</InputLabel>
                <MUISelect
                  labelId='genre-label'
                  id='genre'
                  label='ジャンル'
                  value={selectedGenre || ''}
                  onChange={e => setSelectedGenre(e.target.value as string)}
                >
                  <MenuItem value=''>指定なし</MenuItem>
                  {genres.map(g => (
                    <MenuItem key={g.code} value={g.code}>
                      {g.name}
                    </MenuItem>
                  ))}
                </MUISelect>
              </FormControl>
            </Grid>

            {/* 価格帯（ディナー予算） */}
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth size='small'>
                <InputLabel id='budget-label'>価格帯（ディナー予算）</InputLabel>
                <MUISelect
                  labelId='budget-label'
                  id='budget'
                  label='価格帯（ディナー予算）'
                  value={selectedBudget || ''}
                  onChange={e => setSelectedBudget(e.target.value as string)}
                >
                  <MenuItem value=''>指定なし</MenuItem>
                  {budgets.map(b => (
                    <MenuItem key={b.code} value={b.code}>
                      {b.name}
                    </MenuItem>
                  ))}
                </MUISelect>
              </FormControl>
            </Grid>

            {/* 検索範囲 */}
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth size='small'>
                <InputLabel id='range-label'>検索範囲</InputLabel>
                <MUISelect
                  labelId='range-label'
                  id='range'
                  label='検索範囲'
                  value={String(range)}
                  onChange={e => setRange(Number(e.target.value))}
                >
                  <MenuItem value='1'>300m</MenuItem>
                  <MenuItem value='2'>500m</MenuItem>
                  <MenuItem value='3'>1000m（既定）</MenuItem>
                  <MenuItem value='4'>2000m</MenuItem>
                  <MenuItem value='5'>3000m</MenuItem>
                  <MenuItem value='5000'>5000m</MenuItem>
                  <MenuItem value='10000'>10000m</MenuItem>
                </MUISelect>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <Button
                variant='contained'
                onClick={fetchNearby}
                disabled={!coords || loadingShops}
                sx={{ borderRadius: 3 }}
              >
                🍽 条件で検索する
              </Button>
            </Grid>
          </Grid>
        </Paper>

        {/* 検索結果 */}
        <Stack spacing={1}>
          {shopsError && (
            <Alert severity='error' variant='outlined'>
              エラー：{shopsError}
            </Alert>
          )}

          {loadingShops && <LinearProgress />}

          {/* 結果があるとき */}
          {!loadingShops && !shopsError && shopsWithDistance.length > 0 && (
            <Paper variant='outlined' sx={{ borderRadius: 3 }}>
              <List disablePadding>
                {shopsWithDistance.map((s, idx) => (
                  <Fragment key={s.id}>
                    <ListItem disableGutters sx={{ px: 0 }}>
                      <ListItemButton
                        onClick={() => pick(s.name)}
                        sx={{ px: 2, py: 1.5, alignItems: 'flex-start' }}
                        title='この店名を候補に入れる'
                      >
                        <Box
                          component={s.photo ? 'img' : 'div'}
                          src={s.photo || undefined}
                          sx={{
                            width: 64,
                            height: 64,
                            borderRadius: 1,
                            objectFit: 'cover',
                            bgcolor: 'action.hover',
                            mr: 2,
                            flex: '0 0 auto',
                          }}
                        />
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Stack
                            direction='row'
                            alignItems='center'
                            justifyContent='space-between'
                            gap={2}
                          >
                            <Typography variant='subtitle1' noWrap>
                              {s.name}
                            </Typography>
                            {s.distance != null && (
                              <Chip
                                size='small'
                                label={`${(s.distance / 1000).toFixed(2)} km`}
                                variant='outlined'
                              />
                            )}
                          </Stack>
                          <Typography variant='body2' color='text.secondary' noWrap>
                            {s.genre ? `${s.genre}・` : ''}
                            {s.address}
                          </Typography>
                          {s.access && (
                            <Typography
                              variant='caption'
                              color='text.secondary'
                              sx={{ mt: 0.5, display: 'block' }}
                            >
                              {s.access}
                            </Typography>
                          )}
                          {s.url && (
                            <Link
                              href={s.url}
                              target='_blank'
                              rel='noopener noreferrer'
                              underline='hover'
                              sx={{ mt: 1, display: 'inline-block' }}
                            >
                              店舗ページへ
                            </Link>
                          )}
                        </Box>
                      </ListItemButton>
                    </ListItem>
                    {idx < shopsWithDistance.length - 1 && <Divider component='li' />}
                  </Fragment>
                ))}
              </List>
            </Paper>
          )}

          {/* 結果が0件のとき（検索を実行済み） */}
          {!loadingShops && !shopsError && searched && shopsWithDistance.length === 0 && (
            <Alert severity='info' variant='outlined' sx={{ borderRadius: 2 }}>
              <Stack
                direction='row'
                alignItems='center'
                justifyContent='space-between'
                gap={2}
                flexWrap='wrap'
              >
                <Box>
                  <AlertTitle>該当する店舗が見つかりませんでした</AlertTitle>
                  <Typography variant='body2' color='text.secondary'>
                    条件を緩めるか、検索範囲を広げて再検索してください。
                  </Typography>
                </Box>
                <Stack direction='row' gap={1}>
                  <Button
                    variant='outlined'
                    size='small'
                    onClick={() => {
                      // 3000m以下なら 5000m に、すでに 5000m 以上なら 10000m に
                      const next = Number(range) <= 5 ? 5000 : 10000;
                      setRange(next);
                      // range > 5 のときは fetchNearby が radius_m を付けてくれる実装にしている想定
                      fetchNearby();
                    }}
                  >
                    範囲を広げて再検索
                  </Button>
                  <Button
                    variant='text'
                    size='small'
                    onClick={() => {
                      // 絞り込み解除（ジャンル/予算をクリア）して再検索
                      setSelectedGenre('');
                      setSelectedBudget('');
                      fetchNearby();
                    }}
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
  );
}

export default function GetAreaPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <GetAreaPageContent />
    </Suspense>
  );
}
