#!/usr/bin/env node
/**
 * 정적 관할 테이블 생성기 (설계안 `docs/emergency-live-lookup-design.md` §9 · 1단계)
 *
 * 입력
 *   scripts/data/sigungu.json      행정표준코드 기준 시군구 256건 (법정동코드 2026-10 스냅샷)
 *   scripts/data/agency-seed.json  소방서·경찰서 관할 문장 + 수동 보강분
 *
 * 출력
 *   public/data/regions.json       시군구 1행 = 소방서 / 경찰서 / 재난안전상황실
 *
 * 실행
 *   node scripts/build-regions.mjs
 *   node scripts/build-regions.mjs --report    미매칭 기관·공백 지역까지 출력
 *
 * ─ 관할 판정 방식 ────────────────────────────────────────────
 * 문장을 왼쪽에서 오른쪽으로 훑으며 '행정구역 토큰'을 인식합니다.
 *
 *   '경기도 성남시 수정구, 중원구를 관할'      → 성남시수정구 + 성남시중원구
 *   '부산광역시 중구 일부, 동구 일부, 서구'    → 부산 중구·동구·서구 (시·도 문맥 유지)
 *   '경상남도 창원시 마산회원구, 마산합포구'   → 창원시마산회원구 + 창원시마산합포구
 *
 * 구(區) 이름만으로는 '서구'·'중구'처럼 전국에 중복되므로
 * 직전에 등장한 시·도 / 시·군 문맥으로 반드시 좁힙니다.
 *
 * ─ 안전장치 3가지 ───────────────────────────────────────────
 * ① 동명이인 문서(동음이의) 처리
 *    '중부소방서는 다음의 뜻으로 쓰인다 …' 같은 문서는 문장마다 시·도가 다릅니다.
 *    문장 단위로 끊어 각 문장의 시·도 문맥 안에서만 배정하고,
 *    기관명도 '서울중부소방서'처럼 시·도 접두사를 붙여 구분합니다.
 * ② '일부' 관할은 후순위
 *    '기흥구 일부지역'처럼 부분 관할로만 언급된 곳은,
 *    그 구를 전부 관할하는 기관이 따로 있으면 목록에서 제외합니다.
 * ③ 과거 서술 제거
 *    '분리되기 전에는 … 관할했다' 같은 과거·폐지 서술은 버립니다.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT_DIR = path.join(ROOT, 'public', 'data');
const OUT_FILE = path.join(OUT_DIR, 'regions.json');

const REPORT = process.argv.includes('--report');
const VERSION = '2026-11';

/* ── 1. 시·도 정규화 ─────────────────────────────────────────── */

const SIDO_CANON = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시', '대전광역시',
  '울산광역시', '세종특별자치시', '경기도', '강원특별자치도', '충청북도', '충청남도',
  '전북특별자치도', '전라남도', '경상북도', '경상남도', '제주특별자치도',
];

const METRO = new Set([
  '서울특별시', '부산광역시', '대구광역시', '인천광역시',
  '광주광역시', '대전광역시', '울산광역시', '세종특별자치시',
]);

const SIDO_SHORT = {
  서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천',
  광주광역시: '광주', 대전광역시: '대전', 울산광역시: '울산', 세종특별자치시: '세종',
  경기도: '경기', 강원특별자치도: '강원', 충청북도: '충북', 충청남도: '충남',
  전북특별자치도: '전북', 전라남도: '전남', 경상북도: '경북', 경상남도: '경남',
  제주특별자치도: '제주',
};

/**
 * 원본 데이터의 시·도 명칭 → 앱 명칭.
 *
 * 2026년 광주·전남 행정통합으로 원본에 '전남광주통합특별시' 하나로 들어옵니다.
 * 코드 접두사(12xxx)만으로는 광주와 전남이 구분되지 않으므로
 * **구(區) 5개만 광주광역시, 나머지는 전라남도**로 판별합니다.
 */
const GWANGJU_GU = new Set(['동구', '서구', '남구', '북구', '광산구']);

const canonicalSido = (rawSido, sggnm) => {
  if (SIDO_CANON.includes(rawSido)) return rawSido;
  if (rawSido === '전남광주통합특별시') {
    return GWANGJU_GU.has(sggnm) ? '광주광역시' : '전라남도';
  }
  if (rawSido === '강원도') return '강원특별자치도';
  if (rawSido === '전라북도') return '전북특별자치도';
  if (rawSido === '제주도') return '제주특별자치도';
  return rawSido;
};

/* ── 2. 시군구 이름 분해 ─────────────────────────────────────── */

const stripSuffix = t => t.replace(/(특별자치시|특별자치도|특별시|광역시|시|군|구)$/, '');
const withBu = b => (['중', '동', '서', '남', '북'].includes(b) ? `${b}부` : b);

/**
 * '용인시처인구' → { city: '용인시', gu: '처인구' }
 * '강남구'       → { city: '',        gu: '강남구' }
 * '가평군'       → { city: '가평군',  gu: '' }
 */
const splitSigungu = name => {
  const m = name.match(/^(.+?(?:시|군))(.+?구)$/);
  if (m) return { city: m[1], gu: m[2] };
  if (/구$/.test(name)) return { city: '', gu: name };
  return { city: name, gu: '' };
};

/* ── 3. 원본 로드 ────────────────────────────────────────────── */

const sigungu = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'sigungu.json'), 'utf8'));
const agency = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'agency-seed.json'), 'utf8'));

/* ── 4. 행정구역 행 구성 ─────────────────────────────────────── */

const rows = sigungu.map(item => {
  const { city, gu } = splitSigungu(item.sggnm);
  const sido = canonicalSido(item.sido, item.sggnm);
  const base = gu ? withBu(stripSuffix(gu)) : withBu(stripSuffix(city));
  return {
    code: item.sgg,
    rawSido: item.sido,
    sido,
    sigungu: city,
    gu,
    name: item.sggnm,
    base,
    /** 검증 후 확정되는 목록 */
    fire: [],
    police: [],
    /** 수집 단계: 기관명 → '일부' 언급 여부 */
    meta: { fire: new Map(), police: new Map() },
  };
});

/**
 * 2026년 인천 행정구역 개편 별칭.
 *   서구    → 서해구 (개칭)
 *   중구    → 제물포구 (개칭)
 *   동구    → 제물포구 (통합)
 * 기존 문서·주소에 남아 있는 옛 구명을 현재 행으로 연결합니다.
 */
const GU_ALIAS = {
  인천광역시: {
    서구: ['서해구'],
    중구: ['제물포구'],
    동구: ['제물포구'],
  },
};

/* ── 5. 어휘 사전 (시·도 / 시·군 / 구) ───────────────────────── */

/** @type {{token:string, kind:'sido'|'city'|'gu', rows:any[]}[]} */
const vocab = [];

const addVocab = (token, kind, list) => {
  if (!token || token.length < 2 || !list.length) return;
  const existing = vocab.find(v => v.token === token && v.kind === kind);
  if (existing) {
    list.forEach(r => {
      if (!existing.rows.includes(r)) existing.rows.push(r);
    });
    return;
  }
  vocab.push({ token, kind, rows: [...list] });
};

// 시·도 — 원본 표기와 정규 표기를 모두 등록 (문맥 판별용)
const sidoRowMap = new Map();
const addSidoRow = (token, row) => {
  if (!sidoRowMap.has(token)) sidoRowMap.set(token, []);
  const list = sidoRowMap.get(token);
  if (!list.includes(row)) list.push(row);
};
rows.forEach(r => {
  addSidoRow(r.rawSido, r);
  addSidoRow(r.sido, r);
});
// 시·도 약칭 ('전남경찰청' 같은 표기 대응)
Object.entries(SIDO_SHORT).forEach(([canon, short]) => {
  const list = rows.filter(r => r.sido === canon);
  if (list.length) addSidoRow(short, list[0]);
  list.slice(1).forEach(r => addSidoRow(short, r));
});
sidoRowMap.forEach((list, token) => addVocab(token, 'sido', list));

// 시·군
const cityMap = new Map();
rows.forEach(r => {
  if (!r.sigungu) return;
  if (!cityMap.has(r.sigungu)) cityMap.set(r.sigungu, []);
  cityMap.get(r.sigungu).push(r);
});
cityMap.forEach((list, token) => addVocab(token, 'city', list));

// 구
const guMap = new Map();
rows.forEach(r => {
  if (!r.gu) return;
  if (!guMap.has(r.gu)) guMap.set(r.gu, []);
  guMap.get(r.gu).push(r);
});
guMap.forEach((list, token) => addVocab(token, 'gu', list));

// 구 별칭 (인천 서구 → 서해구)
Object.entries(GU_ALIAS).forEach(([sido, map]) => {
  Object.entries(map).forEach(([from, toList]) => {
    const list = toList
      .map(guName => rows.find(r => r.sido === sido && r.gu === guName))
      .filter(Boolean);
    addVocab(from, 'gu', list);
  });
});

// 최장 일치를 위해 긴 토큰 우선
vocab.sort((a, b) => b.token.length - a.token.length);
const MAX_TOKEN = vocab.reduce((m, v) => Math.max(m, v.token.length), 0);

/* ── 6. 문장 스캐너 ─────────────────────────────────────────── */

/** 과거·폐지 서술 문장 제거 */
const PAST_MARK = /(관할했다|관할하였다|관할이었|이전에는|분리되기|폐지|담당했던|보였다|신설 전)/;

const currentOnly = text =>
  (text || '')
    .split(/(?<=[.!?])\s+/)
    .filter(s => s.trim() && !PAST_MARK.test(s))
    .join(' ');

/** 동음이의 문서인지 ('다음의 뜻으로 쓰인다' 또는 관할 문장 2개 이상) */
const isDisambiguation = (text, suffix) => {
  const body = text || '';
  if (body.includes('다음의 뜻으로 쓰인다')) return true;
  const n = (body.match(new RegExp(`관할하는 ${suffix}`, 'g')) || []).length;
  return n >= 2;
};

/**
 * 문장에서 행정구역을 순서대로 인식.
 * @returns {{full:any[], partial:any[]}}
 */
const scanText = text => {
  const body = currentOnly(text);
  const full = new Set();
  const partial = new Set();
  if (!body) return { full: [], partial: [] };

  let curSidoRows = null;
  let curCity = null;
  let i = 0;

  while (i < body.length) {
    let matched = null;
    let len = 0;
    for (let L = Math.min(MAX_TOKEN, body.length - i); L >= 2; L--) {
      const slice = body.slice(i, i + L);
      const cand = vocab.find(v => v.token === slice);
      if (cand) {
        matched = cand;
        len = L;
        break;
      }
    }
    if (!matched) {
      i += 1;
      continue;
    }

    if (matched.kind === 'sido') {
      curSidoRows = matched.rows;
      curCity = null;
    } else if (matched.kind === 'city') {
      let scoped = curSidoRows
        ? matched.rows.filter(r => curSidoRows.includes(r))
        : matched.rows;
      if (!scoped.length) scoped = matched.rows;
      curCity = matched.token;
      // 구가 없는 시·군(가평군·서귀포시 등)은 시·군 표기만으로 확정
      scoped.filter(r => !r.gu).forEach(r => full.add(r));
    } else {
      let cands = matched.rows;
      if (curSidoRows) {
        const bySido = cands.filter(r => curSidoRows.includes(r));
        if (bySido.length) cands = bySido;
      }
      const byCity = cands.filter(r => r.sigungu === curCity);
      if (byCity.length) cands = byCity;
      // '일부'가 따라오면 부분 관할로 표시
      const isPartial = body.slice(i + len, i + len + 6).includes('일부');
      cands.forEach(r => (isPartial ? partial.add(r) : full.add(r)));
    }
    i += len;
  }

  return { full: [...full], partial: [...partial].filter(r => !full.has(r)) };
};

/** 문장 하나에서 시·도 문맥을 알아낸다 (동음이의 문서 처리용) */
const sidoOfSentence = sentence => {
  const sidoTokens = vocab.filter(v => v.kind === 'sido');
  for (const v of sidoTokens) {
    if (sentence.includes(v.token)) return v.rows;
  }
  return null;
};

/* ── 7. 기관명 기반 매칭 (문장 실패 시 폴백) ────────────────── */

const METRO_SHORT = {
  서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천',
  광주광역시: '광주', 대전광역시: '대전', 울산광역시: '울산',
};

const nameTokens = (agencyName, suffix) => {
  let core = agencyName.replace(new RegExp(`${suffix}$`), '').trim();
  const shorts = Object.values(METRO_SHORT);
  let short = '';
  for (const s of shorts) {
    if (core.startsWith(s) && core.length > s.length) {
      core = core.slice(s.length);
      short = s;
      break;
    }
  }
  return { core, short };
};

/** '수원남부' → '수원' 처럼 방위 접미사(동·서·남·북 + 부)를 떼어 본다 */
const stripBearing = core => core.replace(/(동|서|남|북)부?$/, '');

const matchByName = (agencyName, suffix) => {
  const { core, short } = nameTokens(agencyName, suffix);
  const out = [];
  const bySido = list => {
    if (!short) return list;
    const f = list.filter(r => METRO_SHORT[r.sido] === short);
    return f.length ? f : list;
  };

  // ① 구 단위 (분당 / 강남 / 수정 / 검단)
  if (guMap.has(`${core}구`)) out.push(...bySido(guMap.get(`${core}구`)));
  else if (guMap.has(core)) out.push(...bySido(guMap.get(core)));

  // ② 시·군 + 구 (성남수정 → 성남시 + 수정구)
  if (!out.length) {
    for (let i = 2; i <= core.length - 2; i++) {
      const cityPart = core.slice(0, i);
      const guPart = core.slice(i);
      const cand = rows.filter(
        r => r.sigungu && stripSuffix(r.sigungu) === cityPart && r.gu && stripSuffix(r.gu) === guPart
      );
      if (cand.length) {
        out.push(...bySido(cand));
        break;
      }
    }
  }

  // ③ 시·군 단위 (용인 / 가평 / 화성)
  if (!out.length) {
    const cand = rows.filter(r => r.sigungu && stripSuffix(r.sigungu) === core);
    if (cand.length) out.push(...bySido(cand));
  }

  // ④ 방위 접미사 제거 후 시·군 (수원남부 → 수원 / 세종북부 → 세종)
  if (!out.length) {
    const stem = stripBearing(core);
    if (stem && stem !== core) {
      const cand = rows.filter(
        r => (r.sigungu && stripSuffix(r.sigungu) === stem) ||
             (!r.sigungu && stripSuffix(r.gu) === stem)
      );
      if (cand.length) out.push(...bySido(cand));
    }
  }

  return [...new Set(out)];
};

/* ── 8. 기관 → 행 배정 ──────────────────────────────────────── */

/** 폐지·해양·특수 목적 기관은 관할 테이블 대상이 아니다 */
const SKIP = /폐지|없어진|경무대|해양경찰|소방학교|소방정|의용소방|항공대|연기소방서/;

const report = { fire: [], police: [], skipped: [], disambig: [] };
const existingNames = {
  fire: new Set(Object.keys(agency.fire)),
  police: new Set(Object.keys(agency.police)),
};

/** 한 기관의 관할을 수집 (full=true 이면 전체 관할) */
const record = (field, name, hits, isFull) => {
  hits.forEach(r => {
    const prev = r.meta[field].get(name);
    if (prev === true) return;
    if (prev === false && !isFull) return;
    r.meta[field].set(name, isFull);
  });
};

const assign = (list, suffix, field) => {
  /* ── 2패스 처리 ──────────────────────────────────────────────
   * 1패스: 실제 명칭 문서(예: '청주동부소방서') 먼저 배정
   * 2패스: 동음이의 문서(예: '동부소방서')는 1패스가 비워둔 지역만 채움
   *
   * 순서를 지키지 않으면 '동부소방서'가 먼저 청주를 차지해
   * '충북동부소방서'라는 없던 이름이 만들어지고,
   * 뒤이어 실제 명칭 '청주동부소방서'가 또 들어가 중복됩니다.
   */
  const entries = Object.entries(list);
  const plain = entries.filter(([, text]) => !isDisambiguation(text || '', suffix));
  const ambig = entries.filter(([, text]) => isDisambiguation(text || '', suffix));

  /** 실제 명칭 문서 배정 */
  const assignOne = ([agencyName, text]) => {
    const body = text || '';
    if (SKIP.test(agencyName) || /폐지|없어진/.test(body.slice(0, 120))) {
      report.skipped.push(agencyName);
      return;
    }
    const { full, partial } = scanText(body);
    if (full.length || partial.length) {
      if (full.length) record(field, agencyName, full, true);
      if (partial.length) record(field, agencyName, partial, false);
      return;
    }
    const byName = matchByName(agencyName, suffix);
    if (!byName.length) {
      report[field].push({ agencyName, text: body.slice(0, 80) });
      return;
    }
    record(field, agencyName, byName, true);
  };

  plain.forEach(assignOne);

  /* 동음이의 문서 — 문장마다 시·도가 다르므로 접두사를 붙여 개별 배정 */
  ambig.forEach(([agencyName, text]) => {
    const body = text || '';
    if (SKIP.test(agencyName)) {
      report.skipped.push(agencyName);
      return;
    }
    report.disambig.push(agencyName);
    const sentences = currentOnly(body).split(/(?<=[.!?])\s+/).filter(Boolean);
    sentences.forEach(sentence => {
      if (!new RegExp(`관할하는 ${suffix}`).test(sentence)) return;
      const sidoRows = sidoOfSentence(sentence);
      if (!sidoRows || !sidoRows.length) return;
      const scoped = scanText(sentence);
      const hits = scoped.full.length ? scoped.full : scoped.partial;
      const inSido = hits.filter(r => sidoRows.includes(r));
      if (!inSido.length) return;
      // 1패스에서 실제 명칭이 이미 채운 지역은 건너뛴다
      const free = inSido.filter(r => r.meta[field].size === 0);
      if (!free.length) return;
      // 접두사 이름이 실제 문서로 존재하면 그 이름을 그대로 쓴다
      const prefixed = `${SIDO_SHORT[free[0].sido] || ''}${agencyName}`;
      record(field, prefixed, free, true);
    });
  });
};

assign(agency.fire, '소방서', 'fire');
assign(agency.police, '경찰서', 'police');

/* ── 8-0. 수동 보강 (공식 출처 확인분) ───────────────────────
 * 위키백과에 문서가 없거나 신설 직후인 기관.
 * scripts/data/agency-seed.json 의 `curated` 항목을 사용합니다.
 */
if (agency.curated) {
  ['fire', 'police'].forEach(field => {
    const suffix = field === 'fire' ? '소방서' : '경찰서';
    Object.entries(agency.curated[field] || {}).forEach(([agencyName, text]) => {
      const { full, partial } = scanText(text);
      const hits = full.length ? full : partial;
      if (hits.length) {
        record(field, agencyName, hits, true);
        return;
      }
      const byName = matchByName(agencyName, suffix);
      if (!byName.length) {
        report[field].push({ agencyName, text: `[curated] ${text}` });
        return;
      }
      record(field, agencyName, byName, true);
    });
  });
}

/* ── 8-2. 확정 — 전체 관할을 앞에, '일부' 관할을 뒤에 ────────
 * '일부' 관할을 버리면 안 됩니다. 해운대구처럼 실제로 여러 소방서가
 * 나눠 담당하는 지역에서 진짜 관할서가 사라지기 때문입니다.
 * (예: 해운대구 → 부산해운대소방서 '일부' + 부산금정소방서)
 * 대신 전체 관할을 목록 앞에 두어 담당자가 먼저 보게 합니다.
 */
let partialKept = 0;
rows.forEach(r => {
  ['fire', 'police'].forEach(field => {
    const entries = [...r.meta[field].entries()];
    const fullNames = entries.filter(([, isFull]) => isFull).map(([n]) => n).sort();
    const partialNames = entries.filter(([, isFull]) => !isFull).map(([n]) => n).sort();
    partialKept += partialNames.length;
    r[field] = [...fullNames, ...partialNames];
  });
});

/* ── 8-3. 같은 시(市) 안의 형제 구에서 상속 ──────────────────
 * 화성시 효행구·병점구처럼 신설된 구는 별도 소방서가 없고
 * 같은 시의 다른 구 관할 기관이 함께 담당합니다.
 */
rows.forEach(r => {
  if (!r.sigungu) return;
  if (r.fire.length && r.police.length) return;
  const siblings = rows.filter(
    s => s !== r && s.rawSido === r.rawSido && s.sigungu === r.sigungu
  );
  if (!r.fire.length) {
    const from = [...new Set(siblings.flatMap(s => s.fire))].sort();
    if (from.length) r.fire = from;
  }
  if (!r.police.length) {
    const from = [...new Set(siblings.flatMap(s => s.police))].sort();
    if (from.length) r.police = from;
  }
});

/* ── 9. 재난안전상황실 명칭 ─────────────────────────────────── */

const officeName = r => {
  if (r.sido === '세종특별자치시') return '세종특별자치시 재난안전상황실';
  if (r.gu) return `${r.gu}청 재난안전상황실`;
  if (METRO.has(r.sido)) return `${r.sido} 재난안전상황실`;
  if (r.sigungu) return `${r.sigungu}청 재난안전상황실`;
  return `${r.base} 재난안전상황실`;
};

/* ── 10. 출력 ────────────────────────────────────────────────── */

const regions = {};
[...rows]
  .sort((a, b) => a.code.localeCompare(b.code))
  .forEach(r => {
    regions[r.code] = {
      sido: r.sido,
      sigungu: r.sigungu,
      gu: r.gu,
      base: r.base,
      fire: [...new Set(r.fire)].sort(),
      police: [...new Set(r.police)].sort(),
      office: officeName(r),
    };
  });

const payload = {
  version: VERSION,
  schema: 'sgg-1',
  generatedAt: new Date().toISOString().slice(0, 10),
  note:
    '시군구 1행 = 소방서·경찰서·재난안전상황실. 명칭은 각 기관 문서의 관할 문장에서 추출. ' +
    '119안전센터·지구대·파출소 등 세부 관서는 데이터 신선도 문제로 담당자 확인 대상.',
  sources: [
    { name: '행정표준코드 시군구 (법정동코드 2026-10 스냅샷)', url: 'https://github.com/vuski/admdongkor' },
    { name: '소방서·경찰서 관할 문장 (위키백과)', url: 'https://ko.wikipedia.org', license: 'CC BY-SA 4.0' },
  ],
  count: Object.keys(regions).length,
  regions,
};

fs.mkdirSync(OUT_DIR, { recursive: true });
const json = JSON.stringify(payload);
fs.writeFileSync(OUT_FILE, json, 'utf8');

/* ── 11. 리포트 ─────────────────────────────────────────────── */

const all = Object.values(regions);
const total = all.length;
const withFire = all.filter(r => r.fire.length).length;
const withPolice = all.filter(r => r.police.length).length;
const multiFire = all.filter(r => r.fire.length > 1).length;
const multiPolice = all.filter(r => r.police.length > 1).length;
const raw = Buffer.byteLength(json);
const gz = zlib.gzipSync(Buffer.from(json)).length;
const pct = n => `${((n / total) * 100).toFixed(1)}%`;

console.log('─'.repeat(60));
console.log(`regions.json 생성  →  ${path.relative(ROOT, OUT_FILE)}`);
console.log(`  시군구            ${total}`);
console.log(`  소방서 매칭       ${withFire} (${pct(withFire)})   다중 ${multiFire}`);
console.log(`  경찰서 매칭       ${withPolice} (${pct(withPolice)})   다중 ${multiPolice}`);
console.log(`  크기              ${(raw / 1024).toFixed(1)} KB  (gzip ${(gz / 1024).toFixed(1)} KB)`);
console.log(`  동음이의 처리     ${report.disambig.length}건`);
console.log(`  '일부' 관할       ${partialKept}건 (전체 관할 뒤에 배치)`);
console.log(`  제외 기관         ${report.skipped.length}`);
console.log(`  미매칭            소방서 ${report.fire.length} · 경찰서 ${report.police.length}`);
console.log('─'.repeat(60));

if (REPORT) {
  if (report.disambig.length) {
    console.log('\n[동음이의 문서]');
    console.log('  ' + report.disambig.join(', '));
  }
  if (report.skipped.length) {
    console.log('\n[제외 — 폐지·해양·특수]');
    console.log('  ' + report.skipped.join(', '));
  }
  if (report.fire.length) {
    console.log('\n[미매칭 소방서]');
    report.fire.forEach(x => console.log(` - ${x.agencyName}  ${x.text}`));
  }
  if (report.police.length) {
    console.log('\n[미매칭 경찰서]');
    report.police.forEach(x => console.log(` - ${x.agencyName}  ${x.text}`));
  }
  const noFire = Object.entries(regions).filter(([, r]) => !r.fire.length);
  const noPolice = Object.entries(regions).filter(([, r]) => !r.police.length);
  console.log(`\n[소방서 공백] ${noFire.length}건`);
  noFire.forEach(([c, r]) => console.log(` - ${c} ${r.sido} ${r.sigungu} ${r.gu}`));
  console.log(`\n[경찰서 공백] ${noPolice.length}건`);
  noPolice.forEach(([c, r]) => console.log(` - ${c} ${r.sido} ${r.sigungu} ${r.gu}`));
}
