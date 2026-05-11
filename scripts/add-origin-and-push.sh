#!/usr/bin/env bash
# GitHub/GitLab 등에서 만든 빈 저장소의 HTTPS 또는 SSH URL을 넘겨 주세요.
# 사용 예:
#   ./scripts/add-origin-and-push.sh https://github.com/계정/저장소.git
#   ./scripts/add-origin-and-push.sh git@github.com:계정/저장소.git
set -euo pipefail
cd "$(dirname "$0")/.."
URL="${1:-}"
if [[ -z "$URL" ]]; then
  echo "사용법: $0 <원격-저장소-URL>"
  echo "예: $0 https://github.com/myname/haoting.git"
  exit 1
fi

if git remote get-url origin &>/dev/null; then
  echo "origin 이 이미 있습니다:"
  git remote -v
  echo "푸시합니다..."
  git push -u origin main
else
  git remote add origin "$URL"
  git push -u origin main
fi
