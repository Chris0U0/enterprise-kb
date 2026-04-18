"""
插入默认管理员（开发/演示）。首次部署执行一次：

  cd 项目根目录
  pip install -r requirements.txt
  python scripts/seed_default_user.py

默认账号：admin@example.com / admin123（生产环境请修改密码或删除）。
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


async def main() -> None:
    import uuid

    from sqlalchemy import select

    from app.core.config import get_settings
    from app.core.database import AsyncSessionLocal
    from app.core.security import hash_password
    from app.models.database import User

    settings = get_settings()
    org = uuid.UUID(settings.DEFAULT_ORG_ID)
    email = "admin@example.com"

    async with AsyncSessionLocal() as session:
        existing = (
            await session.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
        if existing:
            print(f"用户已存在: {email} id={existing.id}")
            return
        u = User(
            email=email,
            password_hash=hash_password("admin123"),
            name="管理员",
            role="admin",
            org_id=org,
            is_active=True,
        )
        session.add(u)
        await session.commit()
        print(f"已创建 {email} id={u.id}")


if __name__ == "__main__":
    asyncio.run(main())
