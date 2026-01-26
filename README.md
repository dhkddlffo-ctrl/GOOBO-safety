# 구보공영(주) 현장 안전 관리 시스템

구보공영(주)의 10개 현장 근로자를 위한 안전 관리 웹 애플리케이션입니다.

## 주요 기능

### 1. 작업중지권 행사 🛑
- 위험 상황 즉시 신고
- 실시간 안전관리팀 통보
- 작업중지 승인/재개 관리

### 2. 건의사항 제출 💡
- 현장 개선사항 제안
- 안전/환경/작업조건 등 분류별 관리
- 검토 및 피드백 시스템

### 3. 관리자 대시보드 📊
- 전체 현장 통합 관리
- 작업중지 및 건의사항 현황 조회
- 상태별 처리 및 승인 시스템

## 포함된 현장

1. 용인시 에코타운 조성 민자사업 현장
2. 운정3지구A-8BL민간임대주택신축공사
3. 장위6구역 주택재개발 정비사업파트 신축공사
4. 용인 은화삼지구 A1BL 공동주택 신축공사
5. 학익3구역 주택재개발정비사업
6. 송도 역세권 2블럭 신축공사
7. 양주역세권5 공동주택 신축공사
8. 성수장미아파트
9. 부천대장 A5 6BL공공주택
10. 수표구역 도시정비형 재개발사업

## 기술 스택

- **Frontend**: React 19 + TypeScript
- **Build Tool**: Vite
- **Styling**: CSS3 (Custom)
- **Storage**: LocalStorage

## 시작하기

### 설치
```bash
npm install
```

### 개발 서버 실행
```bash
npm run dev
```

### 빌드
```bash
npm run build
```

### 프리뷰
```bash
npm run preview
```

## 특징

- ✅ 반응형 디자인 (모바일/태블릿/데스크톱)
- ✅ 직관적인 사용자 인터페이스
- ✅ 실시간 데이터 저장 (LocalStorage)
- ✅ 현장별 개별 관리
- ✅ 상태별 필터링 및 관리

## 보안 및 개인정보

제출된 모든 정보는 안전관리 목적으로만 사용되며, 관련 법령에 따라 보호됩니다.

## 관리자 가이드

### 게시글 관리 방법

#### 1. 개별 삭제
- 관리자 대시보드 접속
- 작업중지권 또는 건의사항 탭 선택
- 각 항목 하단의 "🗑️ 삭제" 버튼 클릭
- 확인 메시지에서 "확인" 클릭

#### 2. 전체 삭제
- 관리자 대시보드 상단의 삭제 버튼 사용
  - "🗑️ 작업중지 전체 삭제": 모든 작업중지 요청 삭제
  - "🗑️ 건의사항 전체 삭제": 모든 건의사항 삭제
  - "⚠️ 모든 데이터 삭제": 모든 데이터 삭제
- 2단계 확인 후 삭제 실행

#### 3. 브라우저 개발자 도구 사용 (고급)
```javascript
// F12 키를 눌러 개발자 도구 열기
// Console 탭에서 실행

// 모든 건의사항 삭제
localStorage.removeItem('gubo_suggestions');

// 모든 작업중지 요청 삭제
localStorage.removeItem('gubo_work_stops');

// 모든 데이터 삭제
localStorage.clear();

// 페이지 새로고침
location.reload();
```

### 데이터 백업 방법

#### 브라우저 개발자 도구 사용
```javascript
// F12 키를 눌러 개발자 도구 열기
// Console 탭에서 실행

// 데이터 백업 (복사 후 텍스트 파일로 저장)
console.log(JSON.stringify({
  suggestions: JSON.parse(localStorage.getItem('gubo_suggestions') || '[]'),
  workStops: JSON.parse(localStorage.getItem('gubo_work_stops') || '[]')
}, null, 2));

// 데이터 복원 (백업한 JSON 데이터를 data 변수에 넣기)
const data = { /* 백업 데이터 붙여넣기 */ };
localStorage.setItem('gubo_suggestions', JSON.stringify(data.suggestions));
localStorage.setItem('gubo_work_stops', JSON.stringify(data.workStops));
location.reload();
```

### 주의사항
- ⚠️ LocalStorage를 사용하므로 브라우저 쿠키/캐시 삭제 시 데이터 손실
- ⚠️ 같은 브라우저에서만 데이터 유지 (다른 브라우저/기기에서 접근 불가)
- ⚠️ 정기적으로 데이터 백업 권장
- ⚠️ 삭제된 데이터는 복구 불가능

## 라이선스

ISC
