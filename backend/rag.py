import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


class RAGRetriever:
    def __init__(self):
        self.vectorizer = TfidfVectorizer(max_features=2000, ngram_range=(1, 2))
        self._corpus = []
        self._metadata = []
        self._tfidf_matrix = None

    def build_index(self):
        from database import get_all_worksheets, get_all_rag_documents

        worksheets = get_all_worksheets()
        rag_docs = get_all_rag_documents()

        self._corpus = []
        self._metadata = []

        for w in worksheets:
            text = (
                f"vocabulary worksheet topic {w['topic']} "
                f"grade {w['grade_level']} objective {w['learning_objective']}"
            )
            self._corpus.append(text)
            self._metadata.append({"type": "worksheet", "data": w})

        for d in rag_docs:
            self._corpus.append(d["content"])
            self._metadata.append({"type": "rag_doc", "data": d})

        if self._corpus:
            self._tfidf_matrix = self.vectorizer.fit_transform(self._corpus)

    def retrieve(self, query: str, top_k: int = 3, grade_filter: int = None) -> list:
        if not self._corpus:
            return []

        query_vec = self.vectorizer.transform([query])
        similarities = cosine_similarity(query_vec, self._tfidf_matrix)[0]
        top_indices = np.argsort(similarities)[::-1]

        results = []
        for idx in top_indices:
            if len(results) >= top_k:
                break
            if similarities[idx] < 0.05:
                continue
            meta = self._metadata[idx]
            if grade_filter and meta["type"] == "worksheet":
                if abs(meta["data"].get("grade_level", 0) - grade_filter) > 2:
                    continue
            results.append({
                "content": self._corpus[idx],
                "metadata": meta,
                "score": float(similarities[idx])
            })

        return results

    def build_context(self, query: str, grade_level: int = None) -> str:
        if not self._corpus:
            return ""

        results = self.retrieve(query, top_k=3, grade_filter=grade_level)
        if not results:
            return ""

        parts = ["Relevant context from previous worksheets:"]
        for r in results:
            d = r["metadata"]["data"]
            if r["metadata"]["type"] == "worksheet":
                words = []
                content = d.get("content", {})
                for vw in content.get("vocab_words", [])[:5]:
                    words.append(vw.get("word", ""))
                parts.append(
                    f"- Topic: {d['topic']} | Grade {d['grade_level']} | "
                    f"Words used: {', '.join(w for w in words if w)}"
                )
            else:
                parts.append(f"- {d['content'][:150]}")

        return "\n".join(parts)


rag_retriever = RAGRetriever()
