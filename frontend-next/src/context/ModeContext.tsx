'use client';

import React, { createContext, useState, useContext, useEffect } from 'react';

type UIMode = 'simple' | 'advanced';

interface ModeContextType {
  mode: UIMode;
  setMode: (mode: UIMode) => void;
  isAdvanced: boolean;
}

const ModeContext = createContext<ModeContextType | undefined>(undefined);

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<UIMode>('simple');

  // Sync from localStorage after hydration — always render the Provider so useMode() never throws
  useEffect(() => {
    const savedMode = localStorage.getItem('ui-mode') as UIMode | null;
    if (savedMode === 'advanced' || savedMode === 'simple') {
      setModeState(savedMode);
    }
  }, []);

  const setMode = (newMode: UIMode) => {
    setModeState(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('ui-mode', newMode);
    }
  };

  return (
    <ModeContext.Provider value={{ mode, setMode, isAdvanced: mode === 'advanced' }}>
      {children}
    </ModeContext.Provider>
  );
}

export function useMode(): ModeContextType {
  const context = useContext(ModeContext);
  if (!context) {
    throw new Error('useMode must be used within ModeProvider');
  }
  return context;
}
