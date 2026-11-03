// 현장 정보 타입
export interface Site {
  id: number;
  name: string;
  location: string;
  status: 'active' | 'inactive' | 'completed';
  completedAt?: string;
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
  responseImages?: string[];
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
  resumeImages?: string[];
}

// 사고사례 타입
export interface AccidentCase {
  id: string;
  siteId: number;
  siteName: string;
  accidentDate: string; // 사고 발생 일시
  accidentType: '추락' | '낙하비래' | '전도' | '협착' | '전기감전' | '화재폭발' | '끼임' | '부딪힘' | '넘어짐' | '질병' | '기타';
  severity: '경상' | '중상' | '사망' | '무재해';
  location: string; // 사고 발생 장소
  victimName?: string; // 피해자 성명 (선택)
  victimAge?: number; // 피해자 나이
  description: string; // 사고 경위
  cause: string; // 사고 원인
  preventiveMeasures: string; // 재발 방지 대책
  images?: string[]; // 사고 현장 사진
  status: '접수' | '조사중' | '완료';
  createdAt: string;
  reporterName: string; // 보고자
  reporterPhone: string;
  completedAt?: string;
  investigationResult?: string; // 조사 결과
  investigationImages?: string[];
  // 새로 추가되는 필드
  disasterReportSubmitted?: '제출' | '미제출'; // 사업재해조사표 제출 여부
  treatmentResult?: '공상' | '산재' | '질병성' | '미처리'; // 사고 처리결과
}
