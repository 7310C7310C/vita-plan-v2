#!/usr/bin/env python3
"""Guard AGENTS.md as an indicator-only file."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
AGENTS = ROOT / "AGENTS.md"
DOCS = ROOT / "docs" / "omr-checklist.md"

allowed_headings = {
    "# AGENTS.md — Vita Plan v2 强制规则",
    "## 必读",
    "## 强制检查（CI 不过则不能部署）",
    "## 高层不变量（不可由代码推导）",
    "## 评审",
    "## 维护约定",
}

MAX_LINES = 60
FORBIDDEN_HEADINGS = {"## 乐谱/OMR", "## OMR 工具", "## OMR 工具（强制）", "## 自维护（强制）"}


def fail(msg):
    print(f"AGENTS guard FAIL: {msg}")
    sys.exit(1)


text = AGENTS.read_text(encoding="utf-8")
lines = text.splitlines()
if len(lines) > MAX_LINES:
    fail(f"AGENTS.md has {len(lines)} lines (max {MAX_LINES})")
for line in lines:
    if line.startswith("#"):
        if line not in allowed_headings:
            fail(f"disallowed heading: {line}")
        if line in FORBIDDEN_HEADINGS:
            fail(f"forbidden heading: {line}")
if "新经验/教训只追加到" not in text:
    fail("maintenance convention missing")
if "docs/omr-checklist.md" not in text:
    fail("must point to docs/omr-checklist.md")
if not DOCS.is_file():
    fail("docs/omr-checklist.md missing")
docs_text = DOCS.read_text(encoding="utf-8")
if "## 已知教训" not in docs_text:
    fail("docs/omr-checklist.md must keep '已知教训' section")
print("OK: AGENTS.md indicator-only guard passed")
