import { useThemeContext } from "../context/ThemeContext";

// Re-export the context hook as the 'useTheme' hook to maintain compatibility
// or simply delegate to it.
export function useTheme() {
  return useThemeContext();
}
