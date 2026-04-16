# Alembic 初始化说明
# 
# 在项目根目录执行:
#   alembic init alembic
#
# 然后修改 alembic.ini 中的 sqlalchemy.url:
#   sqlalchemy.url = postgresql://kb_admin:changeme@localhost:5432/enterprise_kb
#
# 修改 alembic/env.py，导入 Base:
#   from app.core.database import Base
#   target_metadata = Base.metadata
#
# 生成迁移脚本:
#   alembic revision --autogenerate -m "initial"
#
# 执行迁移:
#   alembic upgrade head
#
# 注意: 第一阶段直接使用 scripts/init_db.sql 初始化即可，
# Alembic 在后续迭代开发中更有价值
