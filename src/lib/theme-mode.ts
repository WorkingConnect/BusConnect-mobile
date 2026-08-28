import * as SecureStore from "expo-secure-store";

export type ThemeMode = "light" | "dark" | "system";

const KEY = "busconnect-theme-mode";

export async function getStoredThemeMode(): Promise<ThemeMode> {
  const value = await SecureStore.getItemAsync(KEY);
  return value === "light" || value === "dark" ? value : "light";
}

export async function setStoredThemeMode(mode: ThemeMode): Promise<void> {
  if (mode === "system") {
    await SecureStore.deleteItemAsync(KEY);
  } else {
    await SecureStore.setItemAsync(KEY, mode);
  }
}
