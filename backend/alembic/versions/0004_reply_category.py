"""Each grammar fix records what kind of slip it was (tense, agreement, article…)

Revision ID: 0004
Revises: 0003
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("replies", schema=None) as batch_op:
        batch_op.add_column(sa.Column("category", sa.String(length=24), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("replies", schema=None) as batch_op:
        batch_op.drop_column("category")
