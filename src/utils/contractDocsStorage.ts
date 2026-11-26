import { ContractAttachment } from '../types';
import {
  MAX_FILE_SIZE,
  deleteFile,
  getExtension,
  getFile,
  isAllowedFile,
  putFile,
} from './documentStorage';

/**
 * 현장 계약서 저장소
 *
 * 계약서 사본은 스캔본 PDF 라 용량이 큽니다.
 * 문서보관함과 같은 방식으로
 *  - 파일 본문(Blob) → IndexedDB (gubo_documents_db)
 *  - 파일 정보(이름·크기·종류) → LocalStorage (SiteInfo.contractFiles)
 * 로 나누어 저장합니다.
 *
 * 파일 키에 `contract/` 접두사를 붙여, 문서보관함 파일과 섞이지 않게 구분합니다.
 * (같은 DB 를 사용하므로 백업/복원 대상에도 자동으로 포함됩니다)
 */

const KEY_PREFIX = 'contract';

/** 계약서로 허용하는 확장자 (계약서·스캔본 중심) */
export const CONTRACT_DOC_EXTENSIONS = [
  'pdf',
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'hwp',
  'hwpx',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'zip',
];

/** input[type=file] accept 문자열 */
export const CONTRACT_DOC_ACCEPT = CONTRACT_DOC_EXTENSIONS.map(ext => `.${ext}`).join(',');

/** 계약서 1건 최대 크기 (50MB) */
export const CONTRACT_DOC_MAX_SIZE = MAX_FILE_SIZE;

export const isAllowedContractDoc = (fileName: string): boolean =>
  CONTRACT_DOC_EXTENSIONS.includes(getExtension(fileName)) && isAllowedFile(fileName);

/** 화면에서 바로 미리 볼 수 있는 형식인지 (이미지 · PDF) */
export const isContractDocPreviewable = (fileName: string): boolean =>
  ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'].includes(getExtension(fileName));

/** 계약서 파일이 이미지인지 */
export const isContractDocImage = (fileName: string): boolean =>
  ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(getExtension(fileName));

export const generateContractId = (): string =>
  `contract-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const generateContractKey = (fileName: string): string => {
  const ext = getExtension(fileName);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return ext ? `${KEY_PREFIX}/${stamp}.${ext}` : `${KEY_PREFIX}/${stamp}`;
};

/** 파일 본문 저장 + SiteInfo.contractFiles 에 넣을 정보를 만들어 줍니다. */
export const createContractAttachment = async (
  file: File,
  uploadedBy = '',
): Promise<ContractAttachment> => {
  if (!isAllowedContractDoc(file.name)) {
    throw new Error('계약서는 PDF · 이미지 · 한글 · 워드 · 엑셀 · 압축 파일만 올릴 수 있습니다.');
  }
  if (file.size > CONTRACT_DOC_MAX_SIZE) {
    throw new Error('계약서는 1건당 50MB 까지 올릴 수 있습니다.');
  }

  const storageKey = generateContractKey(file.name);
  await putFile(storageKey, file);

  return {
    id: generateContractId(),
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type || getExtension(file.name),
    storageKey,
    uploadedAt: new Date().toISOString(),
    uploadedBy: uploadedBy || undefined,
  };
};

/** 파일 본문 조회 (미리보기용) */
export const getContractFile = (storageKey: string): Promise<Blob | null> => getFile(storageKey);

/** 파일 본문 삭제 */
export const deleteContractFile = (storageKey: string): Promise<void> => deleteFile(storageKey);

/** 계약서 내려받기 (브라우저 다운로드) */
export const downloadContractDoc = async (attachment: ContractAttachment): Promise<void> => {
  const blob = await getFile(attachment.storageKey);
  if (!blob) throw new Error('계약서 파일을 찾을 수 없습니다.');

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = attachment.fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
