"""widen media_files.file_size_bytes to bigint (files > 2 GB overflowed int4)

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-10-26
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('media_files', 'file_size_bytes', type_=sa.BigInteger(), existing_nullable=False)


def downgrade() -> None:
    op.alter_column('media_files', 'file_size_bytes', type_=sa.Integer(), existing_nullable=False)
