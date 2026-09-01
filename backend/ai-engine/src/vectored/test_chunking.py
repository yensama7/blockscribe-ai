from chunking import chunk_text, clean_text, extract_abstract


def test_clean_fixes_ligatures_and_hyphenation():
    raw = "The ﬁrst eﬀect of the exam-\nple is signiﬁcant."
    assert clean_text(raw) == "The first effect of the example is significant."


def test_empty_text_gives_no_chunks():
    assert chunk_text("") == []
    assert chunk_text("   \n\n  ") == []


def test_chunks_overlap_and_cover_everything():
    words = " ".join(f"w{i}" for i in range(1200))
    chunks = chunk_text(words, target_tokens=500, overlap=0.15)
    assert len(chunks) >= 3
    assert chunks[0].text.startswith("w0")
    # overlap: each chunk starts before the previous one ends
    for prev, cur in zip(chunks, chunks[1:]):
        assert cur.start_word < prev.end_word
    # coverage: last chunk reaches the last word
    assert chunks[-1].text.endswith("w1199")


def test_short_text_is_one_chunk():
    chunks = chunk_text("just a few words here", target_tokens=500)
    assert len(chunks) == 1
    assert chunks[0].section == "body"


def test_section_headings_are_tracked():
    text = "Abstract\nThis paper studies goats.\n\nMethodology\n" + \
           " ".join(["method"] * 50) + "\n\nReferences\n[1] Someone 2020."
    chunks = chunk_text(text, target_tokens=30, overlap=0.0)
    sections = {c.section for c in chunks}
    assert "methodology" in sections


def test_extract_abstract_prefers_heading():
    text = "Title line\nAbstract\nGoat farming at scale.\nIntroduction\nLots more text."
    assert extract_abstract(text) == "Goat farming at scale."


def test_extract_abstract_falls_back_to_opening_words():
    text = " ".join(f"w{i}" for i in range(500))
    abstract = extract_abstract(text, max_words=100)
    assert abstract.startswith("w0") and abstract.endswith("w99")
