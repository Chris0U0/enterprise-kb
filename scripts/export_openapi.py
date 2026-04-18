"""
将 FastAPI OpenAPI schema 导出为 frontend/openapi.json，供 openapi-typescript 生成类型。

用法（仓库根目录）:  python scripts/export_openapi.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(root))
    from app.main import app

    out = root / "frontend" / "openapi.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(app.openapi(), ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
