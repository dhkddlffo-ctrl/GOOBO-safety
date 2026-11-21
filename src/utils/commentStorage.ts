/**
 * 위험성평가 게시글 댓글 저장소
 *
 * 서버가 없으므로 LocalStorage 한 곳에 모든 댓글을 모아 저장하고,
 * 화면에서는 게시글(targetType + targetId)별로 걸러서 보여줍니다.
 *
 *   targetType 'assessment' → 등록부(서식으로 작성한 글), targetId = 등록부 id
 *   targetType 'upload'     → 이미지로 올린 글,          targetId = RiskUpload id
 */

import { RiskComment } from '../types';

const COMMENTS_KEY = 'gubo_risk_comments';

/** 댓글 1건 최대 길이 */
export const MAX_COMMENT_LENGTH = 1000;

/** 댓글 작성자 이름 최대 길이 */
export const MAX_COMMENT_AUTHOR = 20;

const newId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const readAll = (): RiskComment[] => {
  const raw = localStorage.getItem(COMMENTS_KEY);
  if (!raw) return [];
  try {
    const all = JSON.parse(raw) as RiskComment[];
    return Array.isArray(all) ? all : [];
  } catch {
    return [];
  }
};

const writeAll = (all: RiskComment[]): void => {
  localStorage.setItem(COMMENTS_KEY, JSON.stringify(all));
};

/**
 * 게시글 하나의 댓글 목록 — 오래된 것부터(달린 순서대로) 돌려줍니다.
 */
export const getComments = (
  targetType: RiskComment['targetType'],
  targetId: string,
): RiskComment[] =>
  readAll()
    .filter(c => c.targetType === targetType && c.targetId === targetId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

/**
 * 댓글을 하나 씁니다.
 *
 * 앞뒤 공백은 지우고, 너무 길면 잘라서 저장합니다.
 * 내용이 비어 있으면 아무것도 하지 않고 null 을 돌려줍니다.
 */
export const addComment = (input: {
  targetType: RiskComment['targetType'];
  targetId: string;
  siteId: number;
  author: string;
  body: string;
}): RiskComment | null => {
  const body = input.body.trim().slice(0, MAX_COMMENT_LENGTH);
  if (!body) return null;

  const comment: RiskComment = {
    id: newId(),
    targetType: input.targetType,
    targetId: input.targetId,
    siteId: input.siteId,
    author: input.author.trim().slice(0, MAX_COMMENT_AUTHOR) || '익명',
    body,
    createdAt: new Date().toISOString(),
  };

  writeAll([...readAll(), comment]);
  return comment;
};

/** 댓글 삭제 */
export const deleteComment = (id: string): void => {
  writeAll(readAll().filter(c => c.id !== id));
};

/** 게시글 하나에 달린 댓글 수 (목록 화면 배지용) */
export const countComments = (targetType: RiskComment['targetType'], targetId: string): number =>
  readAll().filter(c => c.targetType === targetType && c.targetId === targetId).length;

/** ISO 시각 → yyyy.mm.dd hh:mm */
export const formatCommentAt = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes(),
  )}`;
};
