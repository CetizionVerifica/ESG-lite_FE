/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" or "true" mounts the redesigned routes (src/routes/newUiRoutes.tsx). */
  readonly VITE_NEW_UI?: string;
}
