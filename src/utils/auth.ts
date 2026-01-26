// 관리자 인증 관련
const ADMIN_KEY = 'gubo_admin_auth';
const ADMIN_CREDENTIALS = {
  username: 'goobo90',
  password: 'goobo90'
};

export const login = (username: string, password: string): boolean => {
  if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
    const token = btoa(`${username}:${Date.now()}`);
    localStorage.setItem(ADMIN_KEY, token);
    return true;
  }
  return false;
};

export const logout = (): void => {
  localStorage.removeItem(ADMIN_KEY);
};

export const isAuthenticated = (): boolean => {
  return !!localStorage.getItem(ADMIN_KEY);
};

export const getAuthToken = (): string | null => {
  return localStorage.getItem(ADMIN_KEY);
};
