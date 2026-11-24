"""What she improved: the words she now says right that she got wrong before.

Used to highlight progress — after "Say it again" in a role-play, and on the summary when a line
she slipped on last time comes out right this time. Purely about her own earlier attempt: never
compared with anyone else, never a score.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from difflib import SequenceMatcher
from itertools import pairwise

_WORD = re.compile(r"[\w’']+", re.UNICODE)


def _words(text: str) -> list[str]:
    return [w.lower().replace("’", "'") for w in _WORD.findall(text)]


def _closest(text: str, target: list[str]) -> list[str]:
    """The sentence of `text` most like `target` (her replies may hold several sentences)."""
    sentences = [s for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()] or [text]
    return max((_words(s) for s in sentences), key=lambda w: SequenceMatcher(None, w, target).ratio())


def _added(before: list[str], better: list[str]) -> list[str]:
    """Words the fix puts in (or swaps in) compared with what she said."""
    out: list[str] = []
    for tag, _i1, _i2, j1, j2 in SequenceMatcher(None, before, better, autojunk=False).get_opcodes():
        if tag in ("insert", "replace"):
            out += better[j1:j2]
    return out


def _pairs(words: list[str]) -> set[tuple[str, str]]:
    return set(pairwise(words))


def _broken(old: list[str], better: list[str]) -> set[tuple[str, str]]:
    """Word pairs of hers that the fix splits or changes (leading/trailing words the fix just
    leaves out, like "Don't worry," before the sentence it corrects, don't count)."""
    out: set[tuple[str, str]] = set()
    for tag, i1, i2, _j1, _j2 in SequenceMatcher(None, old, better, autojunk=False).get_opcodes():
        if tag == "equal" or (tag == "delete" and (i1 == 0 or i2 == len(old))):
            continue
        for k in range(max(0, i1 - 1), min(len(old) - 1, i2)):
            out.add((old[k], old[k + 1]))
    return out


def improved_words(before: str, slips: Iterable[tuple[str, str]], after: str) -> list[str]:
    """The words of `after` that fix slips she made in `before`.

    `slips` are (wrong, better) pairs from the feedback on `before`. A slip counts as fixed when
    every word its fix adds is now in her sentence, next to at least one of the words the fix puts
    it beside, and none of the word pairs the fix broke ("she settle", "settle quickly" for "she
    will settle in quickly") is still there. Returns those
    words as she said them (for highlighting), in order.
    """
    said_after = _words(after)
    if not said_after:
        return []
    found: list[str] = []
    for _wrong, better in slips:
        target = _words(better)
        old = _closest(before, target)
        added = _added(old, target)
        if not added or not all(w in said_after for w in added):
            continue
        if _broken(old, target) & _pairs(said_after):
            continue
        # …and the fix's new words must sit where the fix puts them ("she has", "will settle"), not
        # just turn up somewhere in a different sentence.
        if not (_pairs(target) - _pairs(old)) & _pairs(said_after):
            continue
        found += [w for w in added if w not in found]
    # Back to the words as she said them, in the order she said them.
    original = _WORD.findall(after)
    return [w for i, w in enumerate(original) if said_after[i] in found and w not in original[:i]]
