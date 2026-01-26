import React, { useState } from 'react';
import { sites } from '../data/sites';
import { Suggestion } from '../types';
import { saveSuggestion, generateId } from '../utils/storage';
import './SuggestionPage.css';

interface SuggestionPageProps {
  onNavigate: (page: string) => void;
  preselectedSiteId?: number;
}

const SuggestionPage: React.FC<SuggestionPageProps> = ({ onNavigate, preselectedSiteId }) => {
  const [formData, setFormData] = useState({
    siteId: preselectedSiteId || 0,
    workerName: '',
    phone: '',
    category: '안전' as '안전' | '환경' | '작업조건' | '기타',
    title: '',
    content: '',
  });

  const [submitted, setSubmitted] = useState(false);

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
      workerName: formData.workerName,
      phone: formData.phone,
      category: formData.category,
      title: formData.title,
      content: formData.content,
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
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => onNavigate('home')}>
              취소
            </button>
            <button type="submit" className="btn btn-primary">
              제출하기
            </button>
          </div>
        </form>

        <div className="info-box">
          <h4>📌 안내사항</h4>
          <ul>
            <li>제출된 건의사항은 안전관리팀에서 검토 후 답변 드립니다.</li>
            <li>긴급한 안전 문제는 작업중지권을 행사해주세요.</li>
            <li>개인정보는 건의사항 처리 목적으로만 사용됩니다.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default SuggestionPage;
