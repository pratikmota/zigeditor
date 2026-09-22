/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ZIG_WASM: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
