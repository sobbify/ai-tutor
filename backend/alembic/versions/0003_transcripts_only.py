"""Transcripts only: audio is never stored, so the opt-in recordings table and setting go

Revision ID: 0003
Revises: 0002
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import ai_tutor.db

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("recordings", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_recordings_learner_id"))
    op.drop_table("recordings")
    with op.batch_alter_table("learners", schema=None) as batch_op:
        batch_op.drop_column("keep_recordings")


def downgrade() -> None:
    with op.batch_alter_table("learners", schema=None) as batch_op:
        batch_op.add_column(sa.Column("keep_recordings", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table(
        "recordings",
        sa.Column("reply_id", sa.Integer(), nullable=False),
        sa.Column("learner_id", sa.Integer(), nullable=False),
        sa.Column("mime", sa.String(length=40), nullable=False),
        sa.Column("path", sa.String(length=300), nullable=False),
        sa.Column("created_at", ai_tutor.db.UTCDateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["learner_id"], ["learners.id"], name=op.f("fk_recordings_learner_id_learners"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["reply_id"], ["replies.id"], name=op.f("fk_recordings_reply_id_replies"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("reply_id", name=op.f("pk_recordings")),
    )
    with op.batch_alter_table("recordings", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_recordings_learner_id"), ["learner_id"], unique=False)
