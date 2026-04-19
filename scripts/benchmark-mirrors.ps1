# 比较 Debian apt / PyPI 镜像在本机网络上的首包耗时（与 benchmark-mirrors.sh 同源列表）
# 用法（项目根目录）:
#   powershell -ExecutionPolicy Bypass -File scripts/benchmark-mirrors.ps1
#
# 依赖：Windows 10+ 自带的 curl.exe（在终端里请用 curl.exe，避免 PowerShell 把 curl 当成别名）

$ErrorActionPreference = "SilentlyContinue"
$Codename = if ($env:DEBIAN_CODENAME) { $env:DEBIAN_CODENAME } else { "stable" }

function Test-CurlTime([string]$Name, [string]$Url) {
    $out = & curl.exe -fsS -o NUL --connect-timeout 8 --max-time 60 -w "%{time_connect} %{time_total}" $Url 2>$null
    if ($LASTEXITCODE -ne 0) {
        return ("{0,-14} failed" -f $Name)
    }
    return ("{0,-14} {1}" -f $Name, $out.Trim())
}

Write-Host "=== Debian InRelease（apt 相关，CODENAME=$Codename）==="
Write-Host "(mirror)       time_connect time_total"
@(
    @{ n = "official"; u = "https://deb.debian.org/debian/dists/$Codename/InRelease" },
    @{ n = "aliyun"; u = "https://mirrors.aliyun.com/debian/dists/$Codename/InRelease" },
    @{ n = "tuna"; u = "https://mirrors.tuna.tsinghua.edu.cn/debian/dists/$Codename/InRelease" },
    @{ n = "ustc"; u = "https://mirrors.ustc.edu.cn/debian/dists/$Codename/InRelease" },
    @{ n = "tencent"; u = "https://mirrors.cloud.tencent.com/debian/dists/$Codename/InRelease" },
    @{ n = "163"; u = "https://mirrors.163.com/debian/dists/$Codename/InRelease" },
    @{ n = "huawei"; u = "https://repo.huaweicloud.com/debian/dists/$Codename/InRelease" }
) | ForEach-Object { Write-Host (Test-CurlTime $_.n $_.u) }

Write-Host ""
Write-Host "=== PyPI simple 根目录（pip -i 相关）==="
@(
    @{ n = "pypi.org"; u = "https://pypi.org/simple/" },
    @{ n = "tuna"; u = "https://pypi.tuna.tsinghua.edu.cn/simple/" },
    @{ n = "aliyun"; u = "https://mirrors.aliyun.com/pypi/simple/" },
    @{ n = "ustc"; u = "https://mirrors.ustc.edu.cn/pypi/simple/" },
    @{ n = "douban"; u = "https://pypi.doubanio.com/simple/" },
    @{ n = "tencent"; u = "https://mirrors.cloud.tencent.com/pypi/simple/" }
) | ForEach-Object { Write-Host (Test-CurlTime $_.n $_.u) }

Write-Host ""
Write-Host "说明：time_total 越小通常越快；failed 表示超时或网络问题。"
Write-Host "与 Dockerfile.base 对照：APT_MIRROR_HOST=... 、 PYPI_INDEX=https://.../simple"
