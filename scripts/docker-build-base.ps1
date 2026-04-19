# 构建 Python 依赖基础镜像（仅需在首次或 requirements.txt 变更后执行）
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $RepoRoot
Write-Host "Building enterprise-kb/python-deps:3.11 from Dockerfile.base ..." -ForegroundColor Cyan
docker build -f Dockerfile.base -t enterprise-kb/python-deps:3.11 .
Write-Host "Done. Next: docker compose build celery-worker celery-beat" -ForegroundColor Green
