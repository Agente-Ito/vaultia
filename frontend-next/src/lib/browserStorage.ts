function canUseBrowserStorage() {
  return typeof window !== 'undefined';
}

function getStorage(kind: 'local' | 'session') {
  if (!canUseBrowserStorage()) {
    return null;
  }

  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readLocalStorage(key: string): string | null {
  try {
    return getStorage('local')?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeLocalStorage(key: string, value: string): boolean {
  try {
    const storage = getStorage('local');
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeLocalStorage(key: string): boolean {
  try {
    const storage = getStorage('local');
    if (!storage) return false;
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function readSessionStorage(key: string): string | null {
  try {
    return getStorage('session')?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeSessionStorage(key: string, value: string): boolean {
  try {
    const storage = getStorage('session');
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}