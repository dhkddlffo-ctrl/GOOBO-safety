import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Site, SiteDocument, DocumentCategory } from '../types';
import { getSites } from '../utils/storage';
import { isAuthenticated } from '../utils/auth';
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
  getTotalUsage,
  getStorageQuota,
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE,
} from '../utils/documentStorage';
import './SiteDocumentPage.css';

interface SiteDocumentPageProps {
  onNavigate: (page: string, siteId?: number) => void;
  preselectedSiteId?: number;
}

const CATEGORIES: DocumentCategory[] = [
  '도면',
  '계약서',
  '안전점검표',
  '시공보고서',
  '사진대지',
  '기타',
];

const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const SiteDocumentPage: React.FC<SiteDocumentPageProps> = ({ onNavigate, preselectedSiteId }) => {
  const [sites, setSites] = useState<Site[]>([]);
  const [documents, setDocuments] = useState<SiteDocument[]>([]);
  const [canManage, setCanManage] = useState(false);

  // 업로드 모달
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadForm, setUploadForm] = useState({
    siteId: preselectedSiteId || 0,
    category: '도면' as DocumentCategory,
    version: 'v1.0',
    uploadedBy: '',
    description: '',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docTitle, setDocTitle] = useState('');

  // 필터 / 검색
  const [filterSiteId, setFilterSiteId] = useState<number>(0);
  const [filterCategory, setFilterCategory] = useState<string>('전체');
  const [searchTerm, setSearchTerm] = useState('');

  // 미리보기
  const [previewDoc, setPreviewDoc] = useState<SiteDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);

  // 용량
  const [quota, setQuota] = useState<{ usage: number; quota: number } | null>(null);

  useEffect(() => {
    const savedSites = getSites();
    setSites(savedSites.filter(s => s.status === 'active'));
    setDocuments(getDocuments());
    setCanManage(isAuthenticated());
    getStorageQuota().then(setQuota);
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const refresh = () => {
    setDocuments(getDocuments());
  };

  /* ------------------------------ 필터링 ------------------------------ */
  const filteredDocs = useMemo(() => {
    return documents.filter(doc => {
      if (filterSiteId && doc.siteId !== filterSiteId) return false;
      if (filterCategory !== '전체' && doc.category !== filterCategory) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        return (
          doc.title.toLowerCase().includes(q) ||
          doc.fileName.toLowerCase().includes(q) ||
          doc.siteName.toLowerCase().includes(q) ||
          (doc.description || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [documents, filterSiteId, filterCategory, searchTerm]);

  const totalSize = getTotalUsage(documents);

  const stats = useMemo(() => {
    return {
      total: documents.length,
      siteCount: new Set(documents.map(d => d.siteId)).size,
      thisMonth: documents.filter(d => {
        const d1 = new Date(d.createdAt);
        const now = new Date();
        return d1.getMonth() === now.getMonth() && d1.getFullYear() === now.getFullYear();
      }).length,
    };
  }, [documents]);

  /* ------------------------------ 파일 선택 ------------------------------ */
  const acceptFile = (file: File) => {
    if (!isAllowedFile(file.name)) {
      alert(
        `지원하지 않는 파일 형식입니다.\n허용 형식: ${ALLOWED_EXTENSIONS.join(', ')}`
      );
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      alert(
        `파일이 너무 큽니다. (${formatFileSize(file.size)})\n최대 ${formatFileSize(MAX_FILE_SIZE)}까지 업로드할 수 있습니다.`
      );
      return;
    }
    setSelectedFile(file);
    if (!docTitle) {
      setDocTitle(file.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) acceptFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) acceptFile(file);
  };

  /* ------------------------------ 업로드 ------------------------------ */
  const resetUploadForm = () => {
    setSelectedFile(null);
    setDocTitle('');
    setUploadForm({
      siteId: preselectedSiteId || 0,
      category: '도면',
      version: 'v1.0',
      uploadedBy: '',
      description: '',
    });
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!uploadForm.siteId) {
      alert('현장을 선택해주세요.');
      return;
    }
    if (!selectedFile) {
      alert('업로드할 파일을 선택해주세요.');
      return;
    }
    if (!docTitle.trim()) {
      alert('문서명을 입력해주세요.');
      return;
    }

    const site = sites.find(s => s.id === uploadForm.siteId);
    if (!site) return;

    setUploading(true);
    try {
      const storageKey = generateStorageKey(selectedFile.name);
      await putFile(storageKey, selectedFile);

      const doc: SiteDocument = {
        id: generateDocId(),
        siteId: site.id,
        siteName: site.name,
        title: docTitle.trim(),
        category: uploadForm.category,
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        fileType: selectedFile.type || getExtension(selectedFile.name),
        version: uploadForm.version.trim() || 'v1.0',
        uploadedBy: uploadForm.uploadedBy.trim() || '익명',
        description: uploadForm.description.trim() || undefined,
        storageKey,
        createdAt: new Date().toISOString(),
      };

      saveDocument(doc);
      refresh();
      getStorageQuota().then(setQuota);
      setShowUpload(false);
      resetUploadForm();
      alert('문서가 등록되었습니다.');
    } catch (error) {
      console.error('업로드 실패:', error);
      alert('문서 업로드에 실패했습니다. 저장 공간을 확인해주세요.');
    } finally {
      setUploading(false);
    }
  };

  /* ------------------------------ 다운로드 ------------------------------ */
  const handleDownload = async (doc: SiteDocument) => {
    try {
      const blob = await getFile(doc.storageKey);
      if (!blob) {
        alert('파일을 찾을 수 없습니다. 다시 업로드해주세요.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error('다운로드 실패:', error);
      alert('다운로드에 실패했습니다.');
    }
  };

  /* ------------------------------ 미리보기 ------------------------------ */
  const handlePreview = async (doc: SiteDocument) => {
    setPreviewLoading(true);
    setPreviewDoc(doc);
    try {
      const blob = await getFile(doc.storageKey);
      if (!blob) {
        alert('파일을 찾을 수 없습니다.');
        setPreviewDoc(null);
        return;
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (error) {
      console.error('미리보기 실패:', error);
      alert('미리보기를 불러올 수 없습니다.');
      setPreviewDoc(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    setPreviewDoc(null);
  };

  /* ------------------------------ 삭제 ------------------------------ */
  const handleDelete = async (doc: SiteDocument) => {
    if (!canManage) {
      alert('문서 삭제는 관리자만 가능합니다.');
      return;
    }
    if (!confirm(`"${doc.title}" 문서를 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.`)) {
      return;
    }
    await deleteDocument(doc.id);
    refresh();
    getStorageQuota().then(setQuota);
  };

  /* ------------------------------ 렌더링 ------------------------------ */
  return (
    <div className="site-document-page">
      <div className="container">
        <div className="page-header">
          <button className="back-button" onClick={() => onNavigate('home')}>
            ← 뒤로가기
          </button>
          <h1>현장문서</h1>
          <p>현장별 도면·계약서·안전점검표 등 각종 문서를 등록하고 조회합니다.</p>
        </div>

        {/* 통계 */}
        <div className="doc-stats">
          <div className="stat-card">
            <span className="stat-icon">📁</span>
            <div>
              <div className="stat-value">{stats.total}</div>
              <div className="stat-label">전체 문서</div>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon">🏗️</span>
            <div>
              <div className="stat-value">{stats.siteCount}</div>
              <div className="stat-label">등록 현장</div>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon">🆕</span>
            <div>
              <div className="stat-value">{stats.thisMonth}</div>
              <div className="stat-label">이번 달 등록</div>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon">💾</span>
            <div>
              <div className="stat-value">{formatFileSize(totalSize)}</div>
              <div className="stat-label">사용 용량</div>
            </div>
          </div>
        </div>

        {quota && quota.quota > 0 && (
          <div className="quota-bar-wrap">
            <div className="quota-bar-head">
              <span>브라우저 저장 공간</span>
              <span>
                {formatFileSize(quota.usage)} / {formatFileSize(quota.quota)}
              </span>
            </div>
            <div className="quota-bar">
              <div
                className="quota-bar-fill"
                style={{ width: `${Math.min((quota.usage / quota.quota) * 100, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* 툴바 */}
        <div className="doc-toolbar">
          <div className="doc-filters">
            <select
              className="doc-select"
              value={filterSiteId}
              onChange={e => setFilterSiteId(Number(e.target.value))}
            >
              <option value={0}>전체 현장</option>
              {sites.map(site => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>

            <select
              className="doc-select"
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
            >
              <option value="전체">전체 분류</option>
              {CATEGORIES.map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <input
              className="doc-search"
              type="text"
              placeholder="🔍 문서명 / 파일명 / 현장명 검색"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <button className="btn btn-primary doc-upload-btn" onClick={() => setShowUpload(true)}>
            ＋ 문서 등록
          </button>
        </div>

        {/* 문서 목록 */}
        {filteredDocs.length === 0 ? (
          <div className="doc-empty">
            <div className="doc-empty-icon">📂</div>
            <h3>
              {documents.length === 0 ? '등록된 문서가 없습니다' : '조건에 맞는 문서가 없습니다'}
            </h3>
            <p>
              {documents.length === 0
                ? '현장 도면, 계약서, 안전점검표 등을 등록해보세요.'
                : '필터나 검색어를 변경해보세요.'}
            </p>
            {documents.length === 0 && (
              <button className="btn btn-primary" onClick={() => setShowUpload(true)}>
                첫 문서 등록하기
              </button>
            )}
          </div>
        ) : (
          <div className="doc-list">
            {filteredDocs.map(doc => {
              const meta = getFileMeta(doc.fileName);
              return (
                <div key={doc.id} className="doc-card">
                  <div className="doc-file-icon" style={{ color: meta.color }}>
                    <span className="doc-file-emoji">{meta.icon}</span>
                    <span className="doc-file-ext" style={{ background: meta.color }}>
                      {meta.label}
                    </span>
                  </div>

                  <div className="doc-main">
                    <div className="doc-title-row">
                      <h3 className="doc-title">{doc.title}</h3>
                      <span className="doc-category-badge">{doc.category}</span>
                      <span className="doc-version">{doc.version}</span>
                    </div>

                    <div className="doc-meta-row">
                      <span>🏗️ {doc.siteName}</span>
                      <span>📎 {doc.fileName}</span>
                      <span>💾 {formatFileSize(doc.fileSize)}</span>
                      <span>✍️ {doc.uploadedBy}</span>
                      <span>🗓️ {formatDateTime(doc.createdAt)}</span>
                    </div>

                    {doc.description && <p className="doc-desc">{doc.description}</p>}
                  </div>

                  <div className="doc-actions">
                    {isPreviewable(doc.fileName) && (
                      <button
                        className="doc-action-btn"
                        title="미리보기"
                        onClick={() => handlePreview(doc)}
                      >
                        👁️
                      </button>
                    )}
                    <button
                      className="doc-action-btn"
                      title="다운로드"
                      onClick={() => handleDownload(doc)}
                    >
                      ⬇️
                    </button>
                    {canManage && (
                      <button
                        className="doc-action-btn doc-action-delete"
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

        <div className="info-box">
          <h4>📌 안내사항</h4>
          <ul>
            <li>허용 형식: {ALLOWED_EXTENSIONS.join(', ')}</li>
            <li>파일당 최대 {formatFileSize(MAX_FILE_SIZE)}까지 등록할 수 있습니다.</li>
            <li>문서는 이 브라우저에 저장됩니다. 다른 기기에서는 조회되지 않습니다.</li>
            <li>문서 삭제는 관리자 로그인 후 가능합니다.</li>
          </ul>
        </div>
      </div>

      {/* 업로드 모달 */}
      {showUpload && (
        <div className="modal-backdrop" onClick={() => !uploading && setShowUpload(false)}>
          <div className="modal-panel" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>문서 등록</h2>
              <button className="modal-close" onClick={() => !uploading && setShowUpload(false)}>
                ✕
              </button>
            </div>

            <form className="modal-body" onSubmit={handleUpload}>
              <div className="form-group">
                <label htmlFor="docSite">현장 선택 *</label>
                <select
                  id="docSite"
                  value={uploadForm.siteId}
                  onChange={e => setUploadForm(f => ({ ...f, siteId: Number(e.target.value) }))}
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
                  <label htmlFor="docCategory">문서 분류 *</label>
                  <select
                    id="docCategory"
                    value={uploadForm.category}
                    onChange={e =>
                      setUploadForm(f => ({ ...f, category: e.target.value as DocumentCategory }))
                    }
                  >
                    {CATEGORIES.map(c => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="docVersion">버전</label>
                  <input
                    id="docVersion"
                    type="text"
                    value={uploadForm.version}
                    onChange={e => setUploadForm(f => ({ ...f, version: e.target.value }))}
                    placeholder="예: v1.0"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="docTitleInput">문서명 *</label>
                <input
                  id="docTitleInput"
                  type="text"
                  value={docTitle}
                  onChange={e => setDocTitle(e.target.value)}
                  placeholder="예: A동 구조도면 (지하 2층)"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="docUploader">등록자</label>
                <input
                  id="docUploader"
                  type="text"
                  value={uploadForm.uploadedBy}
                  onChange={e => setUploadForm(f => ({ ...f, uploadedBy: e.target.value }))}
                  placeholder="예: 김현장 (미입력 시 익명)"
                />
              </div>

              <div className="form-group">
                <label>파일 선택 *</label>
                <div
                  className={`drop-zone ${dragOver ? 'drag-over' : ''} ${
                    selectedFile ? 'has-file' : ''
                  }`}
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
                      <span className="drop-icon">{getFileMeta(selectedFile.name).icon}</span>
                      <strong className="drop-filename">{selectedFile.name}</strong>
                      <span className="drop-hint">
                        {formatFileSize(selectedFile.size)} · 클릭하여 변경
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="drop-icon">📤</span>
                      <strong>파일을 끌어다 놓거나 클릭하세요</strong>
                      <span className="drop-hint">
                        {ALLOWED_EXTENSIONS.join(', ')} · 최대 {formatFileSize(MAX_FILE_SIZE)}
                      </span>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="docDesc">설명 (선택)</label>
                <textarea
                  id="docDesc"
                  rows={3}
                  value={uploadForm.description}
                  onChange={e => setUploadForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="문서에 대한 간단한 설명을 입력하세요"
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowUpload(false)}
                  disabled={uploading}
                >
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

      {/* 미리보기 모달 */}
      {previewDoc && (
        <div className="modal-backdrop" onClick={closePreview}>
          <div className="preview-panel" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{previewDoc.title}</h2>
              <button className="modal-close" onClick={closePreview}>
                ✕
              </button>
            </div>
            <div className="preview-body">
              {previewLoading ? (
                <div className="preview-loading">불러오는 중...</div>
              ) : getExtension(previewDoc.fileName) === 'pdf' ? (
                <iframe src={previewUrl} title={previewDoc.title} className="preview-pdf" />
              ) : (
                <img src={previewUrl} alt={previewDoc.title} className="preview-img" />
              )}
            </div>
            <div className="preview-foot">
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

export default SiteDocumentPage;
