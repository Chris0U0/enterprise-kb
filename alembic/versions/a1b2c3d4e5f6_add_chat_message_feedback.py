"""add chat_message feedback column

Revision ID: a1b2c3d4e5f6
Revises: 70e2fa885a1e
Create Date: 2026-06-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "70e2fa885a1e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "chat_messages",
        sa.Column("feedback", sa.String(length=10), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("chat_messages", "feedback")
