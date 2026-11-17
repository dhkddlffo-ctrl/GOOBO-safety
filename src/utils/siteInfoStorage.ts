import { SiteInfo } from '../types';

const SITE_INFO_KEY = 'gubo_site_info';

type SiteInfoMap = Record<string, SiteInfo>;

const readAll = (): SiteInfoMap => {
  const data = localStorage.getItem(SITE_INFO_KEY);
  return data ? JSON.parse(data) : {};
};

const persist = (map: SiteInfoMap): void => {
  localStorage.setItem(SITE_INFO_KEY, JSON.stringify(map));
};

/** 현장 기본정보 기본값 (현장명만 채워진 빈 서식) */
export const createEmptySiteInfo = (siteId: number, siteName: string): SiteInfo => ({
  siteId,
  siteName,
  address: '',
  constructionType: '',
  scale: '',
  contractPeriod: '',
  contractAmount: '',
  progressRate: 0,
  clientName: '',
  contractorName: '',
  safetyManager: '',
  safetyManagerPhone: '',
  siteManager: '',
  officePhone: '',
  workerCount: 0,
  notes: '',
  updatedAt: '',
});

/** 현장 기본정보 조회 (없으면 빈 서식 반환) */
export const getSiteInfo = (siteId: number, siteName: string): SiteInfo => {
  const all = readAll();
  return all[String(siteId)] || createEmptySiteInfo(siteId, siteName);
};

/** 현장 기본정보 저장 */
export const saveSiteInfo = (info: SiteInfo): void => {
  const all = readAll();
  all[String(info.siteId)] = { ...info, updatedAt: new Date().toISOString() };
  persist(all);
};

/** 현장 기본정보 입력 여부 (내용이 하나라도 채워졌는지) */
export const isSiteInfoFilled = (info: SiteInfo): boolean =>
  Boolean(
    info.address ||
      info.constructionType ||
      info.scale ||
      info.contractPeriod ||
      info.contractAmount ||
      info.clientName ||
      info.contractorName ||
      info.siteManager ||
      info.safetyManager ||
      info.notes
  );
