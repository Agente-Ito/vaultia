import { useState, useEffect } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(initialValue);
  const [isMounted, setIsMounted] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        setStoredValue(JSON.parse(item));
      }
    } catch (error) {
      console.error(`Error reading from localStorage (${key}):`, error);
    }
    setIsMounted(true);
  }, [key]);

  // Update localStorage when state changes.
  // Guard against SSR where window is undefined (e.g., Next.js server components).
  const setValue = (value: T) => {
    try {
      setStoredValue(value);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(value));
      }
    } catch (error) {
      console.error(`Error writing to localStorage (${key}):`, error);
    }
  };

  // Only return mounted state to avoid hydration issues
  if (!isMounted) {
    return [initialValue, setValue];
  }

  return [storedValue, setValue];
}
