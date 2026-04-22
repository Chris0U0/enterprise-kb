import asyncio
from app.core.database import engine
from app.models.database import Base

async def create_tables():
    async with engine.begin() as conn:
        # 这会自动识别 Base 中定义的、但在数据库中不存在的表并创建
        await conn.run_sync(Base.metadata.create_all)
    print("数据库表同步完成（chat_sessions, chat_messages 已创建）。")

if __name__ == "__main__":
    asyncio.run(create_tables())
