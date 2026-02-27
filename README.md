# Jira Dashboard (OKESTRO)

Electron 기반의 Jira 이슈 관리 및 시각화 대시보드 애플리케이션입니다. OKESTRO의 Jira 프로젝트 데이터를 효율적으로 모니터링하고 분석하기 위해 개발되었습니다.

## 🚀 주요 기능

### 1. 이슈 관리 및 시각화
- **Multi-Epic 선택**: 여러 에픽을 동시에 선택하여 관련 이슈들을 통합 조회할 수 있습니다.
- **계층 구조 유지**: 부모 이슈와 하위 작업(Subtask) 간의 관계를 시각적으로 유지하며 표시합니다.
- **이슈 상세 정보**: 선택한 이슈의 상세 설명, 히스토리, 코멘트 등을 확인할 수 있습니다.

### 2. 데이터 분석
- **지연율(Compliance Rate) 계산**: 완료 예정일(Due Date) 대비 실제 완료일(Resolution Date)을 분석하여 지연 여부를 판단합니다.
- **통계 대시보드**: 프로젝트별, 담당자별 이슈 현황 및 진행 상태를 통계적으로 시각화합니다.

### 3. 기술적 특징
- **CORS 프록시**: Jira API의 CORS 제한을 우회하기 위해 내부 Express 프록시 서버(`proxy-server.cjs`)를 사용합니다.
- **Electron 통합**: 웹 환경뿐만 아니라 데스크톱 설치형 애플리케이션으로도 활용 가능합니다.

## 🛠 시작하기

### 환경 설정
프로젝트 실행을 위해서는 Jira API 토큰 설정이 필요합니다.
- `proxy-server.cjs` 또는 `electron/main.ts` 내의 `JIRA_EMAIL` 및 `JIRA_API_TOKEN`을 본인의 정보로 업데이트하십시오.

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
Windows 설치 파일을 생성하려면 다음 명령어를 실행합니다.
```bash
npm run build
```
- 빌드 결과물은 `dist_electron` 폴더에 생성됩니다.
- **패치 내역**: 기능 변경·수정 사항은 [PATCH.md](./PATCH.md)를 참고하세요.

## 📁 프로젝트 구조
- `src/`: React 렌더러 소스 코드
- `electron/`: Electron 메인 프로세스 코드
- `proxy-server.cjs`: 개발용 CORS 프록시 서버
- `dist_electron/`: 빌드 및 패키징 결과물

## ⚠️ 주의 사항
- Jira API 엔드포인트는 최신 버전인 `/rest/api/3/search/jql`를 사용하며, 기존의 `/search`는 더 이상 사용되지 않습니다.
