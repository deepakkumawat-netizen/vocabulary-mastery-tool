import re

GRADE_PROFILES = {
    1: {
        "vocab":           "high-frequency sight words (Dolch/Fry list) and simple CVC phonics words (1 syllable)",
        "sentence":        "3-5 words; very short, simple subject-verb sentences",
        "fk_target":       "1.0-1.5",
        "blooms":          "Remember (recall) only — name, say, point to",
        "dok":             "DOK 1 — recall and reproduction",
        "definition_style":"1 very short sentence using only Kindergarten-Grade 1 words; e.g. 'A cat is a pet.'",
        "example_style":   "immediate world of a 6-7 year old: home, family, toys, animals, colors",
        "hint_style":      "simple visual prompts; 'Draw and write one word about this.'",
        "sentence_example":"very short: 'The cat sat on the mat.'",
        "word_instruction": "Use ONLY high-frequency sight words (Dolch/Fry list) and simple CVC phonics words. Every word must be decodable or on a Grade 1 sight-word list.",
    },
    2: {
        "vocab":           "Grade 2 phonics patterns (CVCe, digraphs, blends) and common irregular sight words (1-2 syllables)",
        "sentence":        "4-7 words; simple sentences with familiar nouns and action verbs",
        "fk_target":       "1.5-2.5",
        "blooms":          "Remember and Understand — recall, identify, describe in simple terms",
        "dok":             "DOK 1 — recall and reproduction",
        "definition_style":"1 simple sentence using Grade 1-2 words with a familiar example; e.g. 'Hope means you want something good to happen.'",
        "example_style":   "daily life of a 7-8 year old: school day, friends, simple nature, family routines",
        "hint_style":      "concrete prompts; 'Write a sentence about something you did today using this word.'",
        "sentence_example":"simple: 'The dog ran fast down the road.'",
        "word_instruction": "Use CVCe long-vowel words, common digraphs, and high-frequency irregular words appropriate for Grade 2. Avoid words with 3+ syllables.",
    },
    3: {
        "vocab":           "simple, concrete everyday words (1-2 syllables); words children see in daily life",
        "sentence":        "5-8 words; short direct sentences with one idea each",
        "fk_target":       "2.5-3.5",
        "blooms":          "Remember (recall) and Understand (describe in own words)",
        "dok":             "DOK 1 — recall and reproduction",
        "definition_style":"1 simple sentence using only Grade 2-3 words; e.g. 'A habitat is where an animal lives.'",
        "example_style":   "daily life of an 8-9 year old: home, school, playground, pets",
        "hint_style":      "simple action prompts; 'Write about something you see every day.'",
        "sentence_example":"short, simple, concrete: 'The dog ran fast.'",
        "word_instruction": "Choose ONLY words a Grade 3 student (age 8-9) encounters in class. Avoid complex multisyllabic words.",
    },
    4: {
        "vocab":           "basic academic words (2-3 syllables); familiar content-area words",
        "sentence":        "6-10 words; simple with occasional compound sentences",
        "fk_target":       "3.5-4.5",
        "blooms":          "Remember and Understand; 1-2 Apply tasks",
        "dok":             "DOK 1-2 — recall and skill/concept",
        "definition_style":"1-2 simple sentences; connect to what student already knows",
        "example_style":   "relatable to 9-10 year olds: school, local nature, basic experiments",
        "hint_style":      "concrete action prompts; 'Write about a time you saw this.'",
        "sentence_example":"simple and concrete: 'The scientist studied the rock sample carefully.'",
        "word_instruction": "Choose Tier 2 academic words appropriate for Grade 4. Definitions must use simpler words than the target word.",
    },
    5: {
        "vocab":           "grade-appropriate academic words (2-4 syllables); Tier 2 vocabulary; content-area terms",
        "sentence":        "8-12 words; mix of simple and compound sentences",
        "fk_target":       "4.5-5.5",
        "blooms":          "Understand and Apply; 1-2 Analyze tasks",
        "dok":             "DOK 2 — skill and concept",
        "definition_style":"clear definition with 1 example; show root word if helpful",
        "example_style":   "relevant to 10-11 year olds: science class, historical events, books",
        "hint_style":      "specific context prompts; 'Write about how this word relates to what you learned in science.'",
        "sentence_example":"informational: 'The ecosystem depends on producers and consumers to stay balanced.'",
        "word_instruction": "Use Tier 2 academic words appearing across subjects. Include 2-3 Tier 3 content-specific words.",
    },
    6: {
        "vocab":           "academic and domain-specific words; multi-syllabic Tier 2-3 vocabulary",
        "sentence":        "10-14 words; compound and complex sentences",
        "fk_target":       "5.5-6.5",
        "blooms":          "Apply and Analyze; 1-2 Evaluate tasks",
        "dok":             "DOK 2-3 — strategic thinking",
        "definition_style":"precise academic definition; show word family; hint at etymology",
        "example_style":   "middle school: social issues, scientific phenomena, current events",
        "hint_style":      "analytical prompts; 'Explain how this concept affects something in real life.'",
        "sentence_example":"analytical: 'The government's policy had significant consequences for the local community.'",
        "word_instruction": "Use Tier 2-3 academic vocabulary. Definitions should be precise and include context clues.",
    },
    7: {
        "vocab":           "intermediate academic vocabulary; discipline-specific Tier 2-3 words; abstract concepts",
        "sentence":        "12-16 words; varied complex sentences with subordinate clauses",
        "fk_target":       "6.5-7.5",
        "blooms":          "Analyze and Evaluate",
        "dok":             "DOK 3 — strategic and extended thinking",
        "definition_style":"nuanced definitions; connotation vs denotation; multiple contexts",
        "example_style":   "relevant to 12-13 year olds: media, technology, STEM, social justice",
        "hint_style":      "analytical/evaluative prompts; 'Analyze how this concept influences a real-world situation.'",
        "sentence_example":"complex: 'Although scientists have debated the theory for decades, recent evidence suggests a more nuanced explanation.'",
        "word_instruction": "Use academic vocabulary from standardized tests and textbooks. Include connotation notes where relevant.",
    },
    8: {
        "vocab":           "advanced academic vocabulary; abstract concepts; discipline-specific academic language",
        "sentence":        "12-18 words; varied complex structures; subordinate and relative clauses",
        "fk_target":       "7.5-8.5",
        "blooms":          "Analyze, Evaluate, and introductory Create",
        "dok":             "DOK 3-4 — extended thinking",
        "definition_style":"sophisticated definitions; semantic fields; register and connotation",
        "example_style":   "high school preparation: civic participation, scientific research, literary analysis",
        "hint_style":      "evaluative/creative prompts; 'Construct an argument using this concept as evidence.'",
        "sentence_example":"sophisticated: 'The paradoxical nature of the phenomenon challenged the prevailing scientific consensus.'",
        "word_instruction": "Use pre-AP level vocabulary. Words should challenge while remaining accessible with context. Definitions should model academic language.",
    },
    9: {
        "vocab":           "complex academic and literary words; technical terminology; abstract vocabulary",
        "sentence":        "15-20 words; complex compound-complex sentences; participial phrases",
        "fk_target":       "8.5-9.5",
        "blooms":          "Evaluate and Create",
        "dok":             "DOK 3-4",
        "definition_style":"precise scholarly definitions; etymology; field of use; formal register",
        "example_style":   "pre-college: academic writing, research contexts, professional fields",
        "hint_style":      "synthesis prompts; 'Synthesize this concept with a related idea from another discipline.'",
        "sentence_example":"scholarly: 'The epistemological framework underpinning the research methodology necessitates a rigorous examination of the underlying assumptions.'",
        "word_instruction": "Use SAT/AP level vocabulary. Include word origin when it clarifies meaning. Definitions should be scholarly and precise.",
    },
    10: {
        "vocab":           "sophisticated multisyllabic vocabulary; discipline-specific academic language; college-prep",
        "sentence":        "15-22 words; sophisticated syntax; embedded clauses; parallel structure",
        "fk_target":       "9.5-10.5",
        "blooms":          "Evaluate and Create at high levels",
        "dok":             "DOK 4 — extended thinking",
        "definition_style":"collegiate definitions; scholarly nuance; disciplinary usage",
        "example_style":   "college-readiness: academic research, professional contexts, global issues",
        "hint_style":      "scholarly prompts; 'Evaluate the validity of using this concept in academic argumentation.'",
        "sentence_example":"collegiate: 'The dialectical tension between theoretical paradigms reflects the broader epistemological debates within the discipline.'",
        "word_instruction": "Use AP/collegiate vocabulary. Definitions should match dictionary precision. Students should produce this vocabulary in formal academic writing.",
    },
    11: {
        "vocab":           "advanced literary and technical words; SAT/ACT/AP level vocabulary",
        "sentence":        "18-25 words; complex rhetorical structures; varied syntax for effect",
        "fk_target":       "10.5-11.5",
        "blooms":          "Create and Evaluate at advanced levels",
        "dok":             "DOK 4",
        "definition_style":"sophisticated academic definitions; etymology; register; word families",
        "example_style":   "college preparation: academic writing, research, professional fields, global policy",
        "hint_style":      "advanced synthesis; 'Construct an original argument that challenges or extends the conventional understanding of this concept.'",
        "sentence_example":"advanced: 'The inextricable relationship between ideological presuppositions and empirical methodology fundamentally shapes the conclusions researchers draw.'",
        "word_instruction": "Use college-level academic vocabulary. Include etymology and word family context. Prepare students for college reading.",
    },
    12: {
        "vocab":           "collegiate-level vocabulary; technical and field-specific academic language",
        "sentence":        "20+ words; sophisticated complex structures; rhetorical variety",
        "fk_target":       "11.5-12.5",
        "blooms":          "All Bloom's levels with emphasis on Create and Evaluate at college level",
        "dok":             "DOK 4",
        "definition_style":"collegiate definitions: scholarly precision, nuance, disciplinary field usage",
        "example_style":   "college contexts: academic research, professional fields, interdisciplinary inquiry",
        "hint_style":      "collegiate; 'Formulate a nuanced scholarly argument that positions this concept within a broader theoretical framework.'",
        "sentence_example":"collegiate: 'The paradigmatic shift in our understanding of quantum mechanics has fundamentally reconceptualized the ontological assumptions underlying classical physics.'",
        "word_instruction": "Use AP/collegiate vocabulary matching Merriam-Webster academic precision. Students should produce this vocabulary in formal writing.",
    },
}


def _count_syllables(word: str) -> int:
    word = word.lower().strip(".,!?;:'\"")
    if not word:
        return 1
    count = len(re.findall(r'[aeiouy]+', word))
    if word.endswith('e') and count > 1:
        count -= 1
    return max(count, 1)


def get_word_count(grade_level: int) -> int:
    """Number of vocabulary words appropriate for the grade.
    Younger students get fewer items so worksheets aren't overwhelming."""
    if grade_level <= 2:
        return 5
    if grade_level <= 5:
        return 7
    if grade_level <= 8:
        return 8
    return 10


def get_grade_prompt_context(grade_level: int) -> str:
    p = GRADE_PROFILES.get(grade_level, GRADE_PROFILES[7])
    return f"""=== GRADE {grade_level} NLP CALIBRATION REQUIREMENTS ===
You MUST follow every rule below. Content that violates any rule is unacceptable.

VOCABULARY SELECTION:
  {p['word_instruction']}
  Complexity profile: {p['vocab']}

LANGUAGE & SYNTAX:
  Target sentence length: {p['sentence']}
  Target Flesch-Kincaid Grade Level: {p['fk_target']}
  Fill-in-blank sentences must use this syntax: {p['sentence_example']}

COGNITIVE LEVEL (Bloom's Taxonomy):
  Required levels: {p['blooms']}
  Depth of Knowledge: {p['dok']}

DEFINITIONS:
  Format: {p['definition_style']}

SENTENCE WRITING HINTS:
  Format: {p['hint_style']}

EXAMPLES IN CONTEXT:
  {p['example_style']}
=== END GRADE {grade_level} REQUIREMENTS ==="""


def analyze_text_grade(text: str) -> dict:
    if not text:
        return {}
    sentences = [s.strip() for s in re.split(r'[.!?]+', text) if len(s.strip().split()) >= 3]
    words = re.findall(r'\b[a-zA-Z]+\b', text)
    if not sentences or len(words) < 10:
        return {}

    total_syllables = sum(_count_syllables(w) for w in words)
    avg_sentence_len = len(words) / len(sentences)
    syllables_per_word = total_syllables / len(words)

    flesch_ease = round(206.835 - 1.015 * avg_sentence_len - 84.6 * syllables_per_word, 1)
    fk_grade = round(0.39 * avg_sentence_len + 11.8 * syllables_per_word - 15.59, 1)

    return {
        "flesch_reading_ease": flesch_ease,
        "flesch_kincaid_grade": fk_grade,
        "avg_sentence_length": round(avg_sentence_len, 1),
        "word_count": len(words),
        "sentence_count": len(sentences),
    }


def difficulty_label(grade: int) -> str:
    if grade <= 2:    return "Early Reader"
    elif grade <= 4:  return "Beginner"
    elif grade <= 6:  return "Elementary"
    elif grade <= 8:  return "Intermediate"
    elif grade <= 10: return "Advanced"
    else:             return "Expert"
