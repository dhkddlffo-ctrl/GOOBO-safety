import React, { useEffect, useState } from 'react';
import { PhotoSheet, PhotoSheetItem } from '../types';
import { deleteFile, generateStorageKey, getFile, putFile } from '../utils/documentStorage';

interface PhotoSheetFormProps {
  value: PhotoSheet;
  editing: boolean;
  siteName: string;
  onChange: (patch: Partial<PhotoSheet>) => void;
  onItemChange: (id: string, patch: Partial<PhotoSheetItem>) => void;
}

const MAX_PHOTO_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

/**
 * 사진대지 (양식 3·4페이지)
 *
 * 사진 본문은 IndexedDB(documentStorage) 에 저장하고,
 * 화면에서는 objectURL 로 읽어 표시합니다. (LocalStorage 용량 절약)
 *
 *  - meeting    : [KOSAH-MS 관련 위험성평가 회의] — 위아래 2단 (A4 세로)
 *  - monitoring : 모니터링 안전점검 사진대지      — 좌우 2단 (A4 가로)
 */
const PhotoSheetForm: React.FC<PhotoSheetFormProps> = ({
  value,
  editing,
  siteName,
  onChange,
  onItemChange,
}) => {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string>('');
  const [error, setError] = useState('');

  /* storageKey 가 바뀔 때마다 IndexedDB 에서 읽어 objectURL 을 만듭니다. */
  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];

    const run = async () => {
      const next: Record<string, string> = {};
      for (const item of value.items) {
        if (!item.storageKey) continue;
        try {
          const blob = await getFile(item.storageKey);
          if (!blob) continue;
          const url = URL.createObjectURL(blob);
          created.push(url);
          next[item.id] = url;
        } catch {
          /* 읽기 실패한 사진은 표시하지 않습니다. */
        }
      }
      if (cancelled) {
        created.forEach(u => URL.revokeObjectURL(u));
        return;
      }
      setUrls(next);
    };

    void run();

    return () => {
      cancelled = true;
      created.forEach(u => URL.revokeObjectURL(u));
    };
  }, [value.items]);

  const pickFile = async (item: PhotoSheetItem, file: File) => {
    setError('');
    const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
    if (!ALLOWED.includes(ext)) {
      setError('이미지 파일(jpg, png, gif, webp)만 올릴 수 있습니다.');
      return;
    }
    if (file.size > MAX_PHOTO_SIZE) {
      setError('사진은 20MB 이하만 올릴 수 있습니다.');
      return;
    }

    setBusy(item.id);
    try {
      /* 기존 사진이 있으면 먼저 지웁니다. */
      if (item.storageKey) await deleteFile(item.storageKey);
      const key = generateStorageKey(file.name);
      await putFile(key, file);
      onItemChange(item.id, { storageKey: key, fileName: file.name });
    } catch {
      setError('사진을 저장하지 못했습니다. 다시 시도해주세요.');
    } finally {
      setBusy('');
    }
  };

  const removePhoto = async (item: PhotoSheetItem) => {
    if (item.storageKey) {
      try {
        await deleteFile(item.storageKey);
      } catch {
        /* 파일이 이미 없어도 진행합니다. */
      }
    }
    onItemChange(item.id, { storageKey: '', fileName: '' });
  };

  /* ---------------- 4페이지 (모니터링, 좌우 2단) ---------------- */
  if (value.kind === 'monitoring') {
    return (
      <section className="rf-sheet rf-sheet--landscape" aria-label="모니터링 안전점검 사진대지">
        <h2 className="rf-title rf-title--plain">모니터링 안전점검 사진대지</h2>

        <div className="rf-ps-head">
          <span className="rf-ps-head-label">현장명 :</span>
          {editing ? (
            <input
              className="rf-in"
              value={value.constructionName}
              onChange={e => onChange({ constructionName: e.target.value })}
              placeholder={siteName}
            />
          ) : (
            <span className="rf-cell-text">{value.constructionName || siteName}</span>
          )}
        </div>

        {editing && error && (
          <p style={{ margin: '0 0 0.375rem', fontSize: '0.75rem', color: '#b91c1c' }}>{error}</p>
        )}
        {editing && busy && (
          <p style={{ margin: '0 0 0.375rem', fontSize: '0.75rem', color: '#1d4ed8' }}>
            사진 저장 중…
          </p>
        )}

        <div className="rf-ps-grid">
          {value.items.map((item, index) => (
            <div className="rf-ps-col" key={item.id}>
              {/* 위치 / 일자 */}
              <div className="rf-ps-meta" style={{ borderTop: 'none' }}>
                <span style={{ fontWeight: 700, minWidth: '2rem' }}>위치</span>
                <span style={{ flex: 1 }}>
                  {editing ? (
                    <input
                      className="rf-in"
                      value={item.location}
                      onChange={e => onItemChange(item.id, { location: e.target.value })}
                      placeholder="촬영 위치"
                    />
                  ) : (
                    <span className="rf-cell-text">{item.location}</span>
                  )}
                </span>
                <span style={{ flex: 1 }}>
                  {editing ? (
                    <input
                      className="rf-in"
                      value={item.date}
                      onChange={e => onItemChange(item.id, { date: e.target.value })}
                      placeholder="일자"
                    />
                  ) : (
                    <span className="rf-cell-text">{item.date}</span>
                  )}
                </span>
              </div>

              <div className="rf-ps-col-frame" style={{ position: 'relative' }}>
                {urls[item.id] ? (
                  <>
                    <img src={urls[item.id]} alt={item.location || `사진 ${index + 1}`} />
                    {editing && (
                      <button
                        type="button"
                        className="rf-ps-remove"
                        style={{ position: 'absolute', bottom: '0.5rem', right: '0.5rem' }}
                        onClick={() => void removePhoto(item)}
                      >
                        사진 삭제
                      </button>
                    )}
                  </>
                ) : (
                  <div className="rf-ps-frame-empty">
                    <span style={{ fontSize: '1.5rem' }}>🖼️</span>
                    <span>사진 {index + 1}</span>
                    {editing && (
                      <label className="rf-ps-file">
                        📷 사진 선택
                        <input
                          type="file"
                          accept="image/*"
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) void pickFile(item, f);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    )}
                  </div>
                )}
              </div>

              <div className="rf-ps-col-note">&lt;안전시설 점검내용&gt;</div>
              <div className="rf-ps-col-desc">
                {editing ? (
                  <textarea
                    value={item.description}
                    onChange={e => onItemChange(item.id, { description: e.target.value })}
                    placeholder="안전시설 점검내용을 입력하세요."
                  />
                ) : (
                  <span className="rf-cell-text">{item.description}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="rf-photo-note">모니터링 안전점검 사진대지 · A4(297x210) · 구보공영(주)</p>
      </section>
    );
  }

  /* ---------------- 3페이지 (회의, 위아래 2단) ---------------- */
  return (
    <section className="rf-sheet" aria-label="위험성평가 회의 사진대지">
      <h2 className="rf-title" style={{ fontSize: '1.0625rem', letterSpacing: '0.02em' }}>
        {editing ? (
          <input
            className="rf-in"
            style={{ textAlign: 'center', fontSize: '1.0625rem', fontWeight: 800 }}
            value={value.title}
            onChange={e => onChange({ title: e.target.value })}
            placeholder="[KOSAH-MS 관련 위험성평가 회의]"
          />
        ) : (
          value.title || '[KOSAH-MS 관련 위험성평가 회의]'
        )}
      </h2>

      <div className="rf-ps-head">
        <span className="rf-ps-head-label">공사명 :</span>
        {editing ? (
          <input
            className="rf-in"
            value={value.constructionName}
            onChange={e => onChange({ constructionName: e.target.value })}
            placeholder={siteName}
          />
        ) : (
          <span className="rf-cell-text">{value.constructionName || siteName}</span>
        )}
      </div>

      {editing && error && (
        <p style={{ margin: '0.25rem 0', fontSize: '0.75rem', color: '#b91c1c' }}>{error}</p>
      )}

      <div className="rf-ps-stack">
        {value.items.map((item, index) => (
          <div className="rf-ps-block" key={item.id}>
            <div className="rf-ps-frame" style={{ position: 'relative', margin: '6mm' }}>
              {urls[item.id] ? (
                <>
                  <img src={urls[item.id]} alt={item.caption || `사진 ${index + 1}`} />
                  {editing && (
                    <button
                      type="button"
                      className="rf-ps-remove"
                      style={{ position: 'absolute', bottom: '0.5rem', right: '0.5rem' }}
                      onClick={() => void removePhoto(item)}
                    >
                      사진 삭제
                    </button>
                  )}
                </>
              ) : (
                <div className="rf-ps-frame-empty">
                  <span style={{ fontSize: '1.5rem' }}>🖼️</span>
                  <span>사진 {index + 1}</span>
                  {editing && (
                    <label className="rf-ps-file">
                      📷 사진 선택
                      <input
                        type="file"
                        accept="image/*"
                        onChange={e => {
                          const f = e.target.files?.[0];
                          if (f) void pickFile(item, f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  )}
                </div>
              )}
            </div>

            <div className="rf-ps-meta" style={{ borderTop: '1px solid #111827' }}>
              <span
                style={{
                  minWidth: '4rem',
                  padding: '0.25rem 0.5rem',
                  textAlign: 'center',
                  fontWeight: 700,
                  background: '#e5e7eb',
                  borderRight: '1px solid #111827',
                  marginLeft: '-0.5rem',
                  marginTop: '-0.25rem',
                  marginBottom: '-0.25rem',
                  alignSelf: 'stretch',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                일 자
              </span>
              <span style={{ flex: 1 }}>
                {editing ? (
                  <input
                    className="rf-in"
                    value={item.date}
                    onChange={e => onItemChange(item.id, { date: e.target.value })}
                    placeholder="일자"
                  />
                ) : (
                  <span className="rf-cell-text">{item.date}</span>
                )}
              </span>
              <span
                style={{
                  minWidth: '4rem',
                  padding: '0.25rem 0.5rem',
                  textAlign: 'center',
                  fontWeight: 700,
                  background: '#e5e7eb',
                  borderLeft: '1px solid #111827',
                  borderRight: '1px solid #111827',
                  marginTop: '-0.25rem',
                  marginBottom: '-0.25rem',
                  alignSelf: 'stretch',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                위 치
              </span>
              <span style={{ flex: 1 }}>
                {editing ? (
                  <input
                    className="rf-in"
                    value={item.location}
                    onChange={e => onItemChange(item.id, { location: e.target.value })}
                    placeholder="위치"
                  />
                ) : (
                  <span className="rf-cell-text">{item.location}</span>
                )}
              </span>
            </div>

            <div className="rf-ps-meta">
              <span
                style={{
                  minWidth: '4rem',
                  padding: '0.25rem 0.5rem',
                  textAlign: 'center',
                  fontWeight: 700,
                  background: '#e5e7eb',
                  borderRight: '1px solid #111827',
                  marginLeft: '-0.5rem',
                  marginTop: '-0.25rem',
                  marginBottom: '-0.25rem',
                  alignSelf: 'stretch',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                사진설명
              </span>
              <span style={{ flex: 1 }}>
                {editing ? (
                  <input
                    className="rf-in"
                    value={item.caption}
                    onChange={e => onItemChange(item.id, { caption: e.target.value })}
                    placeholder="사진 설명"
                  />
                ) : (
                  <span className="rf-cell-text">{item.caption}</span>
                )}
              </span>
            </div>
          </div>
        ))}
      </div>

      <p className="rf-photo-note">위험성평가 회의 사진대지 · A4(210x297) · 구보공영(주)</p>
    </section>
  );
};

export default PhotoSheetForm;
