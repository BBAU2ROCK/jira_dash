# Mac용 설치 파일 빌드 가능 여부 분석

## 1. 요청 사항

- OS(Windows)용 setup 파일과 별도로 **Mac에서 사용할 수 있는 Mac용 설치 파일**을 만들 수 있는지 분석.

---

## 2. 결론 요약

| 항목 | 내용 |
|------|------|
| **가능 여부** | **가능함.** Electron 기반이라 동일 소스로 Mac용 패키지(dmg/zip 등) 생성 가능. |
| **빌드 환경** | Mac용 설치 파일은 **반드시 macOS에서** 빌드해야 함. Windows 호스트에서는 Mac 타깃 빌드 불가. |
| **현재 상태** | `package.json`에 `mac` 설정이 이미 있음(target: zip). 여기에 dmg 등을 추가하고, **macOS 환경**에서 빌드하면 Mac용 설치 파일 생성 가능. |

---

## 3. electron-builder 플랫폼 제약

### 3.1 공식 문서 정리

- **한 플랫폼에서 모든 플랫폼 빌드는 불가.**  
  [Multi Platform Build](https://www.electron.build/multi-platform-build.html): *"Don't expect that you can build app for all platforms on one platform."*
- **macOS 앱/코드 서명**: macOS에서만 가능.  
  *"macOS Code Signing works only on macOS. Cannot be fixed."*
- **Windows → Mac 빌드**: 지원하지 않음. (Mac → Windows 빌드는 Linux/Windows Docker 등으로 가능.)

### 3.2 Mac용 설치 파일을 만들 수 있는 방법

1. **macOS 머신에서 직접 빌드**  
   - Mac PC 또는 Mac VM에서 `npm run build` 또는 `npx electron-builder --mac` 실행.
2. **CI/CD에서 macOS 러너 사용**  
   - GitHub Actions `macos-latest`, GitLab CI macOS runner, Travis CI(os: osx) 등에서 `electron-builder --mac` 실행.
3. **VM**  
   - Windows 호스트에서 macOS를 VM(예: Parallels, VMware)으로 띄우고, 그 안에서 빌드 (라이선스·호환성 주의).

---

## 4. 현재 프로젝트 설정

### 4.1 package.json `build` 필드

```json
"build": {
  "appId": "com.okestro.jiradash",
  "productName": "Jira Dashboard",
  "directories": { "output": "dist_electron", "buildResources": "build" },
  "files": ["dist/**/*", "dist-electron/**/*"],
  "win": { "target": ["portable", "nsis"], "icon": "build/icon.ico", ... },
  "nsis": { ... },
  "mac": {
    "target": "zip",
    "category": "public.app-category.productivity"
  }
}
```

- **mac**: 이미 설정되어 있음. 현재는 `target: "zip"` 만 있어서 **zip**만 생성됨.
- **Mac용 “설치 파일”**로 쓰기 좋은 것은 **dmg**(디스크 이미지, 드래그 앤 드롭 설치).  
  필요 시 **pkg**(설치 마법사)도 선택 가능.

### 4.2 아이콘

| 플랫폼 | 필요 아이콘 | 현재 보유 |
|--------|--------------|-----------|
| Windows | `build/icon.ico` | ✅ 있음 (build:icons에서 icon.png → ico 생성) |
| Mac | `build/icon.icns` 또는 `build/icon.png` (512×512 이상) | ✅ `build/icon.png` 있음 (약 4.4MB). icns는 없음. |

- electron-builder 문서: Mac 앱 아이콘으로 **icon.png**(512×512 이상) 또는 **icon.icns**를 `build`에 두면 됨.  
- **icon.png만 있어도** Mac 빌드 시 앱 아이콘으로 사용 가능.  
- DMG **볼륨 아이콘**은 legacy 호환을 위해 `.icns`를 권장하므로, 나중에 icns를 추가하면 더 좋음(선택).

### 4.3 앱 코드

- `electron/main.ts`에서 `process.platform !== 'darwin'`일 때만 `app.quit()` 호출, `activate` 시 창 재생성 등 **macOS 동작을 이미 고려**한 코드가 있음.  
- 별도 Mac 전용 수정 없이도, Mac에서 빌드만 하면 동작 가능한 상태로 보임.

---

## 5. Mac용 설치 파일을 만들 때 권장 변경

### 5.1 package.json `build.mac` 확장 (선택)

- **dmg**를 쓰면 Mac 사용자에게 익숙한 “설치 파일” 형태가 됨.  
- 예시:

```json
"mac": {
  "target": ["dmg", "zip"],
  "category": "public.app-category.productivity",
  "icon": "build/icon.png",
  "hardenedRuntime": true,
  "gatekeeperAssess": false
}
```

- 서명이 필요하면 `identity`, `notarize` 등 추가 (macOS에서만 유효).

### 5.2 npm 스크립트 (선택)

- Mac 전용 빌드만 돌리고 싶을 때:
  - `"build:mac": "npm run build:icons && tsc -b && vite build && electron-builder --mac"`
- 또는 기존 `build`를 그대로 두고, **macOS에서만** `electron-builder --mac`을 실행해도 됨.

### 5.3 아이콘

- **현재**: `build/icon.png`만으로 Mac 빌드 가능.  
- **선택**: DMG 볼륨 아이콘을 예쁘게 하려면 `build/icon.icns`를 추가.  
  - macOS에서 `iconutil`로 png → icns 변환 가능.  
  - 또는 [electron-icon-builder](https://www.npmjs.com/package/electron-icon-builder) 등으로 icns 생성 후 `build/`에 넣고, `mac.icon` 또는 `dmg.icon`에 지정.

### 5.4 clean 스크립트

- `scripts/clean-install-output.cjs`에서 이미 `dist_electron/mac` 폴더를 삭제 대상에 포함하고 있음.  
- Mac 빌드 결과물 정리에는 추가 수정 불필요.

---

## 6. 빌드 절차 요약 (Mac용 설치 파일 생성)

1. **macOS 환경** 준비 (로컬 Mac, CI의 macos runner, 또는 Mac VM).
2. 저장소 클론 후 `npm install`.
3. (선택) `package.json`의 `build.mac`에 `dmg` 추가 및 `build:mac` 스크립트 추가.
4. **Mac에서** 다음 중 하나 실행:
   - `npm run build` (이미 `electron-builder`를 호출하고, 기본이 현재 플랫폼이면 Mac에서 실행 시 mac 타깃으로 빌드됨.)
   - 또는 `npx electron-builder --mac` (Mac 전용만 빌드.)
5. 출력: `dist_electron/` 아래  
   - `*.dmg` (dmg 타깃 추가 시),  
   - `*.zip`,  
   - `mac/*.app` (언팩된 앱) 등.

---

## 7. 정리

- **Mac용 설치 파일(dmg/zip 등)은 만들 수 있음.**  
  현재 구조만으로도 Mac 타깃 추가와 스크립트 보강으로 대응 가능.
- **단, 빌드는 반드시 macOS에서 수행해야 함.**  
  Windows에서는 Mac 타깃 빌드가 불가하므로, Mac 로컬/CI(macos runner)/Mac VM 중 하나가 필요함.
- **설정 변경**: `build.mac.target`에 `dmg` 추가, 필요 시 `build:mac` 스크립트와 `icon.icns` 추가를 권장.
