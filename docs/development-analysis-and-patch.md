# 개발 내용 전체 분석 및 설치 파일 패치

## 1. 프로젝트 개요

- **이름**: 01_jira_dash (Jira Dashboard)
- **버전**: 1.0.5 (설치 파일 패치·버전 관리)
- **스택**: React 19, Vite 7, Electron 40, TypeScript 5.9
- **빌드 산출물**: Windows portable (`dist_electron`), Mac zip

### 버전 이력

| 버전 | 비고 |
|------|------|
| 1.0.5 | NSIS OS 설치 파일(Setup exe), 바탕화면/시작 메뉴 바로가기, 앱 아이콘(build/icon). 설치 파일 패치, 초기화 일원화 등 |
| 1.0.4 | 이전 릴리스 |

---

## 2. 빌드·설치 구조 분석

| 항목 | 내용 |
|------|------|
| **진입점** | `package.json` → `main: "dist-electron/main.js"` (Electron 메인) |
| **렌더러** | Vite 빌드 → `dist/` (HTML/JS/CSS) |
| **Electron 메인/프리로드** | Vite 플러그인 → `dist-electron/main.js`, `dist-electron/preload.js` |
| **패키징** | `electron-builder` → `files: ["dist/**/*", "dist-electron/**/*"]`, 출력 디렉터리 `dist_electron` |
| **Windows** | `win.target: "portable"`, NSIS 옵션(원클릭, 바로가기 등) |

**결론**: `dist` / `dist-electron` 경로와 `package.json` build 설정은 일치하며, 설치 파일 생성 경로와도 맞음.

---

## 3. 문제점 파악 및 조치

### 3.1 보안 (치명)

- **위치**: `electron/main.ts`
- **문제**: Jira API 토큰·이메일이 소스에 하드코딩되어 있어, 빌드 산출물에 그대로 포함됨.
- **조치**: 환경 변수 `JIRA_EMAIL`, `JIRA_API_TOKEN` 사용으로 변경. 미설정 시 빈 문자열로 동작하며, 실행 시 설정 가이드 주석 추가.

### 3.2 린트 설정

- **위치**: `eslint.config.js`
- **문제**: `dist`만 무시하고 `dist-electron`은 무시하지 않아, 빌드 결과물(`dist-electron/main.js`)까지 린트 대상이 됨.
- **조치**: `globalIgnores`에 `dist-electron` 추가.

### 3.3 React Hooks 의존성

- **위치**: `src/components/project-stats-dialog.tsx`
- **문제**: `difficultyBreakdown` useMemo가 `difficultyOrderIndex`를 사용하는데 의존성 배열에 없음 (react-hooks/exhaustive-deps 경고).
- **조치**: 난이도 순서를 useMemo 내부 상수로 두고 정렬 로직을 안에서 처리해 의존성 제거.

### 3.4 기타 (참고)

- **Lint**: `@typescript-eslint/no-explicit-any`, `react-refresh/only-export-components` 등 50+ 에러/경고는 기존 코드 스타일 이슈로, 이번 패치 범위 외.
- **TypeScript**: `tsc -b --noEmit` 통과.

---

## 4. 설치 파일(exe)이 사라진 이유와 수정

- **원인**: 초기 `clean` 스크립트가 **dist_electron 전체**를 삭제하도록 되어 있어, `npm run clean` 또는 `npm run build:install` 실행 시 **버전별 exe 파일까지 함께 삭제**됨.
- **수정**: `clean`은 이제 **win-unpacked(및 mac 등 언팩 폴더)만** 삭제하고, **dist_electron 루트의 exe 파일은 삭제하지 않음**. 이렇게 하면 기존 설치 파일이 유지되고, 다음 `build` 시 exe만 갱신됨.

---

## 5. 적용한 패치 요약

1. **electron/main.ts**  
   - `JIRA_EMAIL`, `JIRA_API_TOKEN`를 `process.env`에서 읽도록 변경.  
   - 미설정 시 안내 주석 유지.

2. **eslint.config.js**  
   - `globalIgnores`에 `'dist-electron'` 추가.

3. **src/components/project-stats-dialog.tsx**  
   - 난이도 순서 상수·정렬을 `difficultyBreakdown` useMemo 내부로 이동해 `difficultyOrderIndex` 의존성 제거.

---

## 6. 검증 및 설치 파일 빌드

```bash
# 타입 검사
npx tsc -b --noEmit

# 린트 (소스만, 빌드 결과 제외)
npm run lint

# 설치 파일 빌드 (권장: 실행 중인 Jira Dashboard 앱을 먼저 종료)
npm run build:install
# 또는 정리 없이 빌드만
npm run build
```

- **`npm run clean`**: `dist_electron` **전체가 아닌** `win-unpacked`(및 mac 등 언팩 폴더)만 삭제. **버전별 exe 파일은 삭제하지 않아 기존 설치 파일이 유지됨.** 빌드 시 잠금 원인이 되는 언팩 폴더만 제거. Jira Dashboard 실행 중이면 삭제가 실패할 수 있으므로 앱 종료 후 실행.
- **`npm run build:install`**: `clean` 후 `build` 실행. 기존 exe는 유지된 채로 언팩 폴더만 정리한 뒤, 새 빌드로 exe 갱신.

빌드 성공 시 Windows에서는 `dist_electron/` 하위에 다음이 생성됨.
- **Jira Dashboard 1.0.5.exe** — portable(설치 없이 실행)
- **Jira Dashboard Setup 1.0.5.exe** — NSIS 설치 파일(다른 PC에서 설치·바탕화면/시작 메뉴 바로가기, 앱 아이콘 적용)

---

## 7. OS 설치 파일(Setup) 사용 방법

- **Jira Dashboard Setup 1.0.5.exe**를 다른 PC에 복사한 뒤 실행하면, 설치 마법사가 뜹니다.
- 설치 경로 변경 가능(기본: `%LOCALAPPDATA%\Programs\Jira Dashboard`), **바탕화면 바로가기**·**시작 메뉴 바로가기**가 생성됩니다.
- 작업 표시줄/바로가기에는 **build/icon.ico**에서 생성한 앱 아이콘이 사용됩니다.
- 환경이 구성되지 않은 PC에서도 설치만 하면 실행 가능합니다. (실행 후 Jira API 사용 시에는 환경 변수 `JIRA_EMAIL`, `JIRA_API_TOKEN` 설정 필요.)

## 8. 설치 파일 사용 시 주의사항

- Jira API 인증이 필요하므로, **앱 실행 후** API를 쓰려면 환경 변수 `JIRA_EMAIL`, `JIRA_API_TOKEN` 설정이 필요합니다.
- 예 (Windows CMD):  
  `set JIRA_EMAIL=your@email.com`  
  `set JIRA_API_TOKEN=your_token`  
  이후 `"Jira Dashboard 1.0.4.exe"` 실행.
- 또는 패키징 전에 `electron/main.ts`에서 env 대신 설정 파일/다른 소스를 읽도록 확장 가능 (보안 정책에 맞게 구성).
