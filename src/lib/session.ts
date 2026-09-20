import type { LocalSession } from '../types';

const KEY = 'benchmark.local.session.v1';

export function loadSession(): LocalSession | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LocalSession;
  } catch {
    localStorage.removeItem(KEY);
    return null;
  }
}

export function saveSession(session: LocalSession): void {
  localStorage.setItem(KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
}
