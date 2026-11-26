import { ContractAmount, SiteInfo, SiteStaff } from '../types';

const SITE_INFO_KEY = 'gubo_site_info';

/**
 * 저장된 원본 1건.
 *
 * 예전 버전에서 저장한 값(contractAmount · developerName · siteManager …)이
 * 그대로 남아 있을 수 있으므로, 읽을 때는 느슨한 타입으로 받아
 * normalize 에서 새 구조로 옮깁니다.
 */
type StoredSiteInfo = Partial<SiteInfo> & {
  /** (구) 단일 계약금액 → contractAmounts[0] 으로 이전 */
  contractAmount?: string;
  /** (구) 시행사 → 시공사와 중복되어 폐지 */
  developerName?: string;
  /** (구) 현장소장 성명 → 관리자(안전인력)의 '현장소장'으로 이전 */
  siteManager?: string;
  /** (구) 현장공무 */
  siteOfficer?: string;
  /** (구) 현장 사무실 연락처 */
  officePhone?: string;
  /** (구) 안전관리자 연락처 */
  safetyManagerPhone?: string;
  /** (구) 현재 인원 */
  workerCount?: number;
};

type SiteInfoMap = Record<string, StoredSiteInfo>;

const readAll = (): SiteInfoMap => {
  const data = localStorage.getItem(SITE_INFO_KEY);
  return data ? (JSON.parse(data) as SiteInfoMap) : {};
};

const persist = (map: SiteInfoMap): void => {
  localStorage.setItem(SITE_INFO_KEY, JSON.stringify(map));
};

/* ------------------------------------------------------------------ */
/* 계약금액 (최초 · 변경1 · 변경2 …)                                    */
/* ------------------------------------------------------------------ */

export const generateContractAmountId = (): string =>
  `cam-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** 계약금액 1건 만들기 */
export const createContractAmount = (label = '', amount = ''): ContractAmount => ({
  id: generateContractAmountId(),
  label,
  amount,
});

/** 다음에 붙일 항목명 — 최초가 있으면 변경1, 변경2 … 로 이어집니다. */
export const nextContractLabel = (list: ContractAmount[]): string => {
  const labels = list.map(a => a.label.trim());
  if (labels.length === 0 || !labels.includes('최초')) return '최초';
  let index = 1;
  while (labels.includes(`변경${index}`)) index += 1;
  return `변경${index}`;
};

/** 기본 계약금액 목록 (최초 1건) */
export const createEmptyContractAmounts = (): ContractAmount[] => [createContractAmount('최초')];

/* ------------------------------------------------------------------ */
/* 기본값                                                              */
/* ------------------------------------------------------------------ */

/** 현장 기본정보 기본값 (현장명만 채워진 빈 서식) */
export const createEmptySiteInfo = (siteId: number, siteName: string): SiteInfo => ({
  siteId,
  siteName,
  businessNumber: '',
  address: '',
  constructionType: '',
  scale: '',
  contractPeriod: '',
  startDate: '',
  completionDate: '',
  actualStartDate: '',
  clientName: '',
  contractorName: '',
  siteAddress: '',
  contractAmounts: createEmptyContractAmounts(),
  contractFiles: [],
  staff: [],
  notes: '',
  updatedAt: '',
});

/* ------------------------------------------------------------------ */
/* 보정                                                                */
/* ------------------------------------------------------------------ */

/** 관리자 1명 보정 — 첨부자료 배열이 없어도 안전하게 */
const normalizeStaff = (staff: SiteStaff): SiteStaff => ({
  ...staff,
  attachments: Array.isArray(staff.attachments) ? staff.attachments : [],
});

/** 계약금액 목록 보정 — 항목명/금액이 모두 빈 행은 버립니다. */
const normalizeContractAmounts = (list: unknown, legacyAmount?: string): ContractAmount[] => {
  const rows: ContractAmount[] = Array.isArray(list)
    ? list
        .filter((row): row is ContractAmount => Boolean(row) && typeof row === 'object')
        .map((row, i) => ({
          id: row.id || `${generateContractAmountId()}-${i}`,
          label: typeof row.label === 'string' ? row.label : '',
          amount: typeof row.amount === 'string' ? row.amount : '',
        }))
    : [];

  /* 예전 단일 계약금액만 저장돼 있던 현장은 '최초' 항목으로 옮겨 줍니다.
     (값을 잃지 않도록 — 이미 목록이 있으면 건드리지 않습니다) */
  if (rows.length === 0 && legacyAmount && legacyAmount.trim()) {
    rows.push(createContractAmount('최초', legacyAmount.trim()));
  }

  const filled = rows.filter(a => a.label.trim() || a.amount.trim());
  return filled.length > 0 ? filled : createEmptyContractAmounts();
};

/** 저장된 데이터에 신규 필드가 없어도 안전하도록 보정 */
const normalize = (info: StoredSiteInfo, siteId: number, siteName: string): SiteInfo => {
  const base = createEmptySiteInfo(siteId, siteName);

  const staff = Array.isArray(info.staff) ? info.staff.map(normalizeStaff) : [];

  /* 예전 '현장소장' 입력값이 남아 있고 관리자 목록에 현장소장이 없으면
     관리자(안전인력)로 옮겨 줍니다. (입력값을 잃지 않도록) */
  const legacyManager = (info.siteManager || '').trim();
  if (legacyManager && !staff.some(s => s.role === '현장소장')) {
    staff.unshift({
      id: generateStaffId(),
      role: '현장소장',
      name: legacyManager,
      phone: '',
      appointedAt: '',
      dismissedAt: '',
      trainingDate: '',
      newTraining8h: false,
      attachments: [],
      note: '기존 현장 기본정보에서 옮겨온 항목',
    });
  }

  return {
    ...base,
    ...info,
    siteId,
    siteName: info.siteName || siteName,
    businessNumber: info.businessNumber || '',
    startDate: info.startDate || '',
    completionDate: info.completionDate || '',
    actualStartDate: info.actualStartDate || '',
    clientName: info.clientName || '',
    contractorName: info.contractorName || '',
    siteAddress: info.siteAddress || '',
    contractAmounts: normalizeContractAmounts(info.contractAmounts, info.contractAmount),
    contractFiles: Array.isArray(info.contractFiles) ? info.contractFiles : [],
    staff,
    notes: info.notes || '',
    updatedAt: info.updatedAt || '',
  };
};

/** 현장 기본정보 조회 (없으면 빈 서식 반환) */
export const getSiteInfo = (siteId: number, siteName: string): SiteInfo => {
  const all = readAll();
  const stored = all[String(siteId)];
  if (!stored) return createEmptySiteInfo(siteId, siteName);
  return normalize(stored, siteId, siteName);
};

/** 현장 기본정보 저장 */
export const saveSiteInfo = (info: SiteInfo): void => {
  const all = readAll();
  /* 저장할 때는 새 구조의 항목만 남깁니다.
     (예전 버전의 contractAmount · developerName · siteManager … 는 위 normalize 에서
      이미 새 항목으로 옮겨졌으므로, 옛 키가 계속 쌓이지 않도록 정리합니다) */
  all[String(info.siteId)] = {
    siteId: info.siteId,
    siteName: info.siteName,
    businessNumber: info.businessNumber,
    address: info.address,
    constructionType: info.constructionType,
    scale: info.scale,
    contractPeriod: info.contractPeriod,
    startDate: info.startDate,
    completionDate: info.completionDate,
    actualStartDate: info.actualStartDate,
    clientName: info.clientName,
    contractorName: info.contractorName,
    siteAddress: info.siteAddress,
    contractAmounts: info.contractAmounts,
    contractFiles: info.contractFiles ?? [],
    staff: info.staff,
    notes: info.notes,
    updatedAt: new Date().toISOString(),
  };
  persist(all);
};

/** 현장 기본정보 입력 여부 (내용이 하나라도 채워졌는지) */
export const isSiteInfoFilled = (info: SiteInfo): boolean =>
  Boolean(
    info.businessNumber ||
    info.address ||
    info.constructionType ||
    info.scale ||
    info.contractPeriod ||
    info.startDate ||
    info.completionDate ||
    info.actualStartDate ||
    info.clientName ||
    info.contractorName ||
    info.siteAddress ||
    info.contractAmounts?.some(a => a.label.trim() || a.amount.trim()) ||
    (info.contractFiles && info.contractFiles.length > 0) ||
    info.notes ||
    (info.staff && info.staff.length > 0),
  );

/* ------------------------------------------------------------------ */
/* 관리자(안전인력) 헬퍼                                                */
/* ------------------------------------------------------------------ */

export const generateStaffId = (): string =>
  `staff-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const createEmptyStaff = (role: SiteStaff['role'] = '안전관리자'): SiteStaff => ({
  id: generateStaffId(),
  role,
  name: '',
  phone: '',
  appointedAt: '',
  dismissedAt: '',
  trainingDate: '',
  newTraining8h: false,
  note: '',
});
