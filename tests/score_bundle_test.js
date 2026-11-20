#!/usr/bin/env node
/* Round-trip check: scripts/score_pack.py (encoder) + score-format.js (decoder)
   must reproduce every source score semantically.  Run from the repo root. */
"use strict";

const fs = require("fs");
const path = require("path");
const {decode} = require("../assets/js/score-format.js");

const ROOT = path.resolve(__dirname, "..");
const SCORES = path.join(ROOT, "data", "scores");
const BUNDLE = path.join(SCORES, "bundle.json");
const DROP = new Set(["schemaVersion", "beatUnit", "lyricsMode", "clickStep", "credit"]);

function walk(dir){
  const out = [];
  for (const name of fs.readdirSync(dir)){
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".json") && p !== BUNDLE) out.push(p);
  }
  return out.sort();
}

function norm(value){
  if (Array.isArray(value)) return value.map(norm);
  if (value && typeof value === "object"){
    const out = {};
    for (const key of Object.keys(value)){
      const v = value[key];
      if (DROP.has(key)) continue;
      if ((key === "repeat" || key === "dc" || key === "slurs" || key === "ties") &&
          (v === null || (Array.isArray(v) && v.length === 0))) continue;
      if (key === "compound" && v === false) continue;
      if (key === "bars") { out[key] = v.map(normBar); continue; }
      out[key] = norm(v);
    }
    return out;
  }
  return value;
}

function normBar(bar){
  const out = {};
  for (const key of Object.keys(bar)){
    const v = bar[key];
    if ((key === "chords" || key === "marks") && Array.isArray(v) && v.length === 0) continue;
    if (key === "V"){
      const voices = {};
      for (const name of Object.keys(v)){
        if (v[name] && v[name].length) voices[name] = v[name].map(norm);
      }
      out.V = voices;
      continue;
    }
    out[key] = norm(v);
  }
  return out;
}

function same(a, b, where){
  if (typeof a === "number" && typeof b === "number"){
    if (Math.abs(a - b) <= 1e-4) return null;
    return `${where}: ${a} != ${b}`;
  }
  if (Array.isArray(a) || Array.isArray(b)){
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return `${where}: array shape differs`;
    }
    for (let i = 0; i < a.length; i++){
      const diff = same(a[i], b[i], `${where}[${i}]`);
      if (diff) return diff;
    }
    return null;
  }
  if (a && b && typeof a === "object" && typeof b === "object"){
    const ak = Object.keys(a).sort(), bk = Object.keys(b).sort();
    if (ak.join("\u0000") !== bk.join("\u0000")) return `${where}: keys differ (${ak} vs ${bk})`;
    for (const key of ak){
      const diff = same(a[key], b[key], `${where}.${key}`);
      if (diff) return diff;
    }
    return null;
  }
  if (a === b) return null;
  return `${where}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`;
}

function main(){
  const bundle = JSON.parse(fs.readFileSync(BUNDLE, "utf8"));
  if (bundle.format !== "vp2-pack/1") throw new Error(`bad bundle format: ${bundle.format}`);
  const files = walk(SCORES);
  const expected = files.map(f => path.relative(ROOT, f).split(path.sep).join("/"));
  const got = Object.keys(bundle.scores).sort();
  if (expected.join("\n") !== got.join("\n")){
    throw new Error(`bundle keys differ\nmissing: ${expected.filter(k => !got.includes(k))}\n` +
      `extra: ${got.filter(k => !expected.includes(k))}`);
  }
  for (const rel of expected){
    const source = JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
    const decoded = decode(bundle.scores[rel]);
    const diff = same(norm(decoded), norm(source), rel);
    if (diff) throw new Error(diff);
  }
  console.log(`OK: ${expected.length} scores round-trip through bundle`);
}

try { main(); } catch (e){ console.error("FAIL: " + e.message); process.exit(1); }
