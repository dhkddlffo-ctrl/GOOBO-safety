import React, { useState, useEffect, useRef } from 'react';
import { SiteSafetyPolicy as SafetyPolicyData } from '../types';
import {
  getSafetyPolicy,
  saveSafetyPolicy,
  koreanOrdinal,
  formatPolicyDate,
} from '../utils/safetyPolicyStorage';
import { putFile, getFile, deleteFile, generateStorageKey } from '../utils/documentStorage';
import { isAuthenticated } from '../utils/auth';
import './SiteSafetyPolicy.css';

interface SiteSafetyPolicyProps {
  siteId: number;
  siteName: string;
  /** 현장 기본정보의 현장소장 성명 (서명 기본값) */
  siteManager?: string;
}

const MAX_SEAL_SIZE = 3 * 1024 * 1024; // 3MB

/**
 * 현장별 현장소장 안전보건 경영방침
 *
 * 회사 서식(표제 박스 + 안전보건 방침 / 목표 / 세부추진계획 + 서명)을
 * 화면에서 그대로 재현하고, 같은 모습으로 A4 1장 인쇄(또는 PDF 저장)합니다.
 */
const SiteSafetyPolicy: React.FC<SiteSafetyPolicyProps> = ({ siteId, siteName, siteManager }) => {
  const [policy, setPolicy] = useState<SafetyPolicyData>(() => getSafetyPolicy(siteId, siteName));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SafetyPolicyData | null>(null);
  const [error, setError] = useState('');
  const [sealUrl, setSealUrl] = useState('');
  const [sealUploading, setSealUploading] = useState(false);
  const sealInputRef = useRef<HTMLInputElement>(null);

  const canManage = isAuthenticated();

  /* 현장 변경 시 다시 읽기 */
  useEffect(() => {
    setPolicy(getSafetyPolicy(siteId, siteName));
    setEditing(false);
    setDraft(null);
    setError('');
  }, [siteId, siteName]);

  /* 도장 이미지 불러오기 */
  useEffect(() => {
    let revoked = '';
    let cancelled = false;

    const load = async () => {
      if (!policy.sealImageKey) {
        setSealUrl('');
        return;
      }
      const blob = await getFile(policy.sealImageKey);
      if (!blob || cancelled) return;
      const url = URL.createObjectURL(blob);
      revoked = url;
      setSealUrl(url);
    };
    load();

    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [policy.sealImageKey]);

  /* ---------------- 편집 ---------------- */
  const startEdit = () => {
    if (!canManage) {
      alert('경영방침 수정은 관리자 로그인 후 가능합니다.');
      return;
    }
    /* 서명 성명이 비어 있으면 현장소장 성명을 기본값으로 채워 둡니다. */
    const base = { ...policy };
    if (!base.signerName && siteManager) base.signerName = siteManager;
    setDraft(base);
    setError('');
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraft(null);
    setEditing(false);
    setError('');
  };

  const saveEdit = () => {
    if (!draft) return;
    if (!draft.statement.trim() && !draft.goal.trim()) {
      setError('안전보건 방침 또는 목표를 입력해주세요.');
      return;
    }
    /* 빈 줄(입력하지 않은 추진계획)은 저장하지 않습니다. */
    const cleaned: SafetyPolicyData = {
      ...draft,
      statement: draft.statement.trim(),
      goal: draft.goal.trim(),
      actionPlans: draft.actionPlans.map(p => p.trim()).filter(Boolean),
    };
    saveSafetyPolicy(cleaned);
    setPolicy(getSafetyPolicy(siteId, siteName));
    setEditing(false);
    setDraft(null);
    setError('');
  };

  const setField = <K extends keyof SafetyPolicyData>(key: K, value: SafetyPolicyData[K]) => {
    setDraft(d => (d ? { ...d, [key]: value } : d));
  };

  /* ---------------- 세부추진계획 ---------------- */
  const setPlan = (index: number, value: string) => {
    setDraft(d => {
      if (!d) return d;
      const next = [...d.actionPlans];
      next[index] = value;
      return { ...d, actionPlans: next };
    });
  };

  const addPlan = () => {
    setDraft(d => (d ? { ...d, actionPlans: [...d.actionPlans, ''] } : d));
  };

  const removePlan = (index: number) => {
    setDraft(d => {
      if (!d) return d;
      return { ...d, actionPlans: d.actionPlans.filter((_, i) => i !== index) };
    });
  };

  const movePlan = (index: number, direction: -1 | 1) => {
    setDraft(d => {
      if (!d) return d;
      const target = index + direction;
      if (target < 0 || target >= d.actionPlans.length) return d;
      const next = [...d.actionPlans];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...d, actionPlans: next };
    });
  };

  /* ---------------- 도장 이미지 ---------------- */
  const handleSealUpload = async (fileList: FileList | null) => {
    const file = fileList && fileList[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('도장·서명은 이미지 파일만 올릴 수 있습니다.');
      return;
    }
    if (file.size > MAX_SEAL_SIZE) {
      setError('도장·서명 이미지는 3MB 이하만 올릴 수 있습니다.');
      return;
    }

    setSealUploading(true);
    setError('');
    try {
      const key = generateStorageKey(file.name || 'seal.png');
      await putFile(key, file);
      /* 편집 중 기존 도장이 있으면 새 파일로 교체합니다. */
      const previous = draft?.sealImageKey;
      if (previous && previous !== key) {
        await deleteFile(previous).catch(() => undefined);
      }
      setDraft(d => (d ? { ...d, sealImageKey: key } : d));
    } catch {
      setError('도장 이미지를 올리지 못했습니다.');
    } finally {
      setSealUploading(false);
    }
  };

  const removeSeal = async () => {
    if (!draft?.sealImageKey) return;
    if (!confirm('등록한 도장·서명 이미지를 삭제하시겠습니까?')) return;
    await deleteFile(draft.sealImageKey).catch(() => undefined);
    setDraft(d => (d ? { ...d, sealImageKey: undefined } : d));
  };

  /* ---------------- 인쇄 ---------------- */
  const handlePrint = () => {
    if (editing) {
      alert('먼저 저장한 뒤 출력해주세요.');
      return;
    }
    window.print();
  };

  /* ---------------- 서식 (조회 화면 · 인쇄 공통) ---------------- */
  const sheet = (data: SafetyPolicyData, seal: string) => {
    const plans = data.actionPlans.filter(p => p.trim());
    return (
      <div className="sp-sheet">
        {/* 표제 박스 */}
        <div className="sp-title-box">
          <h1 className="sp-title">{data.title || '현장소장 안전보건 경영방침'}</h1>
        </div>

        {/* 본문 박스 */}
        <div className="sp-body-box">
          <section className="sp-block">
            <h2 className="sp-h">안전보건 방침</h2>
            <p className="sp-line">- {data.statement || '내용을 입력해주세요.'}</p>
          </section>

          <section className="sp-block">
            <h2 className="sp-h">안전보건 목표</h2>
            <p className="sp-line">- {data.goal || '내용을 입력해주세요.'}</p>
          </section>

          <section className="sp-block sp-block-plan">
            <h2 className="sp-h">세부추진계획</h2>
            {plans.length === 0 ? (
              <p className="sp-line">내용을 입력해주세요.</p>
            ) : (
              plans.map((plan, index) => (
                <p key={index} className="sp-plan">
                  <span className="sp-plan-no">{koreanOrdinal(index)}</span>
                  <span className="sp-plan-colon"> : </span>
                  <span className="sp-plan-text">{plan}</span>
                </p>
              ))
            )}
          </section>

          {/* 서명부 */}
          <div className="sp-sign">
            <span className="sp-sign-date">{formatPolicyDate(data.declaredAt)}</span>
            <span className="sp-sign-role">
              {data.signerTitle || '현장소장'}
              <strong className="sp-sign-name">{data.signerName || ''}</strong>
            </span>
            {seal ? (
              <img className="sp-sign-seal" src={seal} alt="도장" />
            ) : (
              <span className="sp-sign-mark">(인)</span>
            )}
          </div>
        </div>

        {/* 인쇄 시에만 보이는 현장명 (서식 외곽 하단) */}
        <div className="sp-foot">{data.siteName}</div>
      </div>
    );
  };

  /* ---------------- 렌더 ---------------- */
  return (
    <div className="sp-wrap">
      {/* 툴바 (인쇄 시 숨김) */}
      <div className="sp-toolbar">
        <div className="sp-toolbar-info">
          <strong>현장소장 안전보건 경영방침</strong>
          <span className="sp-toolbar-sub">
            {editing ? '문구를 고친 뒤 저장하세요.' : '회사 서식 그대로 A4 1장으로 출력됩니다.'}
          </span>
        </div>
        <div className="sp-toolbar-actions">
          {!editing ? (
            <>
              <button className="btn btn-secondary btn-sm" onClick={startEdit}>
                수정
              </button>
              <button className="btn btn-primary btn-sm" onClick={handlePrint}>
                인쇄 / PDF 저장
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-secondary btn-sm" onClick={cancelEdit}>
                취소
              </button>
              <button className="btn btn-primary btn-sm" onClick={saveEdit}>
                저장
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div className="sp-error">{error}</div>}

      {!editing
        ? sheet(policy, sealUrl)
        : draft && (
            <div className="sp-editor">
              <div className="sp-field">
                <label>표제</label>
                <input
                  type="text"
                  value={draft.title}
                  onChange={e => setField('title', e.target.value)}
                  placeholder="현장소장 안전보건 경영방침"
                />
              </div>

              <div className="sp-field">
                <label>안전보건 방침</label>
                <textarea
                  rows={2}
                  value={draft.statement}
                  onChange={e => setField('statement', e.target.value)}
                  placeholder="예) 적극적인 사고방식으로 전 인원이 참여하는 안전 실현"
                />
              </div>

              <div className="sp-field">
                <label>안전보건 목표</label>
                <textarea
                  rows={2}
                  value={draft.goal}
                  onChange={e => setField('goal', e.target.value)}
                  placeholder="예) 참여하는 안전으로 무재해 현장 달성"
                />
              </div>

              <div className="sp-field">
                <label>세부추진계획</label>
                <div className="sp-plan-editor">
                  {draft.actionPlans.map((plan, index) => (
                    <div key={index} className="sp-plan-row">
                      <span className="sp-plan-row-no">{koreanOrdinal(index)}</span>
                      <input
                        type="text"
                        value={plan}
                        onChange={e => setPlan(index, e.target.value)}
                        placeholder="추진계획을 입력하세요"
                      />
                      <button
                        type="button"
                        className="sp-row-btn"
                        onClick={() => movePlan(index, -1)}
                        disabled={index === 0}
                        title="위로"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="sp-row-btn"
                        onClick={() => movePlan(index, 1)}
                        disabled={index === draft.actionPlans.length - 1}
                        title="아래로"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="sp-row-btn danger"
                        onClick={() => removePlan(index)}
                        title="삭제"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button type="button" className="sp-add-plan" onClick={addPlan}>
                    ＋ 추진계획 추가
                  </button>
                </div>
              </div>

              <div className="sp-field-row">
                <div className="sp-field">
                  <label>시행일</label>
                  <input
                    type="date"
                    value={draft.declaredAt}
                    onChange={e => setField('declaredAt', e.target.value)}
                  />
                </div>
                <div className="sp-field">
                  <label>서명 직책</label>
                  <input
                    type="text"
                    value={draft.signerTitle}
                    onChange={e => setField('signerTitle', e.target.value)}
                    placeholder="현장소장"
                  />
                </div>
                <div className="sp-field">
                  <label>서명 성명</label>
                  <input
                    type="text"
                    value={draft.signerName}
                    onChange={e => setField('signerName', e.target.value)}
                    placeholder="예) 홍길동"
                  />
                </div>
              </div>

              <div className="sp-field">
                <label>
                  도장 · 서명 이미지 <span className="sp-label-opt">(선택)</span>
                </label>
                <div className="sp-seal-row">
                  {draft.sealImageKey ? (
                    <span className="sp-seal-on">도장 이미지 등록됨</span>
                  ) : (
                    <span className="sp-seal-off">등록된 도장 이미지가 없습니다.</span>
                  )}
                  <label className={`sp-seal-add${sealUploading ? ' is-busy' : ''}`}>
                    {sealUploading
                      ? '올리는 중…'
                      : draft.sealImageKey
                        ? '교체'
                        : '＋ 이미지 올리기'}
                    <input
                      ref={sealInputRef}
                      type="file"
                      accept="image/*"
                      disabled={sealUploading}
                      onChange={e => {
                        void handleSealUpload(e.target.files);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {draft.sealImageKey && (
                    <button
                      type="button"
                      className="sp-seal-remove"
                      onClick={() => void removeSeal()}
                    >
                      삭제
                    </button>
                  )}
                </div>
                <p className="sp-hint">
                  이미지를 올리지 않으면 서식에 <strong>(인)</strong> 표기만 남습니다. 도장이 있는
                  경우 스캔·촬영한 이미지를 올려주세요. (3MB 이하)
                </p>
              </div>

              <div className="sp-editor-foot">
                <button className="btn btn-secondary btn-sm" onClick={cancelEdit}>
                  취소
                </button>
                <button className="btn btn-primary btn-sm" onClick={saveEdit}>
                  저장
                </button>
              </div>
            </div>
          )}
    </div>
  );
};

export default SiteSafetyPolicy;
