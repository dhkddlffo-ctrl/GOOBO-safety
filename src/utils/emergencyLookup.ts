import type { EmergencyPlan, ExternalAgency, DesignatedHospital } from '../types';

/**
 * 비상연락망 주소 기반 관할 정보 조회 / 입력 점검
 *
 * ─ 설계 원칙 ────────────────────────────────────────────────
 * 1. 이 앱은 서버가 없으므로 외부 API 를 실시간 호출하지 않습니다.
 * 2. 주소를 파싱해 관할 기관명을 규칙 기반으로 채우고,
 *    전화번호는 반드시 담당자가 확인하도록 '확인 필요'로 표시합니다.
 *    (잘못된 응급 연락처가 게시되는 것을 막기 위한 안전장치)
 * 3. 전국 공통 번호(119·112·1339 등)만 '확인 완료'로 자동 지정합니다.
 */

/* ================================================================
   1. 주소 파싱
   ================================================================ */

const SIDO_LIST = [
  '서울특별시',
  '부산광역시',
  '대구광역시',
  '인천광역시',
  '광주광역시',
  '대전광역시',
  '울산광역시',
  '세종특별자치시',
  '경기도',
  '강원특별자치도',
  '충청북도',
  '충청남도',
  '전북특별자치도',
  '전라남도',
  '경상북도',
  '경상남도',
  '제주특별자치도',
];

const SIDO_SHORT: Record<string, string> = {
  서울특별시: '서울',
  부산광역시: '부산',
  대구광역시: '대구',
  인천광역시: '인천',
  광주광역시: '광주',
  대전광역시: '대전',
  울산광역시: '울산',
  세종특별자치시: '세종',
  경기도: '경기',
  강원특별자치도: '강원',
  충청북도: '충북',
  충청남도: '충남',
  전북특별자치도: '전북',
  전라남도: '전남',
  경상북도: '경북',
  경상남도: '경남',
  제주특별자치도: '제주',
};

const SIDO_ALIAS: Record<string, string> = {
  서울: '서울특별시',
  부산: '부산광역시',
  대구: '대구광역시',
  인천: '인천광역시',
  광주: '광주광역시',
  대전: '대전광역시',
  울산: '울산광역시',
  세종: '세종특별자치시',
  경기: '경기도',
  강원: '강원특별자치도',
  충북: '충청북도',
  충남: '충청남도',
  전북: '전북특별자치도',
  전남: '전라남도',
  경북: '경상북도',
  경남: '경상남도',
  제주: '제주특별자치도',
  // 개정 전 명칭 (기존 문서·주소에 남아 있는 경우)
  강원도: '강원특별자치도',
  전라북도: '전북특별자치도',
  제주도: '제주특별자치도',
};

/** 광역시·특별시·특별자치시 (관할 기관명이 '구' 기준) */
const METRO = new Set([
  '서울특별시',
  '부산광역시',
  '대구광역시',
  '인천광역시',
  '광주광역시',
  '대전광역시',
  '울산광역시',
  '세종특별자치시',
]);

/** 접미사 제거 (용인시 → 용인, 처인구 → 처인) */
const stripSuffix = (token: string): string =>
  token.replace(/(특별자치시|특별자치도|특별시|광역시|시|군|구)$/, '');

/** '중'·'동'·'서'·'남'·'북' + 부 (중구 → 중부) */
const withBu = (base: string): string =>
  ['중', '동', '서', '남', '북'].includes(base) ? `${base}부` : base;

export interface ParsedRegion {
  /** 정규화된 시·도 (예: 경기도) */
  sido: string;
  /** 약칭 (예: 경기) */
  sidoShort: string;
  /** 시 또는 군 (예: 용인시) */
  city: string;
  /** 구 (예: 처인구) */
  district: string;
  /** 기관명에 사용할 대표 지명 (예: 용인 / 강남) */
  base: string;
  /** 표시용 주소 요약 (예: 경기도 용인시 처인구) */
  label: string;
  isMetro: boolean;
  /** 시·군·구를 찾았는지 */
  ok: boolean;
}

const EMPTY_REGION: ParsedRegion = {
  sido: '',
  sidoShort: '',
  city: '',
  district: '',
  base: '',
  label: '',
  isMetro: false,
  ok: false,
};

/** '성남시분당구' 처럼 붙여 쓴 행정구역을 분리 */
const splitUnits = (token: string): string[] => {
  const parts = token.match(/[가-힣]+?(?:시|군|구)(?=[가-힣]|$)/g);
  if (!parts || parts.length < 2) return [token];
  const joined = parts.join('');
  // 분리 결과가 원본을 그대로 복원할 때만 채택 (도로명 오분리 방지)
  return joined === token ? parts : [token];
};

/** 현장 주소 → 시·도 / 시·군 / 구 */
export const parseRegion = (address: string): ParsedRegion => {
  const cleaned = (address || '')
    .replace(/[()[\],·]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return EMPTY_REGION;

  const tokens = cleaned.split(' ');
  let sido = '';

  const first = tokens[0];
  if (SIDO_LIST.includes(first)) {
    sido = first;
  } else if (SIDO_ALIAS[first]) {
    sido = SIDO_ALIAS[first];
  } else {
    // '경기도성남시분당구' 처럼 시·도가 붙어 있는 경우
    const found = SIDO_LIST.find(s => cleaned.startsWith(s));
    const foundAlias = Object.keys(SIDO_ALIAS)
      .filter(a => a.length > 1)
      .find(a => cleaned.startsWith(a));
    if (found) sido = found;
    else if (foundAlias) sido = SIDO_ALIAS[foundAlias];
  }

  // 나머지 문자열에서 시·도 접두사를 제거한 뒤 행정구역 단위로 분해
  let restStr = cleaned;
  if (sido) {
    if (restStr.startsWith(sido)) {
      restStr = restStr.slice(sido.length).trim();
    } else {
      const alias = Object.keys(SIDO_ALIAS)
        .filter(a => a.length > 1)
        .find(a => restStr.startsWith(a));
      if (alias) restStr = restStr.slice(alias.length).trim();
    }
  }

  const restTokens = restStr.split(' ').filter(Boolean);
  const units: string[] = [];
  restTokens.forEach((token, i) => {
    if (i === 0) units.push(...splitUnits(token));
    else units.push(token);
  });

  let city = '';
  let district = '';

  units.forEach(token => {
    if (token.length < 2) return;
    if (!city && /(시|군)$/.test(token) && !/(특별시|광역시|특별자치시)$/.test(token)) {
      city = token;
      return;
    }
    if (!district && /구$/.test(token) && !/(특별시|광역시)$/.test(token)) {
      district = token;
    }
  });

  const isMetro = METRO.has(sido);

  // 세종특별자치시는 시·군·구 없이 '세종시'로 처리
  const isSejong = sido === '세종특별자치시';
  if (isSejong) {
    city = '세종시';
    district = '';
  }

  let base = '';
  if (isSejong) base = '세종';
  else if (isMetro && district) base = withBu(stripSuffix(district));
  else if (city) base = withBu(stripSuffix(city));
  else if (district) base = withBu(stripSuffix(district));

  const labelParts = [sido];
  if (city && !isSejong) labelParts.push(city);
  if (district) labelParts.push(district);
  const label = labelParts.filter(Boolean).join(' ');

  return {
    sido,
    sidoShort: SIDO_SHORT[sido] || '',
    city,
    district,
    base,
    label,
    isMetro,
    ok: Boolean(base),
  };
};

/* ================================================================
   2. 관할 기관명 규칙
   ================================================================ */

/** 시(군) 단위에 경찰서가 여러 개인 지역 */
const POLICE_MULTI: Record<string, string[]> = {
  수원: ['수원중부', '수원남부', '수원서부', '권선', '장안'],
  성남: ['성남수정', '성남중원', '분당'],
  안양: ['안양만안', '안양동안'],
  안산: ['안산단원', '안산상록'],
  부천: ['부천원미', '부천소사', '부천오정'],
  고양: ['고양', '고양일산동부', '고양일산서부'],
  용인: ['용인동부', '용인서부'],
  천안: ['천안동남', '천안서북'],
  청주: ['청주상당', '청주흥덕', '청주청원'],
  전주: ['전주완산', '전주덕진'],
  창원: ['창원중부', '창원서부', '마산중부', '진해'],
  포항: ['포항북부', '포항남부'],
  김해: ['김해중부', '김해서부'],
};

/** 소방서가 여러 개인 지역 */
const FIRE_MULTI: Record<string, string[]> = {
  성남: ['성남', '분당'],
  고양: ['고양', '일산'],
  용인: ['용인', '수지'],
  수원: ['수원', '권선'],
};

/** 시·도별 관할 지방고용노동청 (지청 포함, 담당자 확인 필요) */
const LABOR_BY_SIDO: Record<string, string> = {
  서울특별시: '서울지방고용노동청',
  부산광역시: '부산지방고용노동청',
  대구광역시: '대구지방고용노동청',
  인천광역시: '중부지방고용노동청 인천지청',
  광주광역시: '광주지방고용노동청',
  대전광역시: '대전지방고용노동청',
  울산광역시: '부산지방고용노동청 울산지청',
  세종특별자치시: '대전지방고용노동청',
  경기도: '중부지방고용노동청',
  강원특별자치도: '중부지방고용노동청 강원지청',
  충청북도: '중부지방고용노동청 청주지청',
  충청남도: '대전지방고용노동청',
  전북특별자치도: '광주지방고용노동청 전주지청',
  전라남도: '광주지방고용노동청',
  경상북도: '대구지방고용노동청',
  경상남도: '부산지방고용노동청',
  제주특별자치도: '광주지방고용노동청 제주지청',
};

/** 전국 공통 번호 (확인 불필요) */
export const NATIONAL_NUMBERS = ['119', '112', '1339', '123', '1644-4544', '1544-4500', '100'];

/** 숫자만 추출 ('100 (KT)' → '100') */
const digitsOnly = (value: string): string => (value || '').replace(/[^0-9]/g, '');

/** 전국 공통 번호인지 (지역과 무관하게 항상 동일) */
export const isNationalNumber = (phone: string): boolean => {
  const d = digitsOnly(phone);
  if (!d) return false;
  return NATIONAL_NUMBERS.some(n => digitsOnly(n) === d);
};

/**
 * 관할 기관명 조합
 * - 광역시: 시·도 약칭을 붙인다 (강남구 → 서울강남소방서)
 * - 도 지역: 시·군 명칭을 쓴다 (용인시 → 용인소방서)
 */
const orgNames = (
  region: ParsedRegion,
  suffix: '소방서' | '경찰서',
  multi?: string[]
): string => {
  const list = multi && multi.length > 0 ? multi : [region.base];
  const short = region.sidoShort;
  const needPrefix =
    region.isMetro && Boolean(short) && !list.every(name => name.startsWith(short));
  const prefix = needPrefix ? short : '';
  return list.map(name => `${prefix}${name}${suffix}`).join(' / ');
};

/* ================================================================
   3. 검색 링크
   ================================================================ */

/** 네이버 통합검색 */
export const searchUrl = (query: string): string =>
  `https://search.naver.com/search.naver?query=${encodeURIComponent(query)}`;

/** 네이버 지도 검색 */
export const mapUrl = (query: string): string =>
  `https://map.naver.com/p/search/${encodeURIComponent(query)}`;

export interface LookupLink {
  label: string;
  desc: string;
  url: string;
}

/** 지정병원 후보를 찾기 위한 외부 링크 */
export const hospitalLookupLinks = (region: ParsedRegion): LookupLink[] => {
  const where = region.label || '현장 인근';
  const base = region.base || '현장 인근';
  return [
    {
      label: '지도에서 응급실 검색',
      desc: `${where} 주변 응급실 · 응급의료기관 위치/거리 확인`,
      url: mapUrl(`${where} 응급실`),
    },
    {
      label: '응급의료포털 (e-gen)',
      desc: '국립중앙의료원 운영 — 응급실 실시간 가용 병상 확인',
      url: 'https://www.e-gen.or.kr/egen/main.do',
    },
    {
      label: '산재지정 의료기관 검색',
      desc: `${base} 지역 산재보험 지정 병원(산재지정) 확인`,
      url: searchUrl(`${where} 산재지정병원`),
    },
    {
      label: '24시간 응급실 검색',
      desc: '야간·휴일 진료 가능한 중증 응급의료기관 확인',
      url: searchUrl(`${where} 24시간 응급실`),
    },
  ];
};

/** 외부기관 전화번호 검색 링크 */
export const agencySearchUrl = (agency: ExternalAgency, region: ParsedRegion): string => {
  const name = agency.name.trim();
  const where = region.label;
  if (name && !/O{2,}/.test(name)) {
    return searchUrl(`${name} ${where} 대표전화`.trim());
  }
  return searchUrl(`${where} ${agency.category} 연락처`.trim());
};

/** 지정병원 검색 링크 */
export const searchHospital = (
  hospital: DesignatedHospital,
  region: ParsedRegion
): string => {
  const name = hospital.name.trim();
  const where = region.label || '현장 인근';
  if (name && !/O{2,}/.test(name)) {
    return searchUrl(`${name} ${hospital.address || where} 응급실 전화번호`.trim());
  }
  return mapUrl(`${where} 응급실`);
};

/* ================================================================
   4. 주소 기반 자동 채움
   ================================================================ */

type AgencyKind =
  | 'fire'
  | 'police'
  | 'labor'
  | 'kosa'
  | 'local'
  | 'power'
  | 'gas'
  | 'water'
  | 'telecom'
  | 'medical'
  | 'other';

const kindOf = (agency: ExternalAgency): AgencyKind => {
  const s = `${agency.category} ${agency.name}`;
  if (/소방|119/.test(s)) return 'fire';
  if (/경찰|112|치안/.test(s)) return 'police';
  if (/고용노동/.test(s)) return 'labor';
  if (/안전보건공단|1644-4544/.test(s)) return 'kosa';
  if (/재난안전|시청|군청|구청|지자체/.test(s)) return 'local';
  if (/1339|응급의료 상담/.test(s)) return 'medical';
  if (/한전|한국전력|전기·감전/.test(s)) return 'power';
  if (/가스/.test(s)) return 'gas';
  if (/상수|하수|수도/.test(s)) return 'water';
  if (/통신|KT|광케이블/.test(s)) return 'telecom';
  // 이름이 비어 있어도 구분(category)으로 판별
  if (/긴급\s*구조/.test(agency.category)) return 'fire';
  if (/(치안|교통)/.test(agency.category)) return 'police';
  return 'other';
};

/** 사용자가 직접 입력한 값인지 (자동 입력값 덮어쓰기 판단) */
const isManual = (agency: ExternalAgency): boolean =>
  !agency.autoFilled && agency.verified === true;

export interface RegionLookupResult {
  agencies: ExternalAgency[];
  /** 새로 채운 행 수 */
  changed: number;
  /** 채운 항목 설명 */
  summary: string[];
  region: ParsedRegion;
}

/** 주소 기준으로 외부기관 관할 정보를 채운다 */
export const applyRegionLookup = (
  agencies: ExternalAgency[],
  region: ParsedRegion
): RegionLookupResult => {
  const summary: string[] = [];
  let changed = 0;

  const next = agencies.map(agency => {
    const kind = kindOf(agency);
    // 담당자가 직접 입력·확인한 행은 건드리지 않는다.
    if (isManual(agency)) return agency;

    const patch: Partial<ExternalAgency> = {};

    if (kind === 'fire' && region.base) {
      const name = orgNames(region, '소방서', FIRE_MULTI[region.base]);
      patch.name = `소방서 (화재·구조·구급)`;
      patch.phone = '119';
      patch.note = `${name} 관할 — 119안전센터 확인 필요`;
      patch.verified = true; // 119 는 전국 공통
      summary.push(`소방서 → ${name} (신고 119)`);
    }

    if (kind === 'police' && region.base) {
      const name = orgNames(region, '경찰서', POLICE_MULTI[region.base]);
      patch.name = `경찰서 (사고·현장통제)`;
      patch.phone = '112';
      patch.note = `${name} 관할 — 지구대/파출소 확인 필요`;
      patch.verified = true; // 112 는 전국 공통
      summary.push(`경찰서 → ${name} (신고 112)`);
    }

    if (kind === 'labor') {
      const name = LABOR_BY_SIDO[region.sido] || `관할 지방고용노동청`;
      patch.name = '지방고용노동청 (산재예방지도과)';
      patch.note = `${name} — 관할 지청·광역중대재해수사과 번호 확인 필요`;
      patch.verified = false;
      summary.push(`고용노동청 → ${name}`);
    }

    if (kind === 'local' && (region.city || region.district)) {
      let name = '';
      if (region.isMetro) {
        name = region.district ? `${region.district}청` : `${region.city}청`;
      } else if (region.city) {
        name = /군$/.test(region.city) ? `${region.city}청` : `${region.city}청`;
      } else {
        name = `${region.district}청`;
      }
      patch.name = `${name} 재난안전상황실`;
      patch.note = '시설물 붕괴·도로·환경 사고 시 — 야간 당직번호 확인 필요';
      patch.verified = false;
      summary.push(`지자체 → ${name} 재난안전상황실`);
    }

    if (kind === 'water') {
      const name = region.isMetro
        ? `${region.sidoShort}시 상수도사업본부`
        : region.city
          ? `${region.city} 상수도사업소`
          : `${region.base} 상수도사업소`;
      patch.name = name;
      patch.note = '상수도관 파열·누수 시 — 관할 사업소 번호 확인 필요';
      patch.verified = false;
      summary.push(`상·하수도 → ${name}`);
    }

    if (Object.keys(patch).length === 0) return agency;
    changed += 1;
    return { ...agency, ...patch, autoFilled: true };
  });

  // 응급의료 상담 1339 행이 없으면 추가
  if (!next.some(a => kindOf(a) === 'medical')) {
    next.push({
      id: `ea-1339-${Date.now()}`,
      category: '의료·응급',
      name: '응급의료 상담센터 (질병관리청)',
      phone: '1339',
      note: '응급실·병원 안내, 야간 진료 상담 (24시간)',
      autoFilled: true,
      verified: true,
    });
    summary.push('응급의료 상담 → 1339 추가');
  }

  // 전국 공통 번호는 자동 '확인 완료'
  const normalized = next.map(a =>
    NATIONAL_NUMBERS.includes(a.phone.trim()) ? { ...a, verified: true } : a
  );

  return { agencies: normalized, changed, summary, region };
};

/* ================================================================
   5. 입력 점검 (검증)
   ================================================================ */

export type AuditLevel = 'error' | 'warn';

export interface AuditIssue {
  level: AuditLevel;
  /** 위치 (예: 3. 외부 유관기관 2행) */
  where: string;
  message: string;
}

const PLACEHOLDER = /O{2,}|미입력|확인\s*필요|OOO/;

const isPlaceholder = (value: string): boolean => PLACEHOLDER.test(value || '');

const isEmpty = (value: string): boolean => !(value || '').trim();

/** 전화번호 형식 검사 (119·112·1339·100·1644-4544·031-123-4567 허용) */
const isValidPhone = (value: string): boolean => {
  const v = (value || '').replace(/\s/g, '');
  if (!v) return false;
  if (/^\d{3,4}$/.test(v)) return true; // 119, 112, 1339, 100
  if (/^\d{4}-\d{4}$/.test(v)) return true; // 1644-4544
  if (/^0\d{1,2}-\d{3,4}-\d{4}$/.test(v)) return true; // 031-123-4567
  if (/^01\d-\d{3,4}-\d{4}$/.test(v)) return true; // 010-1234-5678
  return false;
};

/** 게시판 출력 전 점검 */
export const auditEmergencyPlan = (plan: EmergencyPlan): AuditIssue[] => {
  const issues: AuditIssue[] = [];

  if (isEmpty(plan.constructionName)) {
    issues.push({ level: 'error', where: '기본 정보', message: '공사명이 비어 있습니다.' });
  }
  if (isEmpty(plan.siteAddress)) {
    issues.push({ level: 'error', where: '기본 정보', message: '현장 주소가 비어 있습니다.' });
  } else if (isPlaceholder(plan.siteAddress)) {
    issues.push({
      level: 'error',
      where: '기본 정보',
      message: '현장 주소에 예시(O, OOO)가 남아 있습니다. 실제 도로명 주소를 입력하세요.',
    });
  }
  if (isEmpty(plan.author)) {
    issues.push({
      level: 'warn',
      where: '기본 정보',
      message: '작성자(안전관리자 성명)가 비어 있습니다.',
    });
  }
  if (isEmpty(plan.entryPoint)) {
    issues.push({
      level: 'warn',
      where: '기본 정보',
      message: '유도자 배치 출입구가 비어 있습니다.',
    });
  }

  /* 2. 내부 연락망 — 연락처 없는 인원은 묶어서 1건으로 보고 */
  const noPhone: string[] = [];
  let badFormat = 0;
  plan.contacts.forEach(c => {
    if (isEmpty(c.role) && isEmpty(c.name) && isEmpty(c.phone)) return; // 완전 빈 행은 무시
    if (isEmpty(c.phone)) {
      noPhone.push(c.role || c.name || '직책 미입력');
      return;
    }
    if (!isValidPhone(c.phone) || isPlaceholder(c.phone)) badFormat += 1;
  });
  if (noPhone.length > 0) {
    issues.push({
      level: 'error',
      where: '2. 내부 연락망',
      message: `연락처가 비어 있는 인원 ${noPhone.length}명 — ${noPhone.join(', ')}`,
    });
  }
  if (badFormat > 0) {
    issues.push({
      level: 'warn',
      where: '2. 내부 연락망',
      message: `전화번호 형식을 확인할 인원 ${badFormat}명`,
    });
  }

  /* 3. 외부 유관기관 — 비어 있거나 미확인인 번호를 묶어서 보고 */
  const noNum: string[] = [];
  const unverified: string[] = [];
  const badAgencyFormat: string[] = [];
  plan.agencies.forEach(a => {
    if (isEmpty(a.name)) return;
    if (isEmpty(a.phone)) noNum.push(a.name);
    else if (!isValidPhone(a.phone)) badAgencyFormat.push(`${a.name}(${a.phone})`);
    else if (!a.verified && !isNationalNumber(a.phone)) unverified.push(a.name);
  });
  if (noNum.length > 0) {
    issues.push({
      level: 'warn',
      where: '3. 외부기관',
      message: `전화번호가 비어 있는 기관 ${noNum.length}곳 — ${noNum.join(', ')}`,
    });
  }
  if (badAgencyFormat.length > 0) {
    issues.push({
      level: 'warn',
      where: '3. 외부기관',
      message: `번호 형식 확인 필요 — ${badAgencyFormat.join(', ')}`,
    });
  }
  if (unverified.length > 0) {
    issues.push({
      level: 'warn',
      where: '3. 외부기관',
      message: `'확인' 체크가 안 된 기관 ${unverified.length}곳 — ${unverified.join(', ')}`,
    });
  }

  /* 4. 지정병원 */
  plan.hospitals.forEach((h, i) => {
    const label = `4. 지정병원 ${i + 1}행`;
    if (isEmpty(h.name)) {
      issues.push({ level: 'error', where: label, message: '병원명이 비어 있습니다.' });
      return;
    }
    if (isPlaceholder(h.name)) {
      issues.push({
        level: 'error',
        where: label,
        message: `병원명이 '${h.name}'로 남아 있습니다. 실제 병원명을 입력하세요.`,
      });
    }
    if (isEmpty(h.erPhone)) {
      issues.push({
        level: 'error',
        where: label,
        message: `'${h.name}' 응급실 직통번호가 비어 있습니다.`,
      });
    } else if (!isValidPhone(h.erPhone)) {
      issues.push({
        level: 'warn',
        where: label,
        message: `'${h.name}' 직통번호 형식이 올바르지 않습니다 (${h.erPhone}).`,
      });
    } else if (!h.verified) {
      issues.push({
        level: 'warn',
        where: label,
        message: `'${h.name}' 직통번호(${h.erPhone})를 아직 확인하지 않았습니다.`,
      });
    }
    if (isEmpty(h.address)) {
      issues.push({ level: 'warn', where: label, message: `'${h.name}' 도로명 주소가 비어 있습니다.` });
    }
    if (isEmpty(h.distance)) {
      issues.push({
        level: 'warn',
        where: label,
        message: `'${h.name}' 거리·소요시간이 비어 있습니다.`,
      });
    }
  });

  if (isEmpty(plan.mapImageKey || '')) {
    issues.push({
      level: 'warn',
      where: '4. 지정병원',
      message: '약도 이미지가 등록되지 않았습니다.',
    });
  }

  const order: Record<AuditLevel, number> = { error: 0, warn: 1 };
  return issues.sort((a, b) => order[a.level] - order[b.level]);
};

/** 점검 요약 (게시판 상단 표시용) */
export const summarizeAudit = (issues: AuditIssue[]): { errors: number; warns: number } => ({
  errors: issues.filter(i => i.level === 'error').length,
  warns: issues.filter(i => i.level === 'warn').length,
});

/** 지정병원 행 보조 문구 */
export const hospitalHint = (h: DesignatedHospital): string => {
  if (h.verified) return '확인 완료';
  if (h.autoFilled) return '자동 입력 — 확인 필요';
  return '확인 필요';
};
