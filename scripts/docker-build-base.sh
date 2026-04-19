#!/usr/bin/env sh
# 构建 Python 依赖基础镜像（首次或 requirements.txt 变更后执行）
set -eu
cd "$(dirname "$0")/.."
echo "Building enterprise-kb/python-deps:3.11 from Dockerfile.base ..."
docker build -f Dockerfile.base -t enterprise-kb/python-deps:3.11 .
echo "Done. Next: docker compose build celery-worker celery-beat"
