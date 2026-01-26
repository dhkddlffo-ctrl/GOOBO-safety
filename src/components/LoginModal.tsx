import React, { useState } from 'react';
import { login } from '../utils/auth';
import './LoginModal.css';

interface LoginModalProps {
  onClose: () => void;
  onLoginSuccess: () => void;
}

const LoginModal: React.FC<LoginModalProps> = ({ onClose, onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (login(username, password)) {
      onLoginSuccess();
      onClose();
    } else {
      setError('아이디 또는 비밀번호가 올바르지 않습니다.');
      setPassword('');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content login-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>관리자 로그인</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">아이디</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="아이디를 입력하세요"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">비밀번호</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호를 입력하세요"
              required
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <div className="login-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              취소
            </button>
            <button type="submit" className="btn btn-primary">
              로그인
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginModal;
