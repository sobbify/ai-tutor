"""API schemas. JSON is camelCase to match the frontend's zod schemas (src/types/tutor.ts)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel


class Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


# ---- content ----------------------------------------------------------------------------

MomentIcon = Literal["sun", "backpack", "chat", "handshake", "school", "phone", "bandage", "star"]
MomentKind = Literal["programme", "anytime", "baseline"]


class SentenceHint(Camel):
    kind: Literal["sentence"]
    text: str = Field(min_length=1, max_length=500)


class StartersHint(Camel):
    kind: Literal["starters"]
    options: list[str] = Field(min_length=1, max_length=6)


Hint = SentenceHint | StartersHint


class CharacterOut(Camel):
    name: str
    role: str
    initials: str
    poster_url: str | None


class TurnOut(Camel):
    id: str
    parent_line: str
    hint: Hint = Field(discriminator="kind")
    video_url: str | None
    # How the parent comes across on this line (for the avatar's face); follows the line's level.
    mood: Literal["calm", "worried", "upset"] = "calm"


class LessonPhrase(Camel):
    text: str = Field(min_length=1, max_length=300)
    note: str = Field(default="", max_length=80)


class Lesson(Camel):
    """The "Learn" step before a role-play: key phrases and one grammar tip (FR-8, FR-12)."""

    title: str = Field(min_length=1, max_length=120)
    intro: str = Field(default="", max_length=300)
    phrases: list[LessonPhrase] = Field(default_factory=list, max_length=8)
    tip: str = Field(default="", max_length=300)


class MomentOut(Camel):
    id: str
    title: str
    order: int
    icon: MomentIcon
    kind: MomentKind
    week: int | None
    scene: str
    character: CharacterOut
    lesson: Lesson | None
    turns: list[TurnOut]


# ---- practice -----------------------------------------------------------------------------


class GrammarFix(Camel):
    wrong: str
    better: str


class Slip(Camel):
    """One more grammar slip in the same reply, beyond the main `fix` (each about one change)."""

    wrong: str
    better: str
    tip: str | None = None
    category: str | None = None


class Feedback(Camel):
    heard: bool
    positives: list[str]
    fix: GrammarFix | None  # the most important slip
    tip: str | None = None  # one-line grammar micro-lesson with the fix
    category: str | None = None  # tense, agreement, article… (badge on the correction card)
    more_fixes: list[Slip] = []  # other slips, most important first (up to 3)
    corrected: str | None = None  # her whole reply with every slip fixed, when there are several


class ReplyOut(Camel):
    id: int | None  # null when nothing was stored (not heard)
    turn_id: str
    transcript: str
    feedback: Feedback
    attempt: int
    typed: bool = False
    # After "Say it again": the words she now says right that she slipped on last attempt
    improved: list[str] = []


class RunOut(Camel):
    moment_id: str
    run_number: int
    turn_index: int
    turn_ids: list[str]  # this run's lines (they depend on its hidden level, or "Rehearse now")
    kind: Literal["full", "quick"]
    replies: list[ReplyOut]
    completed: bool


class MomentProgress(Camel):
    id: str
    title: str
    order: int
    icon: MomentIcon
    kind: MomentKind
    week: int | None
    status: Literal["locked", "available", "in_progress", "done"]
    responses_total: int
    responses_done: int
    times_practised: int
    first_try: list[bool] | None
    latest: list[bool] | None


class LearnerOut(Camel):
    first_name: str


Trend = Literal["fewer", "same", "more"]


class Trends(Camel):
    """Gentle trends, her first sessions against her latest (never a grade)."""

    days_practised: int
    fillers: Trend | None
    grammar_slips: Trend | None


class ProgressOut(Camel):
    learner: LearnerOut
    moments: list[MomentProgress]
    trends: Trends


class PractiseItem(Camel):
    turn_id: str
    transcript: str
    fix: GrammarFix
    tip: str | None = None
    category: str | None = None
    more_fixes: list[Slip] = []
    corrected: str | None = None


class MomentRef(Camel):
    id: str
    title: str


# ---- snowflakes (XP for effort) -------------------------------------------------------------

SnowflakeKind = Literal["finished", "quick", "again", "story", "daily"]


class SnowflakeItem(Camel):
    kind: SnowflakeKind
    amount: int


class SnowflakesEarned(Camel):
    """What one session earned (shown at its end, like Duolingo's XP screen) and her week so far."""

    earned: int
    items: list[SnowflakeItem]
    week: int


class SnowflakesOut(Camel):
    total: int
    week: int


class ImprovedItem(Camel):
    """A line she got right after slipping on it: on another try, or since her last run."""

    turn_id: str
    when: Literal["again", "last_time"]
    before: str  # what she said then
    before_wrongs: list[str]  # the slips in it (to underline)
    after: str  # what she said now
    words: list[str]  # the words she fixed (to highlight)


class SummaryOut(Camel):
    moment_id: str
    title: str
    first_completion: bool
    unlocked: MomentRef | None
    next_moment_id: str | None
    practise: list[PractiseItem]
    previous_practise_count: int | None
    snowflakes: SnowflakesEarned | None = None
    improved: list[ImprovedItem] = []


class StartRunIn(Camel):
    restart: bool = False
    quick: bool = False  # "Rehearse now": the first few lines, about 5 minutes


# ---- home, onboarding, preferences ---------------------------------------------------------------

HHMM = r"^([01]\d|2[0-3]):[0-5]\d$"


class ProgrammeOut(Camel):
    day: int
    total_days: int
    week: int
    week_title: str
    days_practised: int
    practised_today: bool
    harder_today: bool
    complete: bool


class StreakOut(Camel):
    days: int
    practised_today: bool


class Recommendation(Camel):
    moment_id: str
    title: str
    reason: Literal["continue", "hardest", "week", "harder"]


class HomeGroupOut(Camel):
    name: str
    members: int
    week_total: int
    week_goal: int


class HomeOut(Camel):
    learner: LearnerOut
    consented: bool
    baseline_done: bool
    programme: ProgrammeOut
    streak: StreakOut
    recommended: Recommendation | None
    story_suggested: bool
    certificate_earned: bool
    snowflakes: SnowflakesOut = SnowflakesOut(total=0, week=0)
    group: HomeGroupOut | None = None
    # PRD: the group invite comes when she finishes the programme or 30 days after joining.
    group_invite: bool = False


class PreferencesOut(Camel):
    quiet_mode: bool
    nudge_time: str | None
    hardest_moment_id: str | None
    consented: bool


class PreferencesIn(Camel):
    quiet_mode: bool | None = None
    nudge_time: str | None = Field(default=None, pattern=HHMM)
    clear_nudge: bool = False
    hardest_moment_id: str | None = Field(default=None, max_length=64)


class OnboardingIn(Camel):
    consent: Literal[True]
    hardest_moment_id: str | None = Field(default=None, max_length=64)


# ---- phrasebook, stories, certificate ------------------------------------------------------------


class PhraseIn(Camel):
    text: str = Field(min_length=1, max_length=400)
    moment_id: str | None = Field(default=None, max_length=64)


class PhraseOut(Camel):
    id: int
    text: str
    source: str
    moment_id: str | None
    created_at: datetime


class StoryOut(Camel):
    id: int | None
    heard: bool
    transcript: str
    positives: list[str]
    fix: GrammarFix | None
    tip: str | None
    better_line: str | None
    created_at: datetime | None
    snowflakes: int = 0
    category: str | None = None
    more_fixes: list[Slip] = []
    corrected: str | None = None


class StoryIn(Camel):
    text: str = Field(min_length=1, max_length=3000)


class CertificateOut(Camel):
    earned: bool
    name: str
    earned_at: datetime | None
    moments: list[str]
    days_practised: int
    days_needed: int
    moments_left: list[str]


# ---- sign-in ---------------------------------------------------------------------------------

UID_PATTERN = r"^[A-Za-z0-9_@-](?:[A-Za-z0-9_.@-]{0,126}[A-Za-z0-9_@-])?$"  # same rule as the Live tutor


class EntryIn(Camel):
    """Query of /in, filled in by the host app."""

    uid: str = Field(min_length=1, max_length=128, pattern=UID_PATTERN)
    name: str = Field(min_length=1, max_length=80)
    # Her centre's ID in Buddy's World. Optional: without it, she can't join a group.
    centre: str | None = Field(default=None, max_length=64, pattern=UID_PATTERN)

    @field_validator("uid")
    @classmethod
    def _uid(cls, v: str) -> str:
        if ".." in v:
            raise ValueError("ID can't contain '..'")
        return v

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v or any(ord(c) < 32 for c in v) or any(c in v for c in "<>"):
            raise ValueError("Enter a valid name.")
        return v


class MeOut(Camel):
    uid: str
    name: str
    first_name: str


class AdminLoginIn(Camel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=200)


class AdminMeOut(Camel):
    username: str


# ---- groups ----------------------------------------------------------------------------------

GROUP_CODE = r"^[A-Za-z0-9 -]{4,16}$"


class GroupMemberOut(Camel):
    """What group members see of each other: name and effort. Never feedback, transcripts or levels."""

    name: str
    first_name: str
    is_me: bool
    week_snowflakes: int
    practised_today: bool


class GroupOut(Camel):
    name: str
    code: str
    members: list[GroupMemberOut]
    max_members: int
    week_total: int
    week_goal: int
    created_by_me: bool


class GroupStatusOut(Camel):
    group: GroupOut | None
    # False when the host app hasn't told us her centre: groups only mix teachers of one centre.
    can_join: bool


class GroupCreateIn(Camel):
    name: str = Field(min_length=1, max_length=40)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v or any(ord(c) < 32 for c in v) or any(c in v for c in "<>"):
            raise ValueError("Enter a group name.")
        return v


class GroupJoinIn(Camel):
    code: str = Field(pattern=GROUP_CODE)
