/* Decode a record from data/scores/bundle.json back to the runtime score schema.
   The encoder lives in scripts/score_pack.py; tests/score_bundle_test.js checks
   that both sides round-trip every source score. */
(function(root, factory){
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.VP2ScoreFormat = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function(){
  "use strict";

  var VOICES = ["S", "A", "T", "B"];
  var TOKEN_RE = /^(\d+)(?::([-_]|\d+)|([-_]))?$/;

  function isCompound(meter){
    var p = String(meter || "4/4").split("/");
    var num = parseInt(p[0], 10), den = parseInt(p[1], 10);
    return den === 8 && num > 3 && num % 3 === 0;
  }

  function barBeats(meter, compound){
    var p = String(meter || "4/4").split("/");
    var num = parseInt(p[0], 10), den = parseInt(p[1], 10);
    return num * (compound ? 8 : 4) / den;
  }

  function round6(x){ return Math.round(x * 1e6) / 1e6; }

  function decode(src){
    if (!src || typeof src !== "object" || !Array.isArray(src.bars) || !src.bars.length){
      throw new Error("bad score record");
    }
    var meter0 = String(src.meter || "4/4");
    var compound = src.compound === undefined ? isCompound(meter0) : !!src.compound;
    var out = {};
    ["id", "title", "original", "credits", "key", "keyBase", "meter", "tempo"].forEach(function(k){
      if (src[k] !== undefined) out[k] = src[k];
    });
    if (src.credit !== undefined) out.credit = src.credit;
    out.compound = compound;
    out.tempoLabel = src.tempoLabel || ((compound ? "♪=" : "♩=") + (src.tempo || ""));
    if (src.voices) out.voices = src.voices.slice();
    ["voiceOct", "markMode", "lyricCollapse", "versionCode", "versionLabel", "capo", "clickStep"].forEach(function(k){
      if (src[k] !== undefined) out[k] = src[k];
    });

    var lyricVoices;
    if (src.lyricVoices === undefined){
      lyricVoices = ["S"];              /* 默认只有女高音带歌词 */
    } else {
      lyricVoices = String(src.lyricVoices).split("").filter(function(v){
        return VOICES.indexOf(v) >= 0;
      });                               /* "" = 明确没有歌词声部 */
    }

    if (Array.isArray(src.lines)){
      var n = 0;
      out.phrases = src.lines.map(function(len){
        var group = [];
        for (var i = 0; i < len; i++) group.push(n++);
        return group;
      });
    } else {
      out.phrases = src.phrases || [];
    }

    out.lyrics = (src.lyrics || []).map(function(row){
      return String(row).split(/\s+/).filter(Boolean).map(function(t){ return t === "·" ? "" : t; });
    });

    var bars = [];
    var ptr = {};
    VOICES.forEach(function(v){ ptr[v] = -1; });
    var prevMeter = null;

    src.bars.forEach(function(lines){
      var bar = {V: {}};
      var chords = [], marks = [];
      var bm = prevMeter || meter0, beats = null, meterExplicit = false;

      (lines || []).forEach(function(line){
        line = String(line);
        if (!line) return;
        if (line.charAt(0) === "@"){
          var body = line.slice(1);
          if (body.indexOf("beats ") === 0) beats = Number(body.slice(6));
          else if (body.indexOf("endbar ") === 0) bar.endbar = body.slice(7);
          else if (body.indexOf("hum ") === 0) bar.hum = body.slice(4);
          else if (body.indexOf("tag ") === 0) bar.tag = body.slice(4);
          else { bm = body.trim(); meterExplicit = true; }
          return;
        }
        var sp = line.indexOf(" ");
        var head = sp < 0 ? line : line.slice(0, sp);
        var rest = sp < 0 ? "" : line.slice(sp + 1);
        if (VOICES.indexOf(head) >= 0){
          var events = [];
          var cur = 0;
          rest.split(/\s+/).filter(Boolean).forEach(function(token){
            if (token.charAt(0) === "r"){ cur = round6(cur + Number(token.slice(1))); return; }
            var triple = false, nodot = false;
            if (token.charAt(token.length - 1) === "!"){ nodot = true; token = token.slice(0, -1); }
            if (token.charAt(token.length - 1) === "*"){ triple = true; token = token.slice(0, -1); }
            var colon = token.indexOf(":");
            if (colon < 0) throw new Error("bad event: " + token);
            var dur = Number(token.slice(0, colon));
            var m = TOKEN_RE.exec(token.slice(colon + 1));
            if (!m) throw new Error("bad note: " + token);
            var midi = parseInt(m[1], 10);
            var sylToken = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : null);
            var syl = null;
            if (sylToken === "_") syl = ptr[head] >= 0 ? ptr[head] : null;
            else if (sylToken === "-") syl = null;
            else if (sylToken !== null) syl = parseInt(sylToken, 10);
            else if (lyricVoices.indexOf(head) >= 0) syl = ptr[head] + 1;
            if (syl !== null){ syl = Math.max(0, syl); ptr[head] = syl; }
            var ev = [round6(cur), dur, midi, syl];
            if (triple) ev.push(3);
            if (nodot){ if (ev.length === 4) ev.push(null); ev.push("nodot"); }
            events.push(ev);
            cur = round6(cur + dur);
          });
          bar.V[head] = events;
          return;
        }
        if (head.charAt(0) === "^"){
          line.split(/\s+/).filter(Boolean).forEach(function(token){
            var at = token.lastIndexOf("@");
            marks.push([Number(token.slice(at + 1)), token.slice(1, at)]);
          });
          return;
        }
        line.split(/\s+/).filter(Boolean).forEach(function(token){
          var at = token.lastIndexOf("@");
          chords.push([Number(token.slice(at + 1)), token.slice(0, at)]);
        });
      });

      if (meterExplicit) bar.meter = bm;
      bar.beats = beats === null ? barBeats(bm, compound) : beats;
      if (chords.length) bar.chords = chords;
      if (marks.length) bar.marks = marks;
      bars.push(bar);
      prevMeter = bm;
    });
    out.bars = bars;

    if (src.slurs) out.slurs = src.slurs.slice();
    if (src.ties) out.ties = src.ties.slice();
    if (src.repeat) out.repeat = {from: src.repeat[0], to: src.repeat[1]};
    if (src.ds) out.ds = src.ds.slice();
    if (src.dc){ out.dc = {from: src.dc[0], to: src.dc[1]}; if (src.dc.length > 2) out.dc.segno = src.dc[2]; }
    return out;
  }

  return {decode: decode};
});
