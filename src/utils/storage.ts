import { Suggestion, WorkStopRequest } from '../types';
import { Site } from '../types';

// 로컬스토리지 키
const SUGGESTIONS_KEY = 'gubo_suggestions';
const WORK_STOPS_KEY = 'gubo_work_stops';
const SITES_KEY = 'gubo_sites';

// 건의사항 관련 함수
export const getSuggestions = (): Suggestion[] => {
  const data = localStorage.getItem(SUGGESTIONS_KEY);
  return data ? JSON.parse(data) : [];
};

export const saveSuggestion = (suggestion: Suggestion): void => {
  const suggestions = getSuggestions();
  suggestions.unshift(suggestion);
  localStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(suggestions));
};

export const updateSuggestion = (id: string, updates: Partial<Suggestion>): void => {
  const suggestions = getSuggestions();
  const index = suggestions.findIndex(s => s.id === id);
  if (index !== -1) {
    suggestions[index] = { ...suggestions[index], ...updates };
    localStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(suggestions));
  }
};

export const deleteSuggestion = (id: string): void => {
  const suggestions = getSuggestions();
  const filtered = suggestions.filter(s => s.id !== id);
  localStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(filtered));
};

// 작업중지권 관련 함수
export const getWorkStops = (): WorkStopRequest[] => {
  const data = localStorage.getItem(WORK_STOPS_KEY);
  return data ? JSON.parse(data) : [];
};

export const saveWorkStop = (workStop: WorkStopRequest): void => {
  const workStops = getWorkStops();
  workStops.unshift(workStop);
  localStorage.setItem(WORK_STOPS_KEY, JSON.stringify(workStops));
};

export const updateWorkStop = (id: string, updates: Partial<WorkStopRequest>): void => {
  const workStops = getWorkStops();
  const index = workStops.findIndex(w => w.id === id);
  if (index !== -1) {
    workStops[index] = { ...workStops[index], ...updates };
    localStorage.setItem(WORK_STOPS_KEY, JSON.stringify(workStops));
  }
};

export const deleteWorkStop = (id: string): void => {
  const workStops = getWorkStops();
  const filtered = workStops.filter(w => w.id !== id);
  localStorage.setItem(WORK_STOPS_KEY, JSON.stringify(filtered));
};

// ID 생성 함수
export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// 날짜 포맷 함수
export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// 전체 데이터 삭제 함수
export const clearAllSuggestions = (): void => {
  localStorage.removeItem(SUGGESTIONS_KEY);
};

export const clearAllWorkStops = (): void => {
  localStorage.removeItem(WORK_STOPS_KEY);
};

export const clearAllData = (): void => {
  clearAllSuggestions();
  clearAllWorkStops();
};

// 현장 관리 함수
export const getSites = (): Site[] => {
  const data = localStorage.getItem(SITES_KEY);
  if (!data) {
    // 기본 현장 데이터 반환
    return [];
  }
  return JSON.parse(data);
};

export const saveSites = (sites: Site[]): void => {
  localStorage.setItem(SITES_KEY, JSON.stringify(sites));
};

export const addSite = (site: Site): void => {
  const sites = getSites();
  sites.push(site);
  saveSites(sites);
};

export const updateSite = (id: number, updates: Partial<Site>): void => {
  const sites = getSites();
  const index = sites.findIndex(s => s.id === id);
  if (index !== -1) {
    sites[index] = { ...sites[index], ...updates };
    saveSites(sites);
  }
};

export const deleteSite = (id: number): void => {
  const sites = getSites();
  const filtered = sites.filter(s => s.id !== id);
  saveSites(filtered);
};

export const generateSiteId = (): number => {
  const sites = getSites();
  if (sites.length === 0) return 1;
  return Math.max(...sites.map(s => s.id)) + 1;
};

// 준공 현장 관리
const COMPLETED_SITES_KEY = 'gubo_completed_sites';

export const getCompletedSites = (): Site[] => {
  const data = localStorage.getItem(COMPLETED_SITES_KEY);
  return data ? JSON.parse(data) : [];
};

export const saveCompletedSites = (sites: Site[]): void => {
  localStorage.setItem(COMPLETED_SITES_KEY, JSON.stringify(sites));
};

export const moveSiteToCompleted = (id: number): void => {
  const sites = getSites();
  const siteIndex = sites.findIndex(s => s.id === id);
  
  if (siteIndex !== -1) {
    const site = sites[siteIndex];
    const completedSite: Site = {
      ...site,
      status: 'completed',
      completedAt: new Date().toISOString()
    };
    
    // 완료 현장에 추가
    const completedSites = getCompletedSites();
    completedSites.unshift(completedSite);
    saveCompletedSites(completedSites);
    
    // 현재 현장에서 제거
    sites.splice(siteIndex, 1);
    saveSites(sites);
  }
};

export const restoreSiteFromCompleted = (id: number): void => {
  const completedSites = getCompletedSites();
  const siteIndex = completedSites.findIndex(s => s.id === id);
  
  if (siteIndex !== -1) {
    const site = completedSites[siteIndex];
    const restoredSite: Site = {
      ...site,
      status: 'active',
      completedAt: undefined
    };
    
    // 현재 현장에 추가
    const sites = getSites();
    sites.push(restoredSite);
    saveSites(sites);
    
    // 완료 현장에서 제거
    completedSites.splice(siteIndex, 1);
    saveCompletedSites(completedSites);
  }
};

export const deleteCompletedSite = (id: number): void => {
  const completedSites = getCompletedSites();
  const filtered = completedSites.filter(s => s.id !== id);
  saveCompletedSites(filtered);
};
