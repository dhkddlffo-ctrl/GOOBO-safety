/**
 * 정적 관할 테이블 로더
 *
 * 설계안 `docs/emergency-live-lookup-design.md` §9 · 1단계
 * 생성기: `scripts/build-regions.mjs` → `public/data/regions.json`
 *
 * ─ 동작 원칙 ────────────────────────────────────────────────
 * 1. 파일은 **한 번만** 내려받아 메모리에 캐시합니다 (수십 KB).
 * 2. 네트워크가 없거나 파일이 없으면 `null` 을 돌려주고,
 *    호출측은 기존 규칙 기반(`emergencyLookup.ts`)으로 폴백합니다.
 *    → 오프라인에서도 앱이 그대로 동작합니다.
 * 3. 실패한 로드는 5분간 재시도하지 않습니다 (매 조회마다 재요청 방지).
 */

import type { ParsedRegion } from './emergencyLookup';

/** 시군구 1행 */
export interface RegionRow {
  sido: string;
  /** 예: '용인시' (광역시 구 단독이면 '') */
  sigungu: string;
  /** 예: '처인구' */
  gu: string;
  /** 기관명 기준 지명 (예: '처인' / '강남') */
  base: string;
  /** 예: ['용인소방서'] — 전체 관할 우선 정렬 */
  fire: string[];
  /** 예: ['용인동부경찰서', '용인서부경찰서'] */
  police: string[];
  /** 예: '처인구청 재난안전상황실' */
  office: string;
}

export interface RegionTable {
  version: string;
  /** 5자리 시군구 코드 → 행 */
  regions: Record<string, RegionRow>;
}

/** 로드 결과 상태 */
export type RegionTableStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

/** 정적 자산 경로 — vite base 를 따르도록 상대 경로 사용 */
const TABLE_URL = 'data/regions.json';
const RETRY_AFTER_MS = 5 * 60 * 1000;

let cache: RegionTable | null = null;
let index: NameIndex | null = null;
let pending: Promise<RegionTable | null> | null = null;
let failedAt = 0;

/* ── 이름 색인 ───────────────────────────────────────────────── */

interface NameIndex {
  /** '경기도|용인시|처인구' */
  full: Map<string, RegionRow>;
  /** '경기도|용인시' (구 없이 시 단위로만 조회하는 경우) */
  city: Map<string, RegionRow[]>;
  /** '경기도|처인구' (광역시·시 산하 구) */
  gu: Map<string, RegionRow[]>;
  /** '처인' 처럼 기관명 기준 지명 */
  base: Map<string, RegionRow[]>;
}

const key3 = (sido: string, sigungu: string, gu: string): string =>
  `${sido}|${sigungu}|${gu}`;

const buildIndex = (table: RegionTable): NameIndex => {
  const full = new Map<string, RegionRow>();
  const city = new Map<string, RegionRow[]>();
  const gu = new Map<string, RegionRow[]>();
  const base = new Map<string, RegionRow[]>();

  const push = (m: Map<string, RegionRow[]>, k: string, row: RegionRow) => {
    const list = m.get(k);
    if (list) list.push(row);
    else m.set(k, [row]);
  };

  Object.values(table.regions).forEach(row => {
    full.set(key3(row.sido, row.sigungu, row.gu), row);
    if (row.sigungu) push(city, `${row.sido}|${row.sigungu}`, row);
    if (row.gu) push(gu, `${row.sido}|${row.gu}`, row);
    if (row.base) push(base, `${row.sido}|${row.base}`, row);
  });

  return { full, city, gu, base };
};

/* ── 로드 ────────────────────────────────────────────────────── */

/** 테이블을 (필요하면) 내려받는다. 실패해도 예외를 던지지 않는다. */
export const loadRegionTable = async (): Promise<RegionTable | null> => {
  if (cache) return cache;
  if (pending) return pending;
  if (failedAt && Date.now() - failedAt < RETRY_AFTER_MS) return null;
  if (typeof fetch !== 'function') {
    failedAt = Date.now();
    return null;
  }

  pending = (async () => {
    try {
      const res = await fetch(TABLE_URL, {
        // 정적 자산 — 캐시를 적극 활용
        cache: 'force-cache',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as RegionTable;
      if (!data || typeof data !== 'object' || !data.regions) {
        throw new Error('invalid table');
      }
      cache = data;
      index = buildIndex(data);
      return cache;
    } catch {
      // 오프라인·파일 없음 → 규칙 기반 폴백으로 동작
      failedAt = Date.now();
      return null;
    } finally {
      pending = null;
    }
  })();

  return pending;
};

/** 이미 메모리에 올라와 있는지 (동기 확인) */
export const isRegionTableReady = (): boolean => cache !== null;

/** 테이블 버전 (없으면 빈 문자열) */
export const regionTableVersion = (): string => cache?.version ?? '';

/* ── 조회 ────────────────────────────────────────────────────── */

/**
 * 옛 구명 → 현재 구명 (2026 행정개편).
 * 기존 문서·주소에는 개편 전 지명이 남아 있으므로 조회 시 되돌려 찾습니다.
 */
const GU_ALIAS: Record<string, Record<string, string[]>> = {
  인천광역시: {
    서구: ['서해구'],
    중구: ['제물포구'],
    동구: ['제물포구'],
  },
};

/** 구명 후보 (원래 이름 + 별칭) */
const guCandidates = (sido: string, gu: string): string[] => {
  const alias = GU_ALIAS[sido]?.[gu];
  return alias ? [gu, ...alias] : [gu];
};

/**
 * 파싱된 주소 → 정적 테이블 행.
 * 테이블이 아직 없으면 `null` (호출측이 규칙 기반으로 폴백).
 */
export const lookupRegionRow = (region: ParsedRegion): RegionRow | null => {
  if (!cache || !index) return null;
  if (!region.ok || !region.sido) return null;

  const { sido, city, district, base } = region;
  const guList = district ? guCandidates(sido, district) : [];

  // ① 시·도 + 시·군 + 구 완전 일치
  if (city) {
    for (const gu of guList) {
      const hit = index.full.get(key3(sido, city, gu));
      if (hit) return hit;
    }
  }

  // ② 시·도 + 구 (광역시: '서울특별시' + '강남구')
  for (const gu of guList) {
    const hits = index.gu.get(`${sido}|${gu}`);
    if (hits && hits.length === 1) {
      const single = hits[0];
      if (!single.sigungu || !city || single.sigungu === city) return single;
    }
  }

  // ③ 시·도 + 시·군 (구가 없는 지역: 가평군·서귀포시)
  if (city) {
    const hits = index.city.get(`${sido}|${city}`);
    if (hits && hits.length === 1) return hits[0];
  }

  // ④ 기관명 기준 지명 (예: '처인' → 용인시 처인구)
  if (base) {
    const hits = index.base.get(`${sido}|${base}`);
    if (hits && hits.length === 1) return hits[0];
  }

  // ⑤ 시·도만 있는 단일 지역 (세종특별자치시)
  if (!city && !district) {
    const hits = Object.values(cache.regions).filter(r => r.sido === sido);
    if (hits.length === 1) return hits[0];
  }

  return null;
};

/** 테이블에서 관할 기관명 문자열 만들기 (없으면 null) */
export const tableOrgNames = (
  row: RegionRow | null,
  kind: 'fire' | 'police'
): string | null => {
  if (!row) return null;
  const list = kind === 'fire' ? row.fire : row.police;
  if (!list.length) return null;
  return list.join(' / ');
};
