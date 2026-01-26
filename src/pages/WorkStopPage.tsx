import React, { useState } from 'react';
import { sites } from '../data/sites';
import { WorkStopRequest } from '../types';
import { saveWorkStop, generateId } from '../utils/storage';
import './WorkStopPage.css';

interface WorkStopPageProps {
  onNavigate: (page: string) => void;
  preselectedSiteId?: number;
}

const WorkStopPage: React.FC<WorkStopPageProps> = ({ onNavigate, preselectedSiteId }) => {
  const [formData, setFormData] = useState({
    siteId: preselectedSiteId || 0,
    workerName: '',
    phone: '',
    location: '',
    dangerType: '추락' as '추락' | '낙하비래' | '전도' | '협착' | '전기' | '화재폭발' | '기타',
    description: '',
  });

  const [images, setImages] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [uploading, setUploading] = useState(false);

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
      
      // 파일 크기 체크 (5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert(`${file.name}은(는) 5MB를 초과합니다.`);
        continue;
      }

      // 이미지 파일 체크
      if (!file.type.startsWith('image/')) {
        alert(`${file.name}은(는) 이미지 파일이 아닙니다.`);
        continue;
      }

      try {
        const base64 = await fileToBase64(file);
        newImages.push(base64);
      } catch (error) {
        console.error('이미지 변환 실패:', error);
        alert(`${file.name} 업로드에 실패했습니다.`);
      }
    }

    setImages(prev => [...prev, ...newImages]);
    setUploading(false);
    
    // input 초기화
    e.target.value = '';
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!confirmed) {
      alert('작업중지권 행사에 동의해주세요.');
      return;
    }

    if (!formData.siteId) {
      alert('현장을 선택해주세요.');
      return;
    }

    const site = sites.find(s => s.id === formData.siteId);
    if (!site) return;

    const workStop: WorkStopRequest = {
      id: generateId(),
      siteId: formData.siteId,
      siteName: site.name,
      workerName: formData.workerName,
      phone: formData.phone,
      location: formData.location,
      dangerType: formData.dangerType,
      description: formData.description,
      images: images.length > 0 ? images : undefined,
      status: '요청',
      createdAt: new Date().toISOString(),
    };

    saveWorkStop(workStop);
    setSubmitted(true);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'siteId' ? Number(value) : value,
    }));
  };

  if (submitted) {
    return (
      <div className="work-stop-page">
        <div className="container">
          <div className="success-message danger">
            <div className="success-icon">🛑</div>
            <h2>작업중지권이 행사되었습니다</h2>
            <p>
              안전관리팀에 즉시 통보되었습니다.<br />
              담당자가 곧 현장으로 출동할 예정입니다.
            </p>
            <div className="emergency-info">
              <h3>⚠️ 즉시 조치사항</h3>
              <ul>
                <li>위험 구역에 접근하지 마세요</li>
                <li>다른 작업자들에게 알려주세요</li>
                <li>안전한 장소로 대피하세요</li>
                <li>담당자의 지시를 기다려주세요</li>
              </ul>
            </div>
            <div className="success-actions">
              <button 
                className="btn btn-danger"
                onClick={() => onNavigate('home')}
              >
                홈으로 돌아가기
              </button>
              <button 
                className="btn btn-secondary"
                onClick={() => {
                  setSubmitted(false);
                  setConfirmed(false);
                  setImages([]);
                  setFormData({
                    siteId: preselectedSiteId || 0,
                    workerName: '',
                    phone: '',
                    location: '',
                    dangerType: '추락',
                    description: '',
                  });
                }}
              >
                추가 신고하기
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="work-stop-page">
      <div className="container">
        <div className="page-header danger-header">
          <button className="back-button" onClick={() => onNavigate('home')}>
            ← 뒤로가기
          </button>
          <h1>🛑 작업중지권 행사</h1>
          <p>위험 상황을 발견하셨나요? 즉시 신고해주세요.</p>
        </div>

        <div className="warning-box">
          <h3>⚠️ 작업중지권이란?</h3>
          <p>
            근로자가 산업재해가 발생할 급박한 위험이 있는 경우,
            작업을 중지하고 대피할 수 있는 권리입니다.
          </p>
          <ul>
            <li>중대재해처벌법 제4조에 근거한 법적 권리</li>
            <li>작업중지로 인한 불이익을 받지 않습니다</li>
            <li>신고자의 신원은 보호됩니다</li>
          </ul>
        </div>

        <form className="work-stop-form" onSubmit={handleSubmit}>
          <div className="form-section">
            <h3>기본 정보</h3>
            
            <div className="form-group">
              <label htmlFor="siteId">현장 선택 *</label>
              <select
                id="siteId"
                name="siteId"
                value={formData.siteId}
                onChange={handleChange}
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

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="workerName">성명 *</label>
                <input
                  type="text"
                  id="workerName"
                  name="workerName"
                  value={formData.workerName}
                  onChange={handleChange}
                  placeholder="홍길동"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="phone">연락처 *</label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="010-1234-5678"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="location">위험 발생 위치 *</label>
              <input
                type="text"
                id="location"
                name="location"
                value={formData.location}
                onChange={handleChange}
                placeholder="예: 3동 5층, A구역 비계작업장"
                required
              />
            </div>
          </div>

          <div className="form-section">
            <h3>위험 상황</h3>
            
            <div className="form-group">
              <label htmlFor="dangerType">위험 유형 *</label>
              <select
                id="dangerType"
                name="dangerType"
                value={formData.dangerType}
                onChange={handleChange}
                required
              >
                <option value="추락">추락 위험</option>
                <option value="낙하비래">낙하/비래 위험</option>
                <option value="전도">전도 위험</option>
                <option value="협착">협착 위험</option>
                <option value="전기">전기 위험</option>
                <option value="화재폭발">화재/폭발 위험</option>
                <option value="기타">기타</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="description">상황 설명 *</label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="위험 상황을 자세히 설명해주세요&#10;&#10;예시:&#10;- 비계 연결부가 풀려있음&#10;- 안전난간이 설치되지 않음&#10;- 전선이 노출되어 있음"
                rows={8}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="images">위험 상황 사진 (선택, 최대 5개)</label>
              <div className="image-upload-container">
                <label htmlFor="imageInput" className="image-upload-button">
                  <span className="upload-icon">📷</span>
                  <span>사진 추가하기</span>
                  <span className="upload-hint">JPG, PNG (최대 5MB)</span>
                </label>
                <input
                  type="file"
                  id="imageInput"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  style={{ display: 'none' }}
                  disabled={uploading || images.length >= 5}
                />
                {uploading && <div className="uploading-text">업로드 중...</div>}
              </div>

              {images.length > 0 && (
                <div className="image-preview-grid">
                  {images.map((img, index) => (
                    <div key={index} className="image-preview-item">
                      <img src={img} alt={`위험 상황 ${index + 1}`} />
                      <button
                        type="button"
                        className="image-remove-button"
                        onClick={() => removeImage(index)}
                        title="삭제"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="confirm-section">
            <label className="confirm-checkbox">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>
                위 내용이 사실이며, 작업중지권 행사에 동의합니다.
                신고 내용이 허위일 경우 관련 법령에 따라 처벌받을 수 있음을 인지하였습니다.
              </span>
            </label>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => onNavigate('home')}>
              취소
            </button>
            <button type="submit" className="btn btn-danger" disabled={!confirmed || uploading}>
              즉시 신고하기
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default WorkStopPage;
