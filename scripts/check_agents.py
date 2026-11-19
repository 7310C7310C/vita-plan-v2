#!/usr/bin/env python3
"""Guard AGENTS.md as an indicator-only file."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
AGENTS = ROOT / "AGENTS.md"
DOCS = ROOT / "docs" / "omr-checklist.md"

ALLOWED_HEADINGS = {
    "# AGENTS.md — Vita Plan v2 工作指示",
    "## 开始前",
    "## 流程",
    "## 维护",
}
MAX_LINES = 30
FORBIDDEN_HEADINGS = {
    "## 乐谱/OMR",
    "## OMR 工具",
    "## OMR 工具（强制）",
    "## 自维护（强制）",
    "## 数据格式",
}
FORBIDDEN_TOKENS = (
    "README",
    "nodot",
    "thinThick",
    "doubleThin",
    "playonly",
    "markMode",
    "lyricCollapse",
    "bar.hum",
    "SHELL_CACHE",
    "versionCode",
    "slurs",
    "ties",
    "capo",
)


def fail(msg: str) -> None:
    print(f"AGENTS guard FAIL: {msg}")
    sys.exit(1)


text = AGENTS.read_text(encoding="utf-8")
lines = text.splitlines()
if len(lines) > MAX_LINES:
    fail(f"AGENTS.md has {len(lines)} lines (max {MAX_LINES})")
for line in lines:
    if line.startswith("#") and line not in ALLOWED_HEADINGS:
        fail(f"disallowed heading: {line}")
    if line in FORBIDDEN_HEADINGS:
        fail(f"forbidden heading: {line}")
    if "<|end|>" in line or line.strip().startswith("```"):
        fail(f"suspicious content: {line!r}")
    if "/root/" in line:
        fail(f"absolute machine path: {line!r}")
for token in FORBIDDEN_TOKENS:
    if token in text:
        fail(f"implementation detail leaked into AGENTS.md: {token}")
if "lodebar2026/dolce" not in text:
    fail("must name lodebar2026/dolce as the OMR tool")
if "docs/omr-checklist.md" not in text:
    fail("must point to docs/omr-checklist.md")
if not DOCS.is_file():
    fail("docs/omr-checklist.md missing")
docs_text = DOCS.read_text(encoding="utf-8")
for section in ("## 核对项", "## 已知教训"):
    if section not in docs_text:
        fail(f"docs/omr-checklist.md missing section: {section}")
if "## 数据格式" in docs_text:
    fail("docs/omr-checklist.md must not keep a data-format spec section")
if "<|end|>" in docs_text or any(line.strip().startswith("```") for line in docs_text.splitlines()):
    fail("docs/omr-checklist.md has suspicious markdown garbage")
if "/root/" in docs_text:
    fail("docs/omr-checklist.md has absolute machine path")
print("OK: AGENTS.md indicator-only guard passed")
