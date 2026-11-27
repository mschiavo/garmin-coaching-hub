import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Moon, Sun } from 'lucide-react';

export type Theme = 'dark' | 'light';

type ThemeContextValue = { theme: Theme; toggleTheme: () => void };
const ThemeContext = createContext<ThemeContextValue>({ theme: 'dark', toggleTheme: () => {} });
const storageKey = 'gch-dashboard-theme';

function initialTheme(): Theme {
  try {
    return window.localStorage.getItem(storageKey) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      window.localStorage.setItem(storageKey, theme);
    } catch {
      // Theme remains usable for this page even when storage is unavailable.
    }
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, toggleTheme: () => setTheme(value => value === 'dark' ? 'light' : 'dark') }}>
    <div className="v4-theme-root" data-theme={theme}>{children}</div>
  </ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  return <button type="button" className="v4-theme-toggle" onClick={toggleTheme} aria-label={`Attiva tema ${nextTheme}`}>
    {theme === 'dark' ? <Sun size={17} aria-hidden="true"/> : <Moon size={17} aria-hidden="true"/>}
    <span>{theme === 'dark' ? 'Tema chiaro' : 'Tema scuro'}</span>
  </button>;
}
