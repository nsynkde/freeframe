"""add api_tokens table

Revision ID: 0fe83913a039
Revises: 8ca3dffea55f
Create Date: 2026-06-24 08:48:43.592845

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0fe83913a039'
down_revision: Union[str, Sequence[str], None] = '8ca3dffea55f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'api_tokens',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('token_hash', sa.String(64), nullable=False, unique=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_api_tokens_token_hash', 'api_tokens', ['token_hash'])


def downgrade() -> None:
    op.drop_index('ix_api_tokens_token_hash', table_name='api_tokens')
    op.drop_table('api_tokens')
