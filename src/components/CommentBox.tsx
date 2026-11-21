import React, { useCallback, useEffect, useState } from 'react';
import { RiskComment } from '../types';
import { isAuthenticated } from '../utils/auth';
import {
  MAX_COMMENT_AUTHOR,
  MAX_COMMENT_LENGTH,
  addComment,
  deleteComment,
  formatCommentAt,
  getComments,
} from '../utils/commentStorage';
import './CommentBox.css';

interface CommentBoxProps {
  targetType: RiskComment['targetType'];
  targetId: string;
  siteId: number;
  /** 제목 (예: 댓글 3) */
  title?: string;
}

/**
 * 위험성평가 게시글 댓글 상자
 *
 * 등록부로 작성한 글과 이미지로 올린 글 모두 아래쪽에 붙습니다.
 * 서버가 없으므로 댓글은 이 브라우저(LocalStorage)에 저장됩니다.
 */
const CommentBox: React.FC<CommentBoxProps> = ({ targetType, targetId, siteId, title }) => {
  const canManage = isAuthenticated();

  const [list, setList] = useState<RiskComment[]>([]);
  const [author, setAuthor] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');

  const reload = useCallback(() => {
    setList(getComments(targetType, targetId));
  }, [targetType, targetId]);

  useEffect(() => {
    reload();
    setBody('');
    setError('');
  }, [reload]);

  const submit = () => {
    const text = body.trim();
    if (!text) {
      setError('댓글 내용을 입력해주세요.');
      return;
    }
    const created = addComment({
      targetType,
      targetId,
      siteId,
      author: author.trim() || '익명',
      body: text,
    });
    if (!created) {
      setError('댓글을 저장하지 못했습니다.');
      return;
    }
    setBody('');
    setError('');
    reload();
  };

  /** Ctrl(⌘) + Enter 로도 등록 */
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  const remove = (comment: RiskComment) => {
    if (!window.confirm('이 댓글을 삭제할까요?')) return;
    deleteComment(comment.id);
    reload();
  };

  const left = MAX_COMMENT_LENGTH - body.length;

  return (
    <section className="rc">
      <div className="rc-head">
        <h4 className="rc-title">{title || '댓글'}</h4>
        <span className="rc-count">{list.length}개</span>
      </div>

      {list.length === 0 ? (
        <p className="rc-empty">아직 댓글이 없습니다. 첫 댓글을 남겨 보세요.</p>
      ) : (
        <ul className="rc-list">
          {list.map(comment => (
            <li className="rc-item" key={comment.id}>
              <div className="rc-item-head">
                <span className="rc-author">{comment.author}</span>
                <span className="rc-at">{formatCommentAt(comment.createdAt)}</span>
                {canManage && (
                  <button type="button" className="rc-del" onClick={() => remove(comment)}>
                    삭제
                  </button>
                )}
              </div>
              <p className="rc-body">{comment.body}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="rc-write">
        <div className="rc-write-row">
          <input
            className="rc-input rc-input-author"
            value={author}
            onChange={e => setAuthor(e.target.value.slice(0, MAX_COMMENT_AUTHOR))}
            placeholder="이름 (비우면 익명)"
            aria-label="댓글 작성자"
          />
        </div>
        <textarea
          className="rc-input rc-textarea"
          value={body}
          onChange={e => setBody(e.target.value.slice(0, MAX_COMMENT_LENGTH))}
          onKeyDown={onKeyDown}
          rows={3}
          placeholder="댓글을 입력하세요. (Ctrl + Enter 로 등록)"
          aria-label="댓글 내용"
        />
        {error && <p className="rc-error">⚠️ {error}</p>}
        <div className="rc-write-foot">
          <span className={`rc-left${left < 50 ? ' rc-left-warn' : ''}`}>{left}자 남음</span>
          <button type="button" className="rc-submit" onClick={submit} disabled={!body.trim()}>
            💬 댓글 등록
          </button>
        </div>
      </div>
    </section>
  );
};

export default CommentBox;
