import { Suggestion, WorkStopRequest } from '../types';

// 로컬스토리지 키
const SUGGESTIONS_KEY = 'gubo_suggestions';
const WORK_STOPS_KEY = 'gubo_work_stops';

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
