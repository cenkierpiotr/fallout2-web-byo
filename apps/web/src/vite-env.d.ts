/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly BUNDLE_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
