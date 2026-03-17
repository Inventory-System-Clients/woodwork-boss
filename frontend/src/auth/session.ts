const TOKEN_STORAGE_KEY = "woodwork.auth.token";

let memoryToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

const hasStorage = () =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

export const getSessionToken = () => memoryToken;

export const setSessionToken = (token: string, persist = true) => {
  memoryToken = token;

  if (persist && hasStorage()) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  }
};

export const clearSessionToken = () => {
  memoryToken = null;

  if (hasStorage()) {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
};

export const loadSessionToken = () => {
  if (!hasStorage()) {
    return null;
  }

  const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);

  if (storedToken) {
    memoryToken = storedToken;
  }

  return storedToken;
};

export const setUnauthorizedHandler = (handler?: () => void) => {
  unauthorizedHandler = handler || null;
};

export const handleUnauthorized = () => {
  unauthorizedHandler?.();
};
