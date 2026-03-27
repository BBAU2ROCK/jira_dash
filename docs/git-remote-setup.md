# Git 원격 저장소 연결 (GitLab / GitHub)

## 1. Git 설치

- Windows: [Git for Windows](https://git-scm.com/download/win) 설치 후 터미널을 다시 연다.

---

## 2. 저장소 만들기

- **GitLab**: 그룹/프로젝트 생성 후 **Clone** 메뉴의 HTTPS URL을 복사한다.  
  예: `https://gitlab.com/your-group/01_jira_dash.git`
- **GitHub**: [New repository](https://github.com/new) 에서 저장소를 만들고 HTTPS URL을 복사한다.  
  예: `https://github.com/your-org/01_jira_dash.git`

---

## 3. 로컬 URL 파일 (한 번만)

같은 저장소에 **둘 중 하나만** 두면 된다. 둘 다 있으면 **`.gitlab-repo`가 우선**한다.

| 사용 | 복사 원본 | 로컬 파일명 |
|------|-----------|-------------|
| GitLab | `.gitlab-repo.example` | `.gitlab-repo` |
| GitHub | `.github-repo.example` | `.github-repo` |

파일 안에는 **주석(`#`)이 아닌 한 줄**에 clone URL만 넣는다.

---

## 4. 첫 연결 및 첫 푸시

프로젝트 루트에서:

```bash
npm run git:setup
```

- `git init`(필요 시), `origin` 설정, 첫 커밋·푸시까지 진행한다.

---

## 5. 수정 후 반영

```bash
npm run git:push
```

커밋 메시지를 지정하려면:

```bash
npm run git:push -- "feat: 결함 KPI 표 정렬"
```

- 기본적으로 **`origin`** 으로 푸시한다.
- **GitLab 미러**: GitHub를 `origin`으로 쓰면서 GitLab에도 올리려면 한 번만 다음을 실행한다.

```bash
git remote add gitlab https://gitlab.com/your-group/01_jira_dash.git
```

이후 `npm run git:push` 시 **`origin`과 `gitlab` 둘 다** 현재 브랜치로 푸시한다.

---

## 6. 요약

| 작업 | 명령 |
|------|------|
| 첫 연결 | `npm run git:setup` |
| 푸시 | `npm run git:push` |
| 커밋 메시지 지정 | `npm run git:push -- "메시지"` |

`.github-repo` / `.gitlab-repo` 는 `.gitignore`에 있어 저장소에 커밋되지 않는다.
