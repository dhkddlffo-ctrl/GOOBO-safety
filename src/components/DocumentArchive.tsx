import React, { useState, useEffect, useMemo, useRef } from 'react';
import { SiteDocument, CategoryMeta } from '../types';
import { isAuthenticated } from '../utils/auth';
import { useCategories } from '../hooks/useCategories';
import { resolveCategoryMeta, getCategoriesWithOrphans, getSubcategories, FALLBACK_CATEGORY } from '../utils/categoryStorage';
import CategoryManager from './CategoryManager';
import {
  getDocuments,
  saveDocument,
  deleteDocument,
  putFile,
  getFile,
  generateDocId,
  generateStorageKey,
  formatFileSize,
  getFileMeta,
  isAllowedFile,
  isPreviewable,
  getExtension,
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE,
} from '../utils/documentStorage';
import './DocumentArchive.css';

interface DocumentArchiveProps {
  siteId: number;
  siteName: string;
}

const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * 현장 문서보관함
 * - 안전보건관리대장 / 안전계획서 / 안전관리비 / 교육일지 등 분류별 보관
 * - 분류는 관리자가 직접 추가·수정·삭제할 수 있습니다.
 */
const DocumentArchive: React.FC<DocumentArchiveProps> = ({ siteId, siteName }) => {
  const categories = useCategories();
  const [docs, setDocs] = useState<SiteDocument[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('전체');
  const [activeSub, setActiveSub] = useState<string>('전체');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCategoryManager, setShowCategoryManager] = useState(false);

  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docTitle, setDocTitle] = useState('');
  const [uploadForm, setUploadForm] = useState({
    category: '',
    subcategory: '',
    period: '',
    version: 'v1.0',
    uploadedBy: '',
    description: '',
  });

  const [previewDoc, setPreviewDoc] = useState<SiteDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    setCanManage(isAuthenticated());
    refresh();
  }, [siteId]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const refresh = () => {
    setDocs(getDocuments().filter(d => d.siteId === siteId));
  };

  const filtered = useMemo(() => {
    return docs.filter(d => {
      if (activeCategory !== '전체' && d.category !== activeCategory) return false;
      if (activeSub !== '전체' && d.subcategory !== activeSub) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        return (
          d.title.toLowerCase().includes(q) ||
          d.fileName.toLowerCase().includes(q) ||
          (d.description || '').toLowerCase().includes(q) ||
          (d.period || '').toLowerCase().includes(q) ||
          (d.subcategory || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [docs, activeCategory, activeSub, searchTerm]);

  const countByCategory = (key: string) =>
    docs.filter(d => d.category === key).length;

  /** 현재 선택된 분류의 소분류 목록 */
  const currentSubs = useMemo(
    () => (activeCategory === '전체' ? [] : getSubcategories(activeCategory)),
    [activeCategory, categories]
  );

  /** 분류 변경 시 소분류 필터 초기화 */
  const selectCategory = (key: string) => {
    setActiveCategory(key);
    setActiveSub('전체');
  };

  /** 목록 + 기존 문서에만 남아있는 분류까지 합쳐서 표시 */
  const visibleCategories: CategoryMeta[] = useMemo(
    () => getCategoriesWithOrphans(docs.map(d => d.category)),
    [categories, docs]
  );

  const defaultCategory = categories[0]?.key || FALLBACK_CATEGORY;

  const totalSize = docs.reduce((s, d) => s + d.fileSize, 0);

  /* ---------------- 파일 선택 ---------------- */
  const acceptFile = (file: File) => {
    if (!isAllowedFile(file.name)) {
      alert(`지원하지 않는 형식입니다.\n허용: ${ALLOWED_EXTENSIONS.join(', ')}`);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      alert(
        `파일이 너무 큽니다 (${formatFileSize(file.size)}).\n최대 ${formatFileSize(MAX_FILE_SIZE)}까지 가능합니다.`
      );
      return;
    }
    setSelectedFile(file);
    if (!docTitle) setDocTitle(file.name.replace(/\.[^/.]+$/, ''));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) acceptFile(file);
  };

  /* ---------------- 업로드 ---------------- */
  const openUpload = (category?: string) => {
    const nextCategory = category || (activeCategory !== '전체' ? activeCategory : defaultCategory);
    const subs = getSubcategories(nextCategory);
    setUploadForm(f => ({
      ...f,
      category: nextCategory,
      subcategory: activeSub !== '전체' && subs.includes(activeSub) ? activeSub : '',
    }));
    setShowUpload(true);
  };

  const resetUploadForm = () => {
    setSelectedFile(null);
    setDocTitle('');
    setUploadForm({
      category: defaultCategory,
      subcategory: '',
      period: '',
      version: 'v1.0',
      uploadedBy: '',
      description: '',
    });
  };

  const closeUpload = () => {
    if (uploading) return;
    setShowUpload(false);
    resetUploadForm();
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return alert('업로드할 파일을 선택해주세요.');
    if (!docTitle.trim()) return alert('문서명을 입력해주세요.');

    setUploading(true);
    try {
      const storageKey = generateStorageKey(selectedFile.name);
      await putFile(storageKey, selectedFile);

      saveDocument({
        id: generateDocId(),
        siteId,
        siteName,
        title: docTitle.trim(),
        category: uploadForm.category,
        subcategory: uploadForm.subcategory || undefined,
        period: uploadForm.period.trim() || undefined,
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        fileType: selectedFile.type || getExtension(selectedFile.name),
        version: uploadForm.version.trim() || 'v1.0',
        uploadedBy: uploadForm.uploadedBy.trim() || '익명',
        description: uploadForm.description.trim() || undefined,
        storageKey,
        createdAt: new Date().toISOString(),
      });

      refresh();
      setShowUpload(false);
      setSelectedFile(null);
      setDocTitle('');
      setUploadForm({
        category: defaultCategory,
        subcategory: '',
        period: '',
        version: 'v1.0',
        uploadedBy: '',
        description: '',
      });
    } catch (error) {
      console.error('업로드 실패:', error);
      alert('업로드에 실패했습니다. 저장 공간을 확인해주세요.');
    } finally {
      setUploading(false);
    }
  };

  /* ---------------- 다운로드 / 미리보기 / 삭제 ---------------- */
  const handleDownload = async (doc: SiteDocument) => {
    const blob = await getFile(doc.storageKey);
    if (!blob) return alert('파일을 찾을 수 없습니다.');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handlePreview = async (doc: SiteDocument) => {
    setPreviewDoc(doc);
    setPreviewLoading(true);
    try {
      const blob = await getFile(doc.storageKey);
      if (!blob) {
        alert('파일을 찾을 수 없습니다.');
        setPreviewDoc(null);
        return;
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    setPreviewDoc(null);
  };

  const handleDelete = async (doc: SiteDocument) => {
    if (!canManage) return alert('문서 삭제는 관리자만 가능합니다.');
    if (!confirm(`"${doc.title}" 문서를 삭제하시겠습니까?`)) return;
    await deleteDocument(doc.id);
    refresh();
  };

  /* ---------------- 렌더 ---------------- */
  return (
    <div className="da-wrap">
      {/* 분류 카드 */}
      <div className="da-category-grid">
        <button
          className={`da-category-card ${activeCategory === '전체' ? 'active' : ''}`}
          onClick={() => setActiveCategory('전체')}
        >
          <span className="da-cat-icon">🗂️</span>
          <div className="da-cat-body">
            <div className="da-cat-name">전체 문서</div>
            <div className="da-cat-desc">
              {docs.length}건 · {formatFileSize(totalSize)}
            </div>
          </div>
        </button>

        {visibleCategories.map(meta => (
          <button
            key={meta.key}
            className={`da-category-card ${activeCategory === meta.key ? 'active' : ''}`}
            onClick={() => selectCategory(meta.key)}
          >
            <span className="da-cat-icon" style={{ background: `${meta.color}1a`, color: meta.color }}>
              {meta.icon}
            </span>
            <div className="da-cat-body">
              <div className="da-cat-name">
                {meta.key}
                <span className="da-cat-count">{countByCategory(meta.key)}</span>
              </div>
              <div className="da-cat-desc">
                {meta.subs && meta.subs.length > 0
                  ? `${meta.subs.length}개 소분류`
                  : meta.desc}
              </div>
            </div>
          </button>
        ))}

        {/* 분류 관리 */}
        <button
          className="da-category-card da-category-manage"
          onClick={() => setShowCategoryManager(true)}
          title="문서 분류 추가·수정·삭제"
        >
          <span className="da-cat-icon da-cat-manage-icon">⚙️</span>
          <div className="da-cat-body">
            <div className="da-cat-name">분류 관리</div>
            <div className="da-cat-desc">분류 추가 · 수정 · 삭제</div>
          </div>
        </button>
      </div>

      {/* 툴바 */}
      <div className="da-toolbar">
        <div className="da-toolbar-left">
          <strong className="da-active-label">
            {activeCategory === '전체' ? '전체 문서' : activeCategory}
          </strong>
          <span className="da-count">{filtered.length}건</span>
          <input
            className="da-search"
            type="text"
            placeholder="🔍 문서명 / 파일명 / 기간 검색"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" onClick={() => openUpload()}>
          ＋ 문서 등록
        </button>
      </div>

      {/* 소분류 필터 (선택한 분류에 소분류가 있을 때만 표시) */}
      {currentSubs.length > 0 && (
        <div className="da-subbar">
          <span className="da-subbar-label">소분류</span>
          <button
            className={`da-subchip ${activeSub === '전체' ? 'active' : ''}`}
            onClick={() => setActiveSub('전체')}
          >
            전체
            <span className="da-subchip-count">
              {docs.filter(d => d.category === activeCategory).length}
            </span>
          </button>
          {currentSubs.map(sub => (
            <button
              key={sub}
              className={`da-subchip ${activeSub === sub ? 'active' : ''}`}
              onClick={() => setActiveSub(sub)}
            >
              {sub}
              <span className="da-subchip-count">
                {docs.filter(d => d.category === activeCategory && d.subcategory === sub).length}
              </span>
            </button>
          ))}
          <button
            className="da-subbar-manage"
            onClick={() => setShowCategoryManager(true)}
            title="소분류 추가·수정·삭제"
          >
            ⚙️ 소분류 관리
          </button>
        </div>
      )}

      {/* 목록 */}
      {filtered.length === 0 ? (
        <div className="da-empty">
          <div className="da-empty-icon">📂</div>
          <h4>
            {docs.length === 0
              ? '등록된 문서가 없습니다'
              : '조건에 맞는 문서가 없습니다'}
          </h4>
          <p>
            {docs.length === 0
              ? '안전보건관리대장, 안전계획서, 안전관리비, 교육일지 등을 등록해보세요.'
              : '분류나 검색어를 변경해보세요.'}
          </p>
          {docs.length === 0 && (
            <button className="btn btn-primary" onClick={() => openUpload()}>
              첫 문서 등록하기
            </button>
          )}
        </div>
      ) : (
        <div className="da-list">
          {filtered.map(doc => {
            const fmeta = getFileMeta(doc.fileName);
            const cmeta = resolveCategoryMeta(doc.category);
            return (
              <div key={doc.id} className="da-item">
                <div className="da-file-icon" style={{ color: fmeta.color }}>
                  <span>{fmeta.icon}</span>
                  <span className="da-file-ext" style={{ background: fmeta.color }}>
                    {fmeta.label}
                  </span>
                </div>

                <div className="da-item-main">
                  <div className="da-item-title-row">
                    <h4>{doc.title}</h4>
                    <span
                      className="da-badge"
                      style={{ background: `${cmeta.color}1a`, color: cmeta.color }}
                    >
                      {doc.category}
                    </span>
                    {doc.subcategory && (
                      <span className="da-badge da-badge-sub">{doc.subcategory}</span>
                    )}
                    {doc.period && <span className="da-period">{doc.period}</span>}
                    <span className="da-version">{doc.version}</span>
                  </div>
                  <div className="da-item-meta">
                    <span>📎 {doc.fileName}</span>
                    <span>💾 {formatFileSize(doc.fileSize)}</span>
                    <span>✍️ {doc.uploadedBy}</span>
                    <span>🗓️ {formatDateTime(doc.createdAt)}</span>
                  </div>
                  {doc.description && <p className="da-item-desc">{doc.description}</p>}
                </div>

                <div className="da-item-actions">
                  {isPreviewable(doc.fileName) && (
                    <button className="da-btn" title="미리보기" onClick={() => handlePreview(doc)}>
                      👁️
                    </button>
                  )}
                  <button className="da-btn" title="다운로드" onClick={() => handleDownload(doc)}>
                    ⬇️
                  </button>
                  {canManage && (
                    <button
                      className="da-btn da-btn-danger"
                      title="삭제"
                      onClick={() => handleDelete(doc)}
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 업로드 모달 */}
      {showUpload && (
        <div className="da-modal-backdrop" onClick={closeUpload}>
          <div className="da-modal" onClick={e => e.stopPropagation()}>
            <div className="da-modal-head">
              <h3>문서 등록 · {siteName}</h3>
              <button className="da-modal-close" onClick={closeUpload}>
                ✕
              </button>
            </div>

            <form className="da-modal-body" onSubmit={handleUpload}>
              <div className="da-field">
                <label htmlFor="daCategory">문서 분류 *</label>
                <select
                  id="daCategory"
                  value={uploadForm.category}
                  onChange={e => {
                    const nextCategory = e.target.value;
                    const subs = getSubcategories(nextCategory);
                    setUploadForm(f => ({
                      ...f,
                      category: nextCategory,
                      subcategory: subs.includes(f.subcategory) ? f.subcategory : '',
                    }));
                  }}
                >
                  {visibleCategories.map(m => (
                    <option key={m.key} value={m.key}>
                      {m.icon} {m.key}
                    </option>
                  ))}
                </select>
              </div>

              {getSubcategories(uploadForm.category).length > 0 && (
                <div className="da-field">
                  <label htmlFor="daSubcategory">소분류</label>
                  <select
                    id="daSubcategory"
                    value={uploadForm.subcategory}
                    onChange={e => setUploadForm(f => ({ ...f, subcategory: e.target.value }))}
                  >
                    <option value="">선택 안 함</option>
                    {getSubcategories(uploadForm.category).map(sub => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="da-field">
                <label htmlFor="daTitle">문서명 *</label>
                <input
                  id="daTitle"
                  type="text"
                  value={docTitle}
                  onChange={e => setDocTitle(e.target.value)}
                  placeholder="예: 2026년 11월 안전보건관리대장"
                  required
                />
              </div>

              <div className="da-row">
                <div className="da-field">
                  <label htmlFor="daPeriod">해당 기간</label>
                  <input
                    id="daPeriod"
                    type="text"
                    value={uploadForm.period}
                    onChange={e => setUploadForm(f => ({ ...f, period: e.target.value }))}
                    placeholder="예: 2026-11 / 2026 1분기"
                  />
                </div>
                <div className="da-field">
                  <label htmlFor="daVersion">버전</label>
                  <input
                    id="daVersion"
                    type="text"
                    value={uploadForm.version}
                    onChange={e => setUploadForm(f => ({ ...f, version: e.target.value }))}
                    placeholder="예: v1.0"
                  />
                </div>
              </div>

              <div className="da-field">
                <label htmlFor="daUploader">등록자</label>
                <input
                  id="daUploader"
                  type="text"
                  value={uploadForm.uploadedBy}
                  onChange={e => setUploadForm(f => ({ ...f, uploadedBy: e.target.value }))}
                  placeholder="예: 김안전 (미입력 시 익명)"
                />
              </div>

              <div className="da-field">
                <label>파일 *</label>
                <div
                  className={`da-drop ${dragOver ? 'drag-over' : ''} ${selectedFile ? 'has-file' : ''}`}
                  onDragOver={e => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {selectedFile ? (
                    <>
                      <span className="da-drop-icon">{getFileMeta(selectedFile.name).icon}</span>
                      <strong>{selectedFile.name}</strong>
                      <span className="da-drop-hint">
                        {formatFileSize(selectedFile.size)} · 클릭하여 변경
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="da-drop-icon">📤</span>
                      <strong>파일을 끌어다 놓거나 클릭하세요</strong>
                      <span className="da-drop-hint">
                        {ALLOWED_EXTENSIONS.join(', ')} · 최대 {formatFileSize(MAX_FILE_SIZE)}
                      </span>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    style={{ display: 'none' }}
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) acceptFile(f);
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>

              <div className="da-field">
                <label htmlFor="daDesc">설명 (선택)</label>
                <textarea
                  id="daDesc"
                  rows={3}
                  value={uploadForm.description}
                  onChange={e => setUploadForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="문서에 대한 설명"
                />
              </div>

              <div className="da-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeUpload} disabled={uploading}>
                  취소
                </button>
                <button type="submit" className="btn btn-primary" disabled={uploading}>
                  {uploading ? '등록 중...' : '등록하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 분류 관리 모달 */}
      {showCategoryManager && (
        <CategoryManager categories={categories} onClose={() => setShowCategoryManager(false)} />
      )}

      {/* 미리보기 모달 */}
      {previewDoc && (
        <div className="da-modal-backdrop" onClick={closePreview}>
          <div className="da-preview" onClick={e => e.stopPropagation()}>
            <div className="da-modal-head">
              <h3>{previewDoc.title}</h3>
              <button className="da-modal-close" onClick={closePreview}>
                ✕
              </button>
            </div>
            <div className="da-preview-body">
              {previewLoading ? (
                <div className="da-preview-loading">불러오는 중...</div>
              ) : getExtension(previewDoc.fileName) === 'pdf' ? (
                <iframe src={previewUrl} title={previewDoc.title} className="da-preview-pdf" />
              ) : (
                <img src={previewUrl} alt={previewDoc.title} className="da-preview-img" />
              )}
            </div>
            <div className="da-preview-foot">
              <span>
                {previewDoc.fileName} · {formatFileSize(previewDoc.fileSize)}
              </span>
              <button className="btn btn-primary" onClick={() => handleDownload(previewDoc)}>
                ⬇️ 다운로드
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentArchive;
