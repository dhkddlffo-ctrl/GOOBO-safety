import React, { useState, useEffect } from 'react';
import { getSites } from '../utils/storage';
import { Suggestion, Site } from '../types';
import { saveSuggestion, generateId } from '../utils/storage';
import './SuggestionPage.css';

interface SuggestionPageProps {
  onNavigate: (page: string) => void;
  preselectedSiteId?: number;
}

const SuggestionPage: React.FC<SuggestionPageProps> = ({ onNavigate, preselectedSiteId }) => {
  const [sites, setSites] = useState<Site[]>([]);
  const [formData, setFormData] = useState({
    siteId: preselectedSiteId || 0,
    workerName: '',
    phone: '',
    category: '안전' as '안전' | '환경' | '작업조건' | '기타',
    title: '',
    content: '',
  });

  const [images, setImages] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [uploading, setUploading] = useState(false);

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

    if (!formData.siteId) {
      alert('현장을 선택해주세요.');
      return;
    }

    const site = sites.find(s => s.id === formData.siteId);
    if (!site) return;

    const suggestion: Suggestion = {
      id: generateId(),
      siteId: formData.siteId,
      siteName: site.name,
      workerName: formData.workerName || '익명',
      phone: formData.phone || '미제공',
      category: formData.category,
      title: formData.title,
      content: formData.content,
      images: images.length > 0 ? images : undefined,
      status: '접수',
      createdAt: new Date().toISOString(),
    };

    saveSuggestion(suggestion);
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
      <div className="suggestion-page">
        <div className="container">
          <div className="success-message">
            <div className="success-icon">✅</div>
            <h2>건의사항이 접수되었습니다</h2>
            <p>
              소중한 의견 감사합니다.<br />
              검토 후 빠른 시일 내에 답변 드리겠습니다.
            </p>
            <div className="success-actions">
              <button 
                className="btn btn-primary"
                onClick={() => onNavigate('home')}
              >
                홈으로 돌아가기
              </button>
              <button 
                className="btn btn-secondary"
                onClick={() => {
                  setSubmitted(false);
                  setImages([]);
                  setFormData({
                    siteId: preselectedSiteId || 0,
                    workerName: '',
                    phone: '',
                    category: '안전',
                    title: '',
                    content: '',
                  });
                }}
              >
                추가 제출하기
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="suggestion-page">
      <div className="container">
        <div className="page-header">
          <button className="back-button" onClick={() => onNavigate('home')}>
            ← 뒤로가기
          </button>
          <h1>건의사항 제출</h1>
          <p>현장의 개선사항이나 의견을 자유롭게 제출해주세요.</p>
        </div>

        <form className="suggestion-form" onSubmit={handleSubmit}>
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
                <label htmlFor="workerName">성명 (선택)</label>
                <input
                  type="text"
                  id="workerName"
                  name="workerName"
                  value={formData.workerName}
                  onChange={handleChange}
                  placeholder="홍길동 (익명 가능)"
                />
              </div>

              <div className="form-group">
                <label htmlFor="phone">연락처 (선택)</label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="010-1234-5678 (선택)"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="category">분류 *</label>
              <select
                id="category"
                name="category"
                value={formData.category}
                onChange={handleChange}
                required
              >
                <option value="안전">안전</option>
                <option value="환경">환경</option>
                <option value="작업조건">작업조건</option>
                <option value="기타">기타</option>
              </select>
            </div>
          </div>

          <div className="form-section">
            <h3>건의 내용</h3>
            
            <div className="form-group">
              <label htmlFor="title">제목 *</label>
              <input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="건의사항 제목을 입력하세요"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="content">상세 내용 *</label>
              <textarea
                id="content"
                name="content"
                value={formData.content}
                onChange={handleChange}
                placeholder="건의하실 내용을 자세히 작성해주세요"
                rows={8}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="images">사진 첨부 (선택, 최대 5개)</label>
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
                      <img src={img} alt={`미리보기 ${index + 1}`} />
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

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => onNavigate('home')}>
              취소
            </button>
            <button type="submit" className="btn btn-primary" disabled={uploading}>
              제출하기
            </button>
          </div>
        </form>

        <div className="info-box">
          <h4>📌 안내사항</h4>
          <ul>
            <li>제출된 건의사항은 안전관리팀에서 검토 후 답변 드립니다.</li>
            <li>긴급한 안전 문제는 작업중지권을 행사해주세요.</li>
            <li>성명과 연락처는 선택사항입니다. 익명으로 제출 가능합니다.</li>
            <li>답변을 원하시는 경우 연락처를 입력해주세요.</li>
            <li>사진은 최대 5개까지, 각 5MB 이하로 첨부 가능합니다.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default SuggestionPage;
