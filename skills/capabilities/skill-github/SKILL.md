---
name: skill-github
description: "GitHub operations via `gh` CLI and Git: issues, PRs, CI/CD workflow runs, code review, branch management, releases. Use when: (1) checking PR status or CI run results, (2) creating/commenting on issues or PRs, (3) managing branches and releases, (4) querying GitHub API, (5) setting up GitHub Actions workflows. NOT for: local git commit/push/pull (use git directly), non-GitHub repos, complex multi-file diffs (use coding-agent)."
---

# GitHub Skill

## 常用指令

### Pull Requests

```bash
# 列出 PR
gh pr list --repo owner/repo --state open

# 查 PR 詳情
gh pr view <PR-number> --repo owner/repo

# 查 CI 狀態
gh pr checks <PR-number> --repo owner/repo

# 建立 PR
gh pr create --title "feat: add CVS picker" --body "Description" --base main

# Merge PR
gh pr merge <PR-number> --squash --delete-branch
```

### Issues

```bash
# 列出 issues
gh issue list --label bug --state open

# 建立 issue
gh issue create --title "Title" --body "Description" --label "bug"

# 關閉 issue
gh issue close <issue-number>
```

### CI / GitHub Actions

```bash
# 列出 workflow runs
gh run list --workflow=deploy.yml --limit 10

# 查 run 狀態
gh run view <run-id>

# 看 run log
gh run view <run-id> --log

# 觸發 workflow
gh workflow run deploy.yml --ref main
```

### Releases

```bash
# 建立 release
gh release create v1.0.0 --title "v1.0.0" --notes "Release notes"

# 列出 releases
gh release list --limit 10
```

## GitHub Actions Workflow 模板（Node.js + K8s Deploy）

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm test

  build-push:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build & Push Docker image
        run: |
          docker build -t ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} .
          docker push ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}

  deploy:
    needs: build-push
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to K8s
        run: |
          kubectl set image deployment/${{ env.APP_NAME }} \
            ${{ env.APP_NAME }}=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} \
            -n lifecom-${{ env.PROJECT }}
          kubectl rollout status deployment/${{ env.APP_NAME }} \
            -n lifecom-${{ env.PROJECT }}
```

## Branch 管理規範

```bash
# 功能分支
git checkout -b feat/cvs-picker-callback

# Commit message 格式（Conventional Commits）
git commit -m "feat: add MCVS callback endpoint"
git commit -m "fix: handle UTF-8 encoding in store name"
git commit -m "chore: add K8s manifests for staging"

# PR 前確認
gh pr diff  # 查看變更
gh pr checks  # 確認 CI 通過
```

## GitHub API（gh api）

```bash
# 查 repo info
gh api repos/owner/repo

# 查 PR 列表（JSON 格式）
gh api repos/owner/repo/pulls --jq '.[].title'

# 加 label 到 issue
gh api repos/owner/repo/issues/123/labels -f label="priority:high"
```
