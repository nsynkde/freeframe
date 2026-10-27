"""merge nsynk fork head with upstream v1.21 head

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9, c5d1f3a7b9e2
Create Date: 2026-10-27
"""
from typing import Sequence, Union

revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, Sequence[str], None] = ('d4e5f6a7b8c9', 'c5d1f3a7b9e2')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
