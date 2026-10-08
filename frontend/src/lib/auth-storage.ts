const KEY = "airbnb-clone.auth-token";
export function getToken(): string | null { return typeof window === "undefined" ? null : localStorage.getItem(KEY); }
export function setToken(token: string): void { localStorage.setItem(KEY, token); }
export function clearToken(): void { if (typeof window !== "undefined") localStorage.removeItem(KEY); }
