"""Text cleaning and chunking. Written before the search logic on purpose:
chunk boundaries determine everything downstream (restructure.md §5)."""

import re
from dataclasses import dataclass

# PDF extraction artifacts: ligatures and hyphenation across line breaks.
_LIGATURES = {
    "ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl",
    "ﬃ": "ffi", "ﬄ": "ffl", "­": "",
}

_SECTION_HEADINGS = (
    "abstract", "introduction", "background", "literature review",
    "methodology", "methods", "materials and methods", "results",
    "discussion", "conclusion", "conclusions", "acknowledgements",
    "acknowledgments", "references", "bibliography", "appendix",
)

_HEADING_RE = re.compile(
    r"^\s*(?:\d+[\.\)]?\s+)?(" + "|".join(_SECTION_HEADINGS) + r")\s*:?\s*$",
    re.IGNORECASE,
)


def clean_text(text: str) -> str:
    """Normalise raw PDF text: ligatures, hyphenation across line breaks,
    collapsed whitespace (line structure kept so headings stay detectable)."""
    for lig, repl in _LIGATURES.items():
        text = text.replace(lig, repl)
    # "exam-\nple" -> "example"
    text = re.sub(r"(\w)-\s*\n\s*(\w)", r"\1\2", text)
    # collapse horizontal whitespace but keep newlines
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


@dataclass
class Chunk:
    index: int
    text: str
    section: str
    start_word: int
    end_word: int


def _sectioned_words(text: str) -> list[tuple[str, str]]:
    """Flatten cleaned text into (word, section) pairs, tracking the
    last-seen section heading line."""
    words: list[tuple[str, str]] = []
    section = "body"
    for line in text.split("\n"):
        m = _HEADING_RE.match(line)
        if m:
            section = m.group(1).lower().replace(" ", "_")
            continue
        for w in line.split():
            words.append((w, section))
    return words


def chunk_text(text: str, target_tokens: int = 500, overlap: float = 0.15) -> list[Chunk]:
    """Overlapping word-window chunks (~500 tokens, 15% overlap by default).

    ponytail: words-as-tokens, not a real tokenizer — close enough for chunk
    sizing; swap in the embedder's tokenizer if chunk lengths ever matter.
    """
    cleaned = clean_text(text)
    words = _sectioned_words(cleaned)
    if not words:
        return []

    step = max(1, int(target_tokens * (1 - overlap)))
    chunks: list[Chunk] = []
    start = 0
    while start < len(words):
        window = words[start : start + target_tokens]
        # section = the section most of the window's words belong to
        counts: dict[str, int] = {}
        for _, s in window:
            counts[s] = counts.get(s, 0) + 1
        section = max(counts, key=counts.get)
        chunks.append(
            Chunk(
                index=len(chunks),
                text=" ".join(w for w, _ in window),
                section=section,
                start_word=start,
                end_word=start + len(window),
            )
        )
        if start + target_tokens >= len(words):
            break
        start += step
    return chunks


def extract_abstract(text: str, max_words: int = 300) -> str:
    """The abstract section if a heading is found, else the opening words.
    Used for the one abstract-level vector per paper."""
    cleaned = clean_text(text)
    words = _sectioned_words(cleaned)
    abstract = [w for w, s in words if s == "abstract"]
    if abstract:
        return " ".join(abstract[:max_words])
    return " ".join(w for w, _ in words[:max_words])
