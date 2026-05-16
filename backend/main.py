import os
import sys
import json
import io
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from groq import Groq
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent))
from database import (init_db, create_session, save_worksheet,
                      get_session_history, get_all_worksheets, save_rag_document)
from rag import rag_retriever
from nlp_adapter import get_grade_prompt_context, analyze_text_grade
from mcp_tools import MCP_TOOLS, execute_mcp_tool

load_dotenv()

GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
_groq_client = None


def get_groq_client() -> Groq:
    global _groq_client
    if _groq_client is None:
        _groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    return _groq_client


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        init_db()
    except Exception as e:
        print(f"[startup] DB init error: {e}")
    try:
        rag_retriever.build_index()
    except Exception as e:
        print(f"[startup] RAG build error: {e}")
    yield


app = FastAPI(title="Vocabulary Mastery Worksheet Tool", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class WorksheetRequest(BaseModel):
    topic: str
    grade_level: int
    learning_objective: str
    additional_context: Optional[str] = None
    session_id: Optional[str] = None


class SessionCreate(BaseModel):
    metadata: Optional[dict] = None


class MCPToolCall(BaseModel):
    tool_name: str
    arguments: dict


class RAGDocRequest(BaseModel):
    content: str
    topic: Optional[str] = ""
    grade_level: Optional[int] = 0


# ── Sessions ──────────────────────────────────────────────────────────────────

@app.post("/api/sessions")
async def new_session(req: SessionCreate):
    session_id = create_session(req.metadata)
    return {"session_id": session_id}


@app.get("/api/sessions/{session_id}/history")
async def session_history(session_id: str):
    return {"session_id": session_id, "history": get_session_history(session_id)}


@app.get("/api/worksheets")
async def list_worksheets(limit: int = 20):
    return {"worksheets": get_all_worksheets(limit)}


# ── Generate ──────────────────────────────────────────────────────────────────

def _validate_vocab(data: dict) -> "str | None":
    """Return an error description string if the worksheet JSON is invalid, else None."""
    vocab_words = data.get("vocab_words")
    if not isinstance(vocab_words, list) or len(vocab_words) < 8:
        return f"vocab_words must have at least 8 items, got {len(vocab_words) if isinstance(vocab_words, list) else 'missing'}"

    matching = data.get("matching_section")
    if not isinstance(matching, dict) or not matching.get("items"):
        return "matching_section is missing or has no items"

    fib = data.get("fill_in_blank")
    if not isinstance(fib, dict):
        return "fill_in_blank section is missing"
    sentences = fib.get("sentences")
    if not isinstance(sentences, list) or len(sentences) < 5:
        return f"fill_in_blank.sentences must have at least 5 items, got {len(sentences) if isinstance(sentences, list) else 'missing'}"

    sw = data.get("sentence_writing")
    if not isinstance(sw, dict) or not sw.get("prompts"):
        return "sentence_writing section is missing or has no prompts"

    return None


@app.post("/api/vocabulary/generate")
async def generate_worksheet(req: WorksheetRequest):
    session_id = req.session_id or create_session()

    rag_retriever.build_index()
    rag_context = rag_retriever.build_context(
        f"{req.topic} grade {req.grade_level} {req.learning_objective}",
        grade_level=req.grade_level,
    )
    grade_ctx = get_grade_prompt_context(req.grade_level)

    # Pre-compute optional blocks to avoid backslashes inside f-string expressions
    additional_block = f"Additional Context: {req.additional_context}" if req.additional_context else ""
    rag_block = f"\n{rag_context}" if rag_context else ""
    ctx_block = f"{additional_block}\n{rag_block}".strip()

    def _build_prompt(extra_instructions: str = "") -> str:
        return f"""You are an expert educator creating a Vocabulary Mastery Worksheet.

{grade_ctx}
Topic: {req.topic}
Learning Objective: {req.learning_objective}
{ctx_block}
{extra_instructions}
Generate a complete vocabulary mastery worksheet. Return ONLY valid JSON with this exact structure:
{{
  "vocab_words": [
    {{"word": "photosynthesis", "definition": "The process plants use to make food from sunlight", "part_of_speech": "noun"}},
    ... 10 words total
  ],
  "matching_section": {{
    "title": "Section 1: Match the Word to Its Meaning",
    "instructions": "Draw a line to match each word with its correct definition.",
    "items": [
      {{"word": "word1", "definition": "definition1"}},
      ... 10 pairs (shuffle definitions so they are NOT in same order as vocab_words)
    ]
  }},
  "fill_in_blank": {{
    "title": "Section 2: Fill in the Blank",
    "instructions": "Choose the correct vocabulary word to complete each sentence.",
    "word_bank": ["word1", "word2", "word3", "word4", "word5", "word6", "word7", "word8"],
    "sentences": [
      {{"sentence": "The scientist used a ___ to study the tiny organisms.", "answer": "microscope"}},
      ... 8 sentences total
    ]
  }},
  "sentence_writing": {{
    "title": "Section 3: Write Your Own Sentences",
    "instructions": "Write your own original sentence for each word. Show that you understand what it means!",
    "prompts": [
      {{"word": "word1", "hint": "Write about a place or time when this word applies.", "example": "The ecosystem in the rainforest..."}},
      ... 5 prompts total
    ]
  }}
}}"""

    def _sse(obj: dict) -> str:
        return f"data: {json.dumps(obj)}\n\n"

    def stream_gen():
        max_attempts = 3
        extra_instructions = ""

        for attempt in range(1, max_attempts + 1):
            if attempt > 1:
                yield _sse({"type": "retry", "attempt": attempt, "reason": last_reason})

            yield _sse({"type": "progress", "message": f"Attempt {attempt}: calling Groq model…"})

            prompt = _build_prompt(extra_instructions)
            collected_chunks = []

            try:
                stream = get_groq_client().chat.completions.create(
                    model=GROQ_MODEL,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.7,
                    max_tokens=3500,
                    stream=True,
                )

                for chunk in stream:
                    delta = chunk.choices[0].delta.content or ""
                    if delta:
                        collected_chunks.append(delta)
                        yield _sse({"type": "token", "content": delta})

            except Exception as exc:
                last_reason = str(exc)
                extra_instructions = f"IMPORTANT: Fix the following error from the previous attempt: {last_reason}\n"
                continue

            raw = "".join(collected_chunks).strip()
            for fence in ("```json", "```"):
                if raw.startswith(fence):
                    raw = raw[len(fence):]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()

            yield _sse({"type": "status", "message": "Parsing JSON response…"})

            try:
                data = json.loads(raw)
            except json.JSONDecodeError as exc:
                last_reason = f"Invalid JSON: {exc}"
                extra_instructions = (
                    "CRITICAL: Your previous response was not valid JSON. "
                    "Return ONLY a raw JSON object — no markdown fences, no prose.\n"
                )
                continue

            yield _sse({"type": "status", "message": "Validating worksheet structure…"})

            validation_error = _validate_vocab(data)
            if validation_error:
                last_reason = f"Validation failed: {validation_error}"
                extra_instructions = (
                    f"IMPORTANT: Fix this validation error from your previous attempt: {validation_error}. "
                    "Ensure vocab_words has >=8 items, matching_section is present, "
                    "fill_in_blank has >=5 sentences, and sentence_writing has prompts.\n"
                )
                continue

            # All checks passed — save and emit complete event
            yield _sse({"type": "status", "message": "Saving worksheet…"})

            full_content = {
                **data,
                "rag_context_used": bool(rag_context),
            }

            try:
                worksheet_id = save_worksheet(
                    session_id=session_id,
                    topic=req.topic,
                    grade_level=req.grade_level,
                    learning_objective=req.learning_objective,
                    content=full_content,
                )

                save_rag_document(
                    content=(
                        f"vocabulary worksheet topic {req.topic} grade {req.grade_level} "
                        f"objective {req.learning_objective} words "
                        + " ".join(w["word"] for w in data.get("vocab_words", []))
                    ),
                    doc_type="worksheet",
                    topic=req.topic,
                    grade_level=req.grade_level,
                )
                rag_retriever.build_index()
            except Exception as exc:
                yield _sse({"type": "error", "message": f"Database error: {exc}"})
                return

            yield _sse({
                "type": "complete",
                "session_id": session_id,
                "worksheet_id": worksheet_id,
                "worksheet": full_content,
            })
            return

        # Exhausted all retries
        yield _sse({"type": "error", "message": f"Failed after {max_attempts} attempts. Last error: {last_reason}"})

    return StreamingResponse(
        stream_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── Export DOCX ───────────────────────────────────────────────────────────────

@app.post("/api/vocabulary/export/docx")
async def export_docx(payload: dict):
    from docx import Document
    from docx.shared import Pt, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    ws = payload.get("worksheet", {})
    topic = payload.get("topic", "Vocabulary")
    grade = payload.get("grade_level", "")
    objective = payload.get("learning_objective", "")

    doc = Document()

    title = doc.add_heading("Vocabulary Mastery Worksheet", 0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER

    doc.add_paragraph(f"Topic: {topic}  |  Grade: {grade}  |  Objective: {objective}")
    doc.add_paragraph("Name: ____________________________   Date: _______________")
    doc.add_paragraph()

    matching = ws.get("matching_section", {})
    if matching:
        doc.add_heading(matching.get("title", "Section 1: Matching"), 1)
        doc.add_paragraph(matching.get("instructions", ""))
        doc.add_paragraph()
        tbl = doc.add_table(rows=1, cols=2)
        tbl.style = "Table Grid"
        hdr = tbl.rows[0].cells
        hdr[0].text = "Vocabulary Word"
        hdr[1].text = "Definition"
        for item in matching.get("items", []):
            row = tbl.add_row().cells
            row[0].text = item.get("word", "")
            row[1].text = ""
        doc.add_paragraph()

    fib = ws.get("fill_in_blank", {})
    if fib:
        doc.add_heading(fib.get("title", "Section 2: Fill in the Blank"), 1)
        doc.add_paragraph(fib.get("instructions", ""))
        wb = ", ".join(fib.get("word_bank", []))
        doc.add_paragraph(f"Word Bank: [ {wb} ]")
        doc.add_paragraph()
        for i, s in enumerate(fib.get("sentences", []), 1):
            doc.add_paragraph(f"{i}. {s.get('sentence', '')}")
        doc.add_paragraph()

    sw = ws.get("sentence_writing", {})
    if sw:
        doc.add_heading(sw.get("title", "Section 3: Write Your Own Sentences"), 1)
        doc.add_paragraph(sw.get("instructions", ""))
        doc.add_paragraph()
        for i, p in enumerate(sw.get("prompts", []), 1):
            doc.add_paragraph(f"{i}. Word: {p.get('word', '')}")
            doc.add_paragraph(f"   Hint: {p.get('hint', '')}")
            doc.add_paragraph("   My sentence: _________________________________________________")
            doc.add_paragraph()

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="vocabulary_{topic}.docx"'},
    )


# ── RAG document upload ───────────────────────────────────────────────────────

@app.post("/api/rag/add-text")
async def add_rag_text(req: RAGDocRequest):
    doc_id = save_rag_document(req.content, "knowledge", req.topic, req.grade_level)
    rag_retriever.build_index()
    return {"success": True, "doc_id": doc_id}


@app.post("/api/rag/add-file")
async def add_rag_file(file: UploadFile = File(...)):
    raw = await file.read()
    content = ""
    if file.filename.endswith(".pdf"):
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(raw))
        content = " ".join(p.extract_text() or "" for p in reader.pages)
    elif file.filename.endswith(".docx"):
        from docx import Document as DocxDoc
        doc = DocxDoc(io.BytesIO(raw))
        content = " ".join(p.text for p in doc.paragraphs)
    else:
        content = raw.decode("utf-8", errors="ignore")

    doc_id = save_rag_document(content[:6000], "file", file.filename, 0)
    rag_retriever.build_index()
    return {"success": True, "doc_id": doc_id, "chars_indexed": len(content)}


# ── MCP Tools ─────────────────────────────────────────────────────────────────

@app.get("/mcp/tools")
async def list_mcp_tools():
    return {"tools": MCP_TOOLS}


@app.post("/mcp/tools/call")
async def call_mcp_tool(req: MCPToolCall):
    try:
        result = await execute_mcp_tool(req.tool_name, req.arguments)
        return {"success": True, "result": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    return {"status": "ok", "tool": "vocabulary-mastery-worksheet", "model": GROQ_MODEL}


# ── Serve frontend ────────────────────────────────────────────────────────────

frontend_dir = Path(__file__).parent.parent / "frontend" / "dist"

if frontend_dir.exists():
    from fastapi.responses import FileResponse

    @app.get("/")
    async def serve_index():
        return FileResponse(
            str(frontend_dir / "index.html"),
            headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
        )

    try:
        app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="static")
    except Exception as e:
        print(f"[startup] Static files mount skipped: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002, reload=True)
