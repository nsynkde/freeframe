"""widen users.avatar_url to text (Google avatar URLs exceed 500 chars)

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-10-26
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('users', 'avatar_url', type_=sa.Text(), existing_nullable=True)


def downgrade() -> None:
    op.alter_column('users', 'avatar_url', type_=sa.String(500), existing_nullable=True)
