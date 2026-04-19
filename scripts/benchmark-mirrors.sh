#!/usr/bin/env sh
# 比较 Debian apt / PyPI 镜像在本机网络上的首包耗时（TLS+下载小文件，多跑几次取体感更准）
# 用法：在项目根或任意目录执行
#   sh scripts/benchmark-mirrors.sh
#
# 若基础镜像换成 Debian 其它代号，可把下面 TRIXIE 改为 bookworm 等与 docker 基础镜像一致。

set -eu

CODENAME="${DEBIAN_CODENAME:-stable}"
echo "=== Debian InRelease（apt 相关，CODENAME=$CODENAME）==="
echo "(mirror) time_connect time_total"
for name_url in \
  "official|https://deb.debian.org/debian/dists/${CODENAME}/InRelease" \
  "aliyun|https://mirrors.aliyun.com/debian/dists/${CODENAME}/InRelease" \
  "tuna|https://mirrors.tuna.tsinghua.edu.cn/debian/dists/${CODENAME}/InRelease" \
  "ustc|https://mirrors.ustc.edu.cn/debian/dists/${CODENAME}/InRelease" \
  "tencent|https://mirrors.cloud.tencent.com/debian/dists/${CODENAME}/InRelease" \
  "163|https://mirrors.163.com/debian/dists/${CODENAME}/InRelease" \
  "huawei|https://repo.huaweicloud.com/debian/dists/${CODENAME}/InRelease"
do
  name="${name_url%%|*}"
  url="${name_url#*|}"
  out="$(curl -fsS -o /dev/null \
    --connect-timeout 8 --max-time 60 \
    -w "%{time_connect} %{time_total}" "$url" 2>/dev/null)" || out="failed"
  printf "%-12s %s\n" "$name" "$out"
done

echo ""
echo "=== PyPI simple 根目录（pip -i 相关）==="
for name_url in \
  "pypi.org|https://pypi.org/simple/" \
  "tuna|https://pypi.tuna.tsinghua.edu.cn/simple/" \
  "aliyun|https://mirrors.aliyun.com/pypi/simple/" \
  "ustc|https://mirrors.ustc.edu.cn/pypi/simple/" \
  "douban|https://pypi.doubanio.com/simple/" \
  "tencent|https://mirrors.cloud.tencent.com/pypi/simple/"
do
  name="${name_url%%|*}"
  url="${name_url#*|}"
  out="$(curl -fsS -o /dev/null \
    --connect-timeout 8 --max-time 60 \
    -w "%{time_connect} %{time_total}" "$url" 2>/dev/null)" || out="failed"
  printf "%-12s %s\n" "$name" "$out"
done

echo ""
echo "说明：time_total 越小通常越快；failed 表示超时或证书/网络问题。"
echo "可与 Dockerfile.base 对照：APT_MIRROR_HOST=mirrors.xxx.com 、PYPI_INDEX=https://.../simple"
