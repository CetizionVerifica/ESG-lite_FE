/**
 * @deprecated Moved to src/theme (F1). Import ThemeProvider and useTheme from
 * "src/theme" in new code. This shim keeps the legacy pages' imports working
 * while they migrate off `isDark` page by page; delete it when none remain.
 */
export { ThemeProvider } from "../theme/ThemeProvider";
export { useTheme } from "../theme/useTheme";
