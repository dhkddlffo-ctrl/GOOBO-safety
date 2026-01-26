// 현장 정보 타입
export interface Site {
  id: number;
  name: string;
  location: string;
  status: 'active' | 'inactive';
}

// 건의사항 타입
export interface Suggestion {
  id: string;
  siteId: number;
  siteName: string;
  workerName: string;
  phone: string;
  category: '안전' | '환경' | '작업조건' | '기타';
  title: string;
  content: string;
  images?: string[];
  status: '접수' | '검토중' | '완료' | '반려';
  createdAt: string;
  response?: string;
  respondedAt?: string;
}

// 작업중지권 타입
export interface WorkStopRequest {
  id: string;
  siteId: number;
  siteName: string;
  workerName: string;
  phone: string;
  location: string;
  dangerType: '추락' | '낙하비래' | '전도' | '협착' | '전기' | '화재폭발' | '기타';
  description: string;
  images?: string[];
  status: '요청' | '승인' | '작업재개' | '반려';
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  resumedAt?: string;
  remarks?: string;
}
