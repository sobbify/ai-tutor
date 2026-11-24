"""Practice groups: up to 5 named teachers from one centre; each teacher's centre comes from the host app

Revision ID: 0005
Revises: 0004
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

import ai_tutor.db

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("learners", schema=None) as batch_op:
        batch_op.add_column(sa.Column("centre", sa.String(length=64), nullable=True))
        batch_op.create_index(batch_op.f("ix_learners_centre"), ["centre"], unique=False)

    op.create_table(
        "groups",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=12), nullable=False),
        sa.Column("name", sa.String(length=40), nullable=False),
        sa.Column("centre", sa.String(length=64), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", ai_tutor.db.UTCDateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["created_by"], ["learners.id"], name=op.f("fk_groups_created_by_learners"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_groups")),
        sa.UniqueConstraint("code", name=op.f("uq_groups_code")),
    )
    with op.batch_alter_table("groups", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_groups_centre"), ["centre"], unique=False)

    op.create_table(
        "group_members",
        sa.Column("learner_id", sa.Integer(), nullable=False),
        sa.Column("group_id", sa.Integer(), nullable=False),
        sa.Column("joined_at", ai_tutor.db.UTCDateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["group_id"], ["groups.id"], name=op.f("fk_group_members_group_id_groups"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["learner_id"], ["learners.id"], name=op.f("fk_group_members_learner_id_learners"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("learner_id", name=op.f("pk_group_members")),
    )
    with op.batch_alter_table("group_members", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_group_members_group_id"), ["group_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("group_members", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_group_members_group_id"))
    op.drop_table("group_members")
    with op.batch_alter_table("groups", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_groups_centre"))
    op.drop_table("groups")
    with op.batch_alter_table("learners", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_learners_centre"))
        batch_op.drop_column("centre")
