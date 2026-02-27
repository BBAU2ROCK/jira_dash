# GitHub 연결 및 소스 올리기

## 1. Git 설치

- https://git-scm.com/download/win 에서 설치 후 **터미널(PowerShell/CMD)을 다시 연다**.

---

## 2. GitHub 저장소 만들기

1. https://github.com/new 접속 후 로그인.
2. **Repository name**: `01_jira_dash` (또는 원하는 이름).
3. **Public** 선택 후 **Create repository** 클릭.
4. 생성된 페이지에서 저장소 URL 복사  
   예: `https://github.com/BBAU2ROCK/jira_dash.git`

---

## 3. 첫 연결 (한 번만)

1. 프로젝트 폴더에서 **`.github-repo.example`** 을 **`.github-repo`** 로 **복사**한다.
2. **`.github-repo`** 파일이 이미 있으면(저장소 URL이 설정됨) 그대로 둔다.  
   없으면 `.github-repo.example` 을 `.github-repo` 로 복사한 뒤, 한 줄에 저장소 URL 입력.  
   예: `https://github.com/BBAU2ROCK/jira_dash.git`
3. 터미널에서 실행:
   ```bash
   npm run git:setup
   ```
   - Git 초기화, 원격 추가, 첫 커밋·푸시까지 한 번에 진행된다.

---

## 4. 수정 후 반영 (매번)

코드 수정 후 GitHub에 올리려면:

```bash
npm run git:push
```

커밋 메시지를 직접 쓰려면:

```bash
npm run git:push -- "feat: 이슈 상세 필터 추가"
```

- `git add .` → `git commit` → `git push` 가 순서대로 실행된다.

---

## 5. 요약

| 작업           | 명령어              |
|----------------|---------------------|
| GitHub 첫 연결 | `npm run git:setup` |
| 수정 후 푸시   | `npm run git:push`  |
| 커밋 메시지 지정 | `npm run git:push -- "메시지"` |

---

## 6. 참고

- **.gitignore** 에 따라 `node_modules`, `dist`, `dist_electron`, `dist_electron` 등은 올라가지 않는다.
- **.github-repo** 는 개인 저장소 URL용이라 `.gitignore`에 포함되어 있어, 커밋되지 않는다.
- Jira API 토큰은 코드에 없고 환경 변수로만 사용하므로, 저장소에 비밀은 올라가지 않는다.
