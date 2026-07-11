/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_PROXY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
