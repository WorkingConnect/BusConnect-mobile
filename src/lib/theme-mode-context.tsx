import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useColorScheme as useSystemColorScheme } from "react-native";
import { getStoredThemeMode, setStoredThemeMode, type ThemeMode } from "./theme-mode";

interface ThemeModeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** The mode resolved against the system preference when mode is "system". */
  resolvedScheme: "light" | "dark";
}

const ThemeModeContext = createContext<ThemeModeContextValue | undefined>(undefined);

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useSystemColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("light");

  useEffect(() => {
    void getStoredThemeMode().then(setModeState);
  }, []);

  function setMode(next: ThemeMode) {
    setModeState(next);
    void setStoredThemeMode(next);
  }

  const resolvedScheme = mode === "system" ? (systemScheme === "dark" ? "dark" : "light") : mode;

  return (
    <ThemeModeContext.Provider value={{ mode, setMode, resolvedScheme }}>{children}</ThemeModeContext.Provider>
  );
}

export function useThemeMode() {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error("useThemeMode must be used within a ThemeModeProvider");
  return ctx;
}
