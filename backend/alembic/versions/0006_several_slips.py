"""Feedback names every slip in a reply (up to 4), each with its own category

Revision ID: 0006
Revises: 0005
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("replies", schema=None) as batch_op:
        batch_op.add_column(sa.Column("more_fixes", sa.JSON(), nullable=False, server_default="[]"))
        batch_op.add_column(sa.Column("corrected", sa.Text(), nullable=True))
    with op.batch_alter_table("stories", schema=None) as batch_op:
        batch_op.add_column(sa.Column("category", sa.String(length=24), nullable=True))
        batch_op.add_column(sa.Column("more_fixes", sa.JSON(), nullable=False, server_default="[]"))
        batch_op.add_column(sa.Column("corrected", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("stories", schema=None) as batch_op:
        batch_op.drop_column("corrected")
        batch_op.drop_column("more_fixes")
        batch_op.drop_column("category")
    with op.batch_alter_table("replies", schema=None) as batch_op:
        batch_op.drop_column("corrected")
        batch_op.drop_column("more_fixes")
