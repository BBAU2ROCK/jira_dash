import { defineConfig, type Plugin } from 'vite'
import path from 'node:path'
import { cp, mkdir } from 'node:fs/promises'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'

/**
 * Electron main(main.ts)이 `createRequire('./jira-proxy-handler.cjs')` 로
 * 동적 require 하는 .cjs 파일을 Vite 번들러는 정적 분석하지 못함 →
 * 빌드 산출물(`dist-electron/`)에 자동으로 복사되지 않아 설치 버전에서 런타임 에러.
 *
 * 이 플러그인은 main 빌드 종료 시점에 `electron/jira-proxy-handler.cjs` 를
 * `dist-electron/`으로 명시적으로 복사한다. electron-builder의 `files: ["dist-electron/**\/*"]`
 * 규칙에 따라 asar에 자동 포함.
 */
function copyElectronCjsAssets(): Plugin {
  return {
    name: 'copy-electron-cjs-assets',
    // dev watch 빌드·prod build 양쪽 모두 closeBundle 훅 발동 (electron이 실제로 main.js를 로드함)
    async closeBundle() {
      const src = path.resolve(__dirname, 'electron/jira-proxy-handler.cjs')
      const destDir = path.resolve(__dirname, 'dist-electron')
      await mkdir(destDir, { recursive: true })
      await cp(src, path.join(destDir, 'jira-proxy-handler.cjs'))
      // eslint-disable-next-line no-console
      console.log('[copy-electron-cjs-assets] jira-proxy-handler.cjs → dist-electron/')
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        // Shortcut of `build.lib.entry`.
        entry: 'electron/main.ts',
        // main 빌드 파이프라인 안에서 .cjs 헬퍼 복사 — dev(watch) + build 양쪽 모두 커버
        vite: {
          plugins: [copyElectronCjsAssets()],
        },
      },
      preload: {
        // Shortcut of `build.rollupOptions.input`.
        // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
        input: path.join(__dirname, 'electron/preload.ts'),
      },
      // Ployfill the Electron and Node.js API for Renderer process.
      // If you want use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
      // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})

