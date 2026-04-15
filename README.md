# Jira Dashboard (OKESTRO)

Electron 기반의 Jira 이슈 관리 및 시각화 대시보드 애플리케이션입니다. OKESTRO의 Jira 프로젝트 데이터를 효율적으로 모니터링하고 분석하기 위해 개발되었습니다.

## 🚀 주요 기능

### 1. 이슈 관리 및 시각화
- **Multi-Epic 선택**: 여러 에픽을 동시에 선택하여 관련 이슈들을 통합 조회할 수 있습니다.
- **계층 구조 유지**: 부모 이슈와 하위 작업(Subtask) 간의 관계를 시각적으로 유지하며 표시합니다.
- **이슈 상세 정보**: 선택한 이슈의 상세 설명, 히스토리, 코멘트 등을 확인할 수 있습니다.
- **수정**: 이슈 상세에서 우선순위·난이도 등 일부 필드 수정 가능. 신규 이슈(에픽/할 일/하위 작업) 등록 기능은 미구현. (자세한 내용은 `docs/implementation-verification.md` §6 참고)

### 2. 데이터 분석
- **지연율(Compliance Rate) 계산**: 완료 예정일(Due Date) 대비 실제 완료일(Resolution Date)을 분석하여 지연 여부를 판단합니다.
- **통계 대시보드**: 프로젝트별, 담당자별 이슈 현황 및 진행 상태를 통계적으로 시각화합니다.

### 3. 기술적 특징
- **CORS 프록시**: Jira API의 CORS 제한을 우회하기 위해 내부 Express 프록시 서버(`proxy-server.cjs`)를 사용합니다.
- **Electron 통합**: 웹 환경뿐만 아니라 데스크톱 설치형 애플리케이션으로도 활용 가능합니다.

## 🛠 시작하기

### 요구 사항

- **Node.js** 20 이상 (`package.json`의 `engines` 참고)

### 설치

```bash
npm install
```

웹 모드에서 Jira API를 쓰려면 프록시 설정 파일이 필요합니다.

```bash
npm run setup
```

- `jira-proxy-config.json`이 없을 때만 `jira-proxy-config.example.json`을 복사합니다. 생성 후 **이메일·API 토큰**을 수정하세요. (파일은 `.gitignore`에 포함되어 커밋되지 않습니다.)
- 한 번에 설치+설정: `npm run setup:all`

**Electron**: `JIRA_EMAIL`, `JIRA_API_TOKEN` 환경 변수 또는 앱 userData의 `jira-config.json`을 사용합니다. 자세한 내용은 `proxy-server.cjs` / `electron/main.ts` 주석을 참고하세요.

### npm 스크립트 요약

| 명령 | 설명 |
|------|------|
| `npm run setup` | `jira-proxy-config.json` 자동 생성(없을 때만) |
| `npm run setup:all` | `npm install` 후 `setup` |
| `npm run dev` | Electron + Vite 개발 |
| `npm run dev:web` | 브라우저 + 내장 프록시 |
| `npm run start` | 별도 터미널 프록시 + Vite |
| `npm run build` | 아이콘·타입체크·Vite·electron-builder |
| `npm run clean` | `dist_electron` 내 언팩 폴더만 정리 |
| `npm run build:install` | clean 후 build |
| `npm run git:setup` | Git 초기화·origin·첫 푸시(Windows PowerShell) |
| `npm run git:push` | add·commit·push (`gitlab` 원격 있으면 동시 푸시) |

### Git 원격 (GitLab / GitHub)

첫 연결·푸시 절차는 [docs/git-remote-setup.md](./docs/git-remote-setup.md)를 참고하세요.

### 개발 서버 실행

#### Web 모드 (브라우저 확인)
```bash
npm run dev:web
```
- 실행 후 [http://localhost:5173](http://localhost:5173)에서 확인 가능합니다.
- 이 모드에서는 자동으로 로컬 프록시 서버가 실행됩니다.

#### Electron 모드 (데스크톱 앱)
```bash
npm run dev
```

### 빌드 및 패키징
Windows 설치 파일·포터블 실행 파일을 만들려면 프로젝트 루트에서:

```bash
npm run build
```

언팩 폴더만 정리한 뒤 다시 빌드하려면:

```bash
npm run build:install
```

- **출력 폴더**: `dist_electron\`
- **포터블 / NSIS**: `dist_electron` 루트의 `.exe` 파일(이름은 electron-builder 기본 규칙·버전에 따름). 두 타깃이 함께 빌드되면 파일명이 서로 다르게 생성됩니다.
- **설치·배포 시 동봉 문서** (설치/포터블 폴더에서 실행 파일과 같은 디렉터리): `INSTALL-KO.txt`, `jira-proxy-config.example.json`
- **electron-builder 설정**: `package.json` 의 `build` 필드, 커스텀 NSIS: `build/installer.nsh`
- **패치 내역**: [PATCH.md](./PATCH.md)

## 📁 프로젝트 구조
- `src/`: React 렌더러 소스 코드
- `electron/`: Electron 메인 프로세스 코드
- `proxy-server.cjs`: 개발용 CORS 프록시 서버
- `dist_electron/`: 빌드 및 패키징 결과물

## ⚠️ 주의 사항
- Jira API 엔드포인트는 최신 버전인 `/rest/api/3/search/jql`를 사용하며, 기존의 `/search`는 더 이상 사용되지 않습니다.
