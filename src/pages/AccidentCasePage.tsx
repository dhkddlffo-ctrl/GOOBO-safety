import React, { useState, useEffect } from 'react';
import { getSites } from '../utils/storage';
import { AccidentCase, Site, WitnessStatement } from '../types';
import { saveAccidentCase, generateId } from '../utils/storage';
import AccidentReport from '../components/AccidentReport';
import SituationDiagram from '../components/SituationDiagram';
import WitnessEditor from '../components/WitnessEditor';
import { formatTenure } from '../utils/accidentReport';
import './AccidentCasePage.css';

interface AccidentCasePageProps {
  onNavigate: (page: string) => void;
  preselectedSiteId?: number;
}

const AccidentCasePage: React.FC<AccidentCasePageProps> = ({ onNavigate, preselectedSiteId }) => {
  const [sites, setSites] = useState<Site[]>([]);
  const [formData, setFormData] = useState({
    siteId: preselectedSiteId || 0,
    accidentDate: '',
    accidentType: '추락' as '추락' | '낙하비래' | '전도' | '협착' | '전기감전' | '화재폭발' | '끼임' | '부딪힘' | '넘어짐' | '질병' | '기타',
    severity: '경상' as '경상' | '중상' | '사망' | '무재해',
    location: '',
    victimName: '',
    victimAge: '',
    victimHireDate: '',
    /* 피해자 상세 */
    victimJobType: '',
    victimMaritalStatus: '' as '' | '미혼' | '기혼' | '기타',
    victimFamily: '',
    victimPhone: '',
    /* 재해(사고) 상황 */
    disasterDate: '',
    disasterPlace: '',
    situationNote: '',
    description: '',
    cause: '',
    preventiveMeasures: '',
    reporterName: '',
    reporterPhone: '',
    disasterReportSubmitted: '미제출' as '제출' | '미제출',
    treatmentResult: '미처리' as '공상' | '산재' | '질병성' | '미처리',
  });

  const [images, setImages] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [uploading, setUploading] = useState(false);
  /** 재해 상황도 (PNG data URL) */
  const [situationDiagram, setSituationDiagram] = useState('');
  /** 목격자 진술서 목록 */
  const [witnesses, setWitnesses] = useState<WitnessStatement[]>([]);
  /** 방금 접수한 사고사례 (접수 완료 화면에서 사고보고서 출력용) */
  const [savedCase, setSavedCase] = useState<AccidentCase | null>(null);
  /** 사고보고서 미리보기/인쇄 열림 여부 */
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    const savedSites = getSites();
    setSites(savedSites.filter(s => s.status === 'active'));
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (images.length + files.length > 5) {
      alert('최대 5개의 이미지만 첨부할 수 있습니다.');
      return;
    }

    setUploading(true);

    const newImages: string[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      if (file.size > 5 * 1024 * 1024) {
        alert(`${file.name}은(는) 5MB를 초과합니다.`);
        continue;
      }

      if (!file.type.startsWith('image/')) {
        alert(`${file.name}은(는) 이미지 파일이 아닙니다.`);
        continue;
      }

      try {
        const base64 = await fileToBase64(file);
        newImages.push(base64);
      } catch (error) {
        console.error('이미지 업로드 실패:', error);
        alert(`${file.name} 업로드에 실패했습니다.`);
      }
    }

    setImages([...images, ...newImages]);
    setUploading(false);
    
    if (e.target) {
      e.target.value = '';
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    // <select> 의 값은 항상 문자열이므로 현장 ID 는 숫자로 변환해 보관합니다.
    // (문자열로 두면 handleSubmit 의 `s.id === formData.siteId` 비교가 항상 실패합니다)
    if (name === 'siteId') {
      setFormData(prev => ({ ...prev, siteId: Number(value) }));
      return;
    }
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.siteId === 0) {
      alert('현장을 선택해주세요.');
      return;
    }

    if (!formData.accidentDate) {
      alert('사고 발생 일시를 입력해주세요.');
      return;
    }

    const selectedSite = sites.find(s => s.id === formData.siteId);
    if (!selectedSite) {
      alert('선택한 현장을 찾을 수 없습니다.');
      return;
    }

    const accidentCase: AccidentCase = {
      id: generateId(),
      siteId: formData.siteId,
      siteName: selectedSite.name,
      accidentDate: formData.accidentDate,
      accidentType: formData.accidentType,
      severity: formData.severity,
      location: formData.location,
      victimName: formData.victimName || '미제공',
      victimAge: formData.victimAge ? parseInt(formData.victimAge) : undefined,
      victimHireDate: formData.victimHireDate || undefined,
      /* 피해자 상세 */
      victimJobType: formData.victimJobType.trim() || undefined,
      victimMaritalStatus: formData.victimMaritalStatus || undefined,
      victimFamily: formData.victimFamily.trim() || undefined,
      victimPhone: formData.victimPhone.trim() || undefined,
      /* 재해(사고) 상황 */
      disasterDate: formData.disasterDate || undefined,
      disasterPlace: formData.disasterPlace.trim() || undefined,
      situationDiagram: situationDiagram || undefined,
      situationNote: formData.situationNote.trim() || undefined,
      witnesses: witnesses.length > 0 ? witnesses : undefined,
      description: formData.description,
      cause: formData.cause,
      preventiveMeasures: formData.preventiveMeasures,
      images: images.length > 0 ? images : undefined,
      status: '접수',
      createdAt: new Date().toISOString(),
      reporterName: formData.reporterName,
      reporterPhone: formData.reporterPhone,
      disasterReportSubmitted: formData.disasterReportSubmitted,
      treatmentResult: formData.treatmentResult,
    };

    saveAccidentCase(accidentCase);
    setSavedCase(accidentCase);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="accident-case-page">
        <div className="container">
          <div className="success-message">
            <div className="success-icon">✅</div>
            <h2>사고사례가 접수되었습니다</h2>
            <p>제출하신 사고사례는 안전관리팀에서 검토 후 재발 방지 대책을 수립합니다.</p>
            <p className="success-hint">
              🖨️ 접수된 내용으로 <strong>사고보고서(A4)</strong>를 바로 출력할 수 있습니다.
            </p>

            <div className="success-actions">
              <button
                className="btn btn-primary"
                onClick={() => setReportOpen(true)}
                disabled={!savedCase}
              >
                🖨️ 사고보고서 출력
              </button>
              <button className="btn btn-secondary" onClick={() => onNavigate('home')}>
                홈으로 돌아가기
              </button>
              <button 
                className="btn btn-secondary" 
                onClick={() => {
                  setSubmitted(false);
                  setSavedCase(null);
                  setFormData({
                    siteId: preselectedSiteId || 0,
                    accidentDate: '',
                    accidentType: '추락',
                    severity: '경상',
                    location: '',
                    victimName: '',
                    victimAge: '',
                    victimHireDate: '',
                    victimJobType: '',
                    victimMaritalStatus: '',
                    victimFamily: '',
                    victimPhone: '',
                    disasterDate: '',
                    disasterPlace: '',
                    situationNote: '',
                    description: '',
                    cause: '',
                    preventiveMeasures: '',
                    reporterName: '',
                    reporterPhone: '',
                    disasterReportSubmitted: '미제출',
                    treatmentResult: '미처리',
                  });
                  setImages([]);
                  setSituationDiagram('');
                  setWitnesses([]);
                }}
              >
                다른 사고사례 제출
              </button>
            </div>
          </div>

          {reportOpen && savedCase && (
            <AccidentReport accident={savedCase} onClose={() => setReportOpen(false)} autoPrint />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="accident-case-page">
      <div className="container">
        <div className="page-header">
          <button className="back-button" onClick={() => onNavigate('home')}>
            ← 뒤로가기
          </button>
          <h1>사고사례 제출</h1>
          <p>안전한 작업환경을 위해 사고사례를 공유해주세요</p>
        </div>

        <form onSubmit={handleSubmit} className="accident-form">
          {/* 현장 선택 */}
          <div className="form-group">
            <label htmlFor="siteId">현장 선택 *</label>
            <select
              id="siteId"
              name="siteId"
              value={formData.siteId}
              onChange={handleInputChange}
              required
            >
              <option value={0}>현장을 선택하세요</option>
              {sites.map(site => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </div>

          {/* 사고 발생 일시 */}
          <div className="form-group">
            <label htmlFor="accidentDate">사고 발생 일시 *</label>
            <input
              type="datetime-local"
              id="accidentDate"
              name="accidentDate"
              value={formData.accidentDate}
              onChange={handleInputChange}
              required
            />
          </div>

          {/* 사고 유형 및 심각도 */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="accidentType">사고 유형 *</label>
              <select
                id="accidentType"
                name="accidentType"
                value={formData.accidentType}
                onChange={handleInputChange}
                required
              >
                <option value="추락">추락</option>
                <option value="낙하비래">낙하비래</option>
                <option value="전도">전도</option>
                <option value="협착">협착</option>
                <option value="전기감전">전기감전</option>
                <option value="화재폭발">화재폭발</option>
                <option value="끼임">끼임</option>
                <option value="부딪힘">부딪힘</option>
                <option value="넘어짐">넘어짐</option>
                <option value="질병">질병</option>
                <option value="기타">기타</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="severity">심각도 *</label>
              <select
                id="severity"
                name="severity"
                value={formData.severity}
                onChange={handleInputChange}
                required
              >
                <option value="무재해">무재해</option>
                <option value="경상">경상</option>
                <option value="중상">중상</option>
                <option value="사망">사망</option>
              </select>
            </div>
          </div>

          {/* 사업재해조사표 및 처리결과 */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="disasterReportSubmitted">사업재해조사표 제출 여부</label>
              <select
                id="disasterReportSubmitted"
                name="disasterReportSubmitted"
                value={formData.disasterReportSubmitted}
                onChange={handleInputChange}
              >
                <option value="미제출">미제출</option>
                <option value="제출">제출</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="treatmentResult">사고 처리결과</label>
              <select
                id="treatmentResult"
                name="treatmentResult"
                value={formData.treatmentResult}
                onChange={handleInputChange}
              >
                <option value="미처리">미처리</option>
                <option value="공상">공상</option>
                <option value="산재">산재</option>
                <option value="질병성">질병성</option>
              </select>
            </div>
          </div>

          {/* 발생 장소 */}
          <div className="form-group">
            <label htmlFor="location">사고 발생 장소 *</label>
            <input
              type="text"
              id="location"
              name="location"
              value={formData.location}
              onChange={handleInputChange}
              placeholder="예: 5층 작업장, 외부 비계"
              required
            />
          </div>

          {/* 피해자 정보 (선택) */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="victimName">피해자 성명 (선택)</label>
              <input
                type="text"
                id="victimName"
                name="victimName"
                value={formData.victimName}
                onChange={handleInputChange}
                placeholder="미입력 시 '미제공'으로 표시"
              />
            </div>

            <div className="form-group">
              <label htmlFor="victimAge">피해자 나이 (선택)</label>
              <input
                type="number"
                id="victimAge"
                name="victimAge"
                value={formData.victimAge}
                onChange={handleInputChange}
                placeholder="예: 35"
                min="1"
                max="100"
              />
            </div>

            <div className="form-group">
              <label htmlFor="victimHireDate">피해자 입사일 (선택)</label>
              <input
                type="date"
                id="victimHireDate"
                name="victimHireDate"
                value={formData.victimHireDate}
                onChange={handleInputChange}
                max={formData.accidentDate ? formData.accidentDate.slice(0, 10) : undefined}
              />
              <p className="field-hint">
                {formData.victimHireDate
                  ? `근속기간: ${formatTenure(formData.victimHireDate, formData.accidentDate)} (사고 발생일 기준)`
                  : '사고보고서에 근속기간이 함께 출력됩니다.'}
              </p>
            </div>
          </div>

          {/* 피해자 상세 정보 — 직종 / 결혼여부 / 가족관계 / 연락처 */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="victimJobType">피해자 직종 (선택)</label>
              <input
                type="text"
                id="victimJobType"
                name="victimJobType"
                value={formData.victimJobType}
                onChange={handleInputChange}
                placeholder="예: 철근공, 형틀목공, 신호수"
                list="jobTypeOptions"
              />
              <datalist id="jobTypeOptions">
                <option value="철근공" />
                <option value="형틀목공" />
                <option value="비계공" />
                <option value="신호수" />
                <option value="장비운전원" />
                <option value="전기공" />
                <option value="용접공" />
                <option value="보통인부" />
              </datalist>
            </div>

            <div className="form-group">
              <label htmlFor="victimMaritalStatus">결혼여부 (선택)</label>
              <select
                id="victimMaritalStatus"
                name="victimMaritalStatus"
                value={formData.victimMaritalStatus}
                onChange={handleInputChange}
              >
                <option value="">선택 안 함</option>
                <option value="미혼">미혼</option>
                <option value="기혼">기혼</option>
                <option value="기타">기타</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="victimFamily">가족관계 (선택)</label>
              <input
                type="text"
                id="victimFamily"
                name="victimFamily"
                value={formData.victimFamily}
                onChange={handleInputChange}
                placeholder="예: 배우자 1명, 자녀 2명"
              />
            </div>

            <div className="form-group">
              <label htmlFor="victimPhone">피해자 연락처 (선택)</label>
              <input
                type="tel"
                id="victimPhone"
                name="victimPhone"
                value={formData.victimPhone}
                onChange={handleInputChange}
                placeholder="010-0000-0000"
              />
            </div>
          </div>

          {/* 재해(사고) 상황 */}
          <div className="form-section">
            <h3 className="form-section-title">🏗️ 재해(사고) 상황</h3>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="disasterDate">재해 발생일</label>
                <input
                  type="date"
                  id="disasterDate"
                  name="disasterDate"
                  value={formData.disasterDate}
                  onChange={handleInputChange}
                  max={formData.accidentDate ? formData.accidentDate.slice(0, 10) : undefined}
                />
                <p className="field-hint">
                  미입력 시 사고 발생 일시의 날짜가 사용됩니다.
                </p>
              </div>

              <div className="form-group">
                <label htmlFor="disasterPlace">재해 발생 장소</label>
                <input
                  type="text"
                  id="disasterPlace"
                  name="disasterPlace"
                  value={formData.disasterPlace}
                  onChange={handleInputChange}
                  placeholder="예: 지하 2층 타워크레인 설치 구간"
                />
                <p className="field-hint">
                  미입력 시 위의 ‘사고 발생 장소’가 사용됩니다.
                </p>
              </div>
            </div>

            <div className="form-group">
              <label>재해 상황도 (선택)</label>
              <SituationDiagram value={situationDiagram} onChange={setSituationDiagram} />
            </div>

            <div className="form-group">
              <label htmlFor="situationNote">상황 설명 (선택)</label>
              <textarea
                id="situationNote"
                name="situationNote"
                value={formData.situationNote}
                onChange={handleInputChange}
                rows={2}
                placeholder="상황도의 기호·표시에 대한 보충 설명 (예: 붉은 화살표 = 추락 방향)"
              />
            </div>
          </div>

          {/* 사고 경위 */}
          <div className="form-group">
            <label htmlFor="description">사고 경위 *</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              rows={4}
              placeholder="사고가 발생한 경위를 상세히 기술해주세요"
              required
            />
          </div>

          {/* 사고 원인 */}
          <div className="form-group">
            <label htmlFor="cause">사고 원인 *</label>
            <textarea
              id="cause"
              name="cause"
              value={formData.cause}
              onChange={handleInputChange}
              rows={3}
              placeholder="사고 발생의 근본 원인을 분석해주세요"
              required
            />
          </div>

          {/* 재발 방지 대책 */}
          <div className="form-group">
            <label htmlFor="preventiveMeasures">재발 방지 대책 *</label>
            <textarea
              id="preventiveMeasures"
              name="preventiveMeasures"
              value={formData.preventiveMeasures}
              onChange={handleInputChange}
              rows={3}
              placeholder="동일한 사고를 예방하기 위한 대책을 제안해주세요"
              required
            />
          </div>

          {/* 사진 첨부 */}
          <div className="form-group">
            <label>사고 현장 사진 (선택, 최대 5개)</label>
            <div className="image-upload-section">
              {images.length > 0 && (
                <div className="image-preview-grid">
                  {images.map((img, index) => (
                    <div key={index} className="image-preview-item">
                      <img src={img} alt={`사고 현장 ${index + 1}`} />
                      <button
                        type="button"
                        className="remove-image-btn"
                        onClick={() => removeImage(index)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              {images.length < 5 && (
                <div className="image-upload-area">
                  <input
                    type="file"
                    id="imageUpload"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    disabled={uploading}
                  />
                  <label htmlFor="imageUpload" className="upload-label">
                    <span className="upload-icon">📷</span>
                    <span>{uploading ? '업로드 중...' : '사진 추가하기'}</span>
                    <span className="upload-hint">JPG, PNG (최대 5MB)</span>
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* 목격자 진술서 */}
          <div className="form-section">
            <h3 className="form-section-title">👥 목격자 진술서</h3>
            <p className="form-section-desc">
              사고를 목격한 사람이 있다면 진술을 기록해주세요. 등록한 진술서는 사고보고서에 함께 인쇄됩니다.
            </p>
            <WitnessEditor value={witnesses} onChange={setWitnesses} />
          </div>

          {/* 보고자 정보 */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="reporterName">보고자 성명 *</label>
              <input
                type="text"
                id="reporterName"
                name="reporterName"
                value={formData.reporterName}
                onChange={handleInputChange}
                placeholder="홍길동"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="reporterPhone">보고자 연락처 *</label>
              <input
                type="tel"
                id="reporterPhone"
                name="reporterPhone"
                value={formData.reporterPhone}
                onChange={handleInputChange}
                placeholder="010-0000-0000"
                required
              />
            </div>
          </div>

          {/* 제출 버튼 */}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => onNavigate('home')}>
              취소
            </button>
            <button type="submit" className="btn btn-primary">
              사고사례 제출
            </button>
          </div>

          {/* 안내사항 */}
          <div className="info-box">
            <h4>📋 안내사항</h4>
            <ul>
              <li>제출하신 사고사례는 안전관리팀에서 검토합니다</li>
              <li>재발 방지 대책 수립 및 전 현장 공유에 활용됩니다</li>
              <li>개인정보는 사고 조사 목적으로만 사용됩니다</li>
              <li>사진은 최대 5개까지 첨부 가능하며, 각 파일당 5MB 이하여야 합니다</li>
            </ul>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AccidentCasePage;
