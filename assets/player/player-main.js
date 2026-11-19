/* Extracted from player-frame.html; edit here, not in the HTML. */
"use strict";
/* ============================================================
   1. 乐谱
   ============================================================ */
const SCORE = window.__SCORE;
const SONG_ID = window.__SONG_ID || SCORE.id;
document.title = SCORE.title;
/* 离开乐谱页（返回列表）立即停止播放 */
let resumeOnVisible = false;
function stopForLeave(){ resumeOnVisible = false; try{ engine.stop(); setPlayUI(false); }catch(e){} }
window.addEventListener("pagehide", stopForLeave);
/* 切到背景暂停、回到前景续播 */
document.addEventListener("visibilitychange", ()=>{
  if (document.visibilityState === "hidden"){
    if (engine && engine.playing){ resumeOnVisible = true; engine.pause(); setPlayUI(false); }
  } else if (resumeOnVisible){
    resumeOnVisible = false;
    /* 切回页面时的自动续播不是用户操作，弥撒时段直接不续播，避免误出声 */
    if (!annotMode && !isMassQuietHour()) engine.play(engine.anchorBeat, true).then(()=>setPlayUI(engine.playing));
    else setPlayUI(false);
  }
});
{
  const h1=document.querySelector("h1"); if(h1) h1.textContent = SCORE.title;
  const mo=document.querySelector("header .meta-original");
  if (mo){ mo.textContent = SCORE.original || ""; mo.style.display = SCORE.original ? "" : "none"; }
  const mc=document.querySelector("header .meta-credit");
  if (mc){
    mc.textContent = "";
    const lines = Array.isArray(SCORE.credits)
      ? SCORE.credits
      : (SCORE.credit ? String(SCORE.credit).split(" · ") : []);
    lines.forEach(function(t){
      const d=document.createElement("div"); d.textContent=t; mc.appendChild(d);
    });
    mc.style.display = lines.length ? "" : "none";
  }
  const st=document.getElementById("scoreTempo");
  if (st){
    const label = String(SCORE.tempoLabel || ("♩=" + (SCORE.tempo || "")));
    const m = label.match(/^\s*([^\d=]+?)\s*=\s*(.+)$/);
    st.textContent = "";
    if (m){
      const n = document.createElement("span"); n.className = "tempo-note";
      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("viewBox", "0 0 12 18"); svg.setAttribute("aria-hidden", "true");
      const eighth = m[1].indexOf("♪") >= 0;
      const head = document.createElementNS(svgNS, "ellipse");
      head.setAttribute("cx", "4"); head.setAttribute("cy", "14.2");
      head.setAttribute("rx", "3.3"); head.setAttribute("ry", "2.6");
      head.setAttribute("transform", "rotate(-18 4 14.2)");
      svg.appendChild(head);
      const stem = document.createElementNS(svgNS, "rect");
      stem.setAttribute("x", "6.5"); stem.setAttribute("y", "1.2");
      stem.setAttribute("width", "1.6"); stem.setAttribute("height", "13");
      svg.appendChild(stem);
      if (eighth){
        const flag = document.createElementNS(svgNS, "path");
        flag.setAttribute("d", "M8.1 1.2c2.1.9 3 2.4 3 4.1 0 .7-.2 1.3-.6 1.8.3-1.3-.5-2.2-1.7-2.7z");
        svg.appendChild(flag);
      }
      n.appendChild(svg);
      const v = document.createElement("span"); v.className = "tempo-val"; v.textContent = "=" + m[2];
      st.appendChild(n); st.appendChild(v);
      st.setAttribute("aria-label", label);
    } else {
      st.textContent = label;
    }
  }
  const kt=document.querySelectorAll(".kt");
  if(kt[0]) kt[0].textContent = "1=" + SCORE.key;
  if(kt[1]) kt[1].innerHTML = meterStackHTML(SCORE.meter || "");
}
const PHRASES = SCORE.phrases || SCORE.bars.map((b,i)=>[i]);   // 乐句（自动换行时优先在此断行）
/* 连音线：[小节索引, 声部, 起事件, 迄事件]（依原五线谱） */
const SLURS = SCORE.slurs || [];
const TIES  = SCORE.ties  || [];   /* 跨小节同音延音：[[小节,声部,事件],[小节,声部,事件]] */
const VOICE_OCT = SCORE.voiceOct || {};   /* 记谱八度：T/B 可按原谱记谱，发声仍用真实音高 */
const VOICES = ["S","A","T","B"];
const SHOW_VOICES = (Array.isArray(SCORE.voices) && SCORE.voices.length ? SCORE.voices : VOICES)
  .filter(v=>VOICES.indexOf(v)>=0);
const VERSE_LABELS = (SCORE.lyrics||[]).map((_,i)=>String(i+1)+".");

/* 多段歌词共用开头：原谱只印一行，直到首次分歧才分行。
   lyricCollapse=true 时自动计算首次分歧的音节索引，避免写死小节/索引。 */
const LYRIC_SPLIT = (()=>{
  const rows = SCORE.lyrics || [];
  if (!SCORE.lyricCollapse || rows.length < 2) return -1;
  const base = rows[0] || [];
  for (let i=0;i<base.length;i++){
    for (let v=1;v<rows.length;v++){
      if ((rows[v][i]||"") !== (base[i]||"")) return i;
    }
  }
  return -1;
})();
function barVerseSplit(bi){
  if (LYRIC_SPLIT < 0) return false;
  const bar = SCORE.bars[bi]; if (!bar) return false;
  return Object.keys(bar.V||{}).some(v=>(bar.V[v]||[]).some(
    ev=>ev[3]!==null && ev[3]!==undefined && ev[3]>=LYRIC_SPLIT));
}

/* ---------- General MIDI 128 音色 ---------- */
const GM_GROUPS = [
  {name:"钢琴", gain:4.0, items:[
    ["acoustic_grand_piano","大钢琴"],["bright_acoustic_piano","亮音大钢琴"],
    ["electric_grand_piano","电钢琴"],["honkytonk_piano","酒吧钢琴"],
    ["electric_piano_1","电钢琴 1"],["electric_piano_2","电钢琴 2"],
    ["harpsichord","大键琴"],["clavinet","击弦古钢琴"]] },
  {name:"半音打击", gain:3.4, items:[
    ["celesta","钢片琴"],["glockenspiel","铁琴"],["music_box","音乐盒"],
    ["vibraphone","颤音琴"],["marimba","马林巴"],["xylophone","木琴"],
    ["tubular_bells","管钟"],["dulcimer","扬琴"]] },
  {name:"风琴", gain:0.55, items:[
    ["drawbar_organ","拉桿风琴"],["percussive_organ","打击风琴"],["rock_organ","摇滾风琴"],
    ["church_organ","教堂风琴"],["reed_organ","簧风琴"],["accordion","手风琴"],
    ["harmonica","口琴"],["tango_accordion","探戈手风琴"]] },
  {name:"吉他", gain:2.0, items:[
    ["acoustic_guitar_nylon","尼龙弦吉他"],["acoustic_guitar_steel","钢弦吉他"],
    ["electric_guitar_jazz","爵士电吉他"],["electric_guitar_clean","清音电吉他"],
    ["electric_guitar_muted","悶音电吉他"],["overdriven_guitar","破音吉他"],
    ["distortion_guitar","失真吉他"],["guitar_harmonics","吉他泛音"]] },
  {name:"低音", gain:2.0, items:[
    ["acoustic_bass","低音提琴"],["electric_bass_finger","指彈电贝斯"],
    ["electric_bass_pick","拨片电贝斯"],["fretless_bass","无琴格贝斯"],
    ["slap_bass_1","击弦贝斯 1"],["slap_bass_2","击弦贝斯 2"],
    ["synth_bass_1","合成贝斯 1"],["synth_bass_2","合成贝斯 2"]] },
  {name:"弦乐", gain:0.6, items:[
    ["violin","小提琴"],["viola","中提琴"],["cello","大提琴"],["contrabass","倍低音提琴"],
    ["tremolo_strings","颤音弦乐"],["pizzicato_strings","拨弦弦乐"],
    ["orchestral_harp","竖琴"],["timpani","定音鼓"]] },
  {name:"合奏", gain:1.0, items:[
    ["string_ensemble_1","弦乐合奏 1"],["string_ensemble_2","弦乐合奏 2"],
    ["synth_strings_1","合成弦乐 1"],["synth_strings_2","合成弦乐 2"],
    ["choir_aahs","人声「啊」"],["voice_oohs","人声「呜」"],
    ["synth_choir","合成合唱"],["orchestra_hit","乐团重击"]] },
  {name:"铜管", gain:0.9, items:[
    ["trumpet","小号"],["trombone","长号"],["tuba","低音号"],["muted_trumpet","弱音小号"],
    ["french_horn","法国号"],["brass_section","铜管合奏"],
    ["synth_brass_1","合成铜管 1"],["synth_brass_2","合成铜管 2"]] },
  {name:"簧管", gain:0.9, items:[
    ["soprano_sax","高音薩克斯"],["alto_sax","中音薩克斯"],["tenor_sax","次中音薩克斯"],
    ["baritone_sax","上低音薩克斯"],["oboe","双簧管"],["english_horn","英国管"],
    ["bassoon","低音管"],["clarinet","单簧管"]] },
  {name:"笛管", gain:1.0, items:[
    ["piccolo","短笛"],["flute","长笛"],["recorder","直笛"],["pan_flute","排笛"],
    ["blown_bottle","吹瓶"],["shakuhachi","尺八"],["whistle","哨笛"],["ocarina","陶笛"]] },
  {name:"合成主音", gain:0.8, items:[
    ["lead_1_square","方波主音"],["lead_2_sawtooth","锯齿主音"],["lead_3_calliope","汽笛主音"],
    ["lead_4_chiff","氣音主音"],["lead_5_charang","查朗主音"],["lead_6_voice","人声主音"],
    ["lead_7_fifths","五度主音"],["lead_8_bass__lead","贝斯主音"]] },
  {name:"合成背景", gain:0.8, items:[
    ["pad_1_new_age","新世紀"],["pad_2_warm","溫暖"],["pad_3_polysynth","多合成"],
    ["pad_4_choir","合唱"],["pad_5_bowed","弓弦"],["pad_6_metallic","金属"],
    ["pad_7_halo","光晕"],["pad_8_sweep","扫掠"]] },
  {name:"合成效果", gain:0.8, items:[
    ["fx_1_rain","雨声"],["fx_2_soundtrack","配乐"],["fx_3_crystal","水晶"],
    ["fx_4_atmosphere","氛围"],["fx_5_brightness","明亮"],["fx_6_goblins","妖精"],
    ["fx_7_echoes","回声"],["fx_8_scifi","科幻"]] },
  {name:"民族", gain:1.6, items:[
    ["sitar","西塔琴"],["banjo","斑鸠琴"],["shamisen","三味线"],["koto","古筝"],
    ["kalimba","拇指琴"],["bagpipe","风笛"],["fiddle","民謠提琴"],["shanai","唢吶"]] },
];

const TIMBRES = {};
GM_GROUPS.forEach(g=>g.items.forEach(([id,label])=>{ TIMBRES[id] = {label, group:g.name, gain:g.gain}; }));

const LYRIC_FONTS = {
  serif:'"Noto Serif TC","Noto Serif SC","Noto Serif CJK TC","Noto Serif CJK SC","Songti TC","Songti SC",STSong,SimSun,serif',
  hei:'"Noto Sans TC","Noto Sans SC","PingFang TC","PingFang SC","Microsoft JhengHei","Microsoft YaHei",sans-serif',
  yahei:'"Noto Sans SC","Microsoft YaHei","PingFang SC","Noto Sans TC",sans-serif',
  kai:'"LXGW WenKai TC","LXGW WenKai","BiauKai","Kaiti TC","Kaiti SC","STKaiti",serif',
  round:'"Huninn","Noto Sans TC","Noto Sans SC","PingFang TC","PingFang SC",sans-serif'
};

/* ============================================================
   2. 简谱工具
   ============================================================ */
const DEG = {0:["1",""],1:["1","#"],2:["2",""],3:["2","#"],4:["3",""],
             5:["4",""],6:["4","#"],7:["5",""],8:["5","#"],9:["6",""],
             10:["6","#"],11:["7",""]};
const KEY_BASE = SCORE.keyBase || 60;
const MAJOR_STEPS = [0,2,4,5,7,9,11];
function midiToJianpu(m){
  const rel = m-KEY_BASE, oct = Math.floor(rel/12), pc = ((rel%12)+12)%12;
  let idx = MAJOR_STEPS.indexOf(pc), acc = "";
  if (idx >= 0){ idx += 1; }
  else {
    for (let i=0;i<7;i++){ if ((MAJOR_STEPS[i]+1)%12===pc){ idx=i+1; acc="#"; break; } }
    if (!idx) for (let i=6;i>=0;i--){ if ((MAJOR_STEPS[i]+11)%12===pc){ idx=i+1; acc="b"; break; } }
  }
  return {deg:idx||1, acc, oct};
}
function noteHTML(jp,{underline=0,dot=0,beam=false,beamLast=false,noOctDot=false}={}){
  let dots = "";
  const n = noOctDot ? 0 : Math.min(Math.abs(jp.oct),2);
  const lowTop = underline ? 0.22 : 0.07;
  for (let k=0;k<n;k++){
    dots += jp.oct>0
      ? `<i class="dot above" style="bottom:calc(100% + ${0.05 + k*0.2}em)"></i>`
      : `<i class="dot below" style="top:calc(100% + ${lowTop + k*0.2}em)"></i>`;
  }
  const acc = jp.acc ? `<span class="acc">${jp.acc}</span>` : "";
  const u = underline ? `<i class="u1${beam?' beam':''}${beamLast?' last':''}"></i>` : "";
  const rd = dot ? '<i class="rdot"></i>' : "";
  const cls = jp.oct>1?"up2":jp.oct===1?"up1":jp.oct===-1?"dn1":jp.oct<-1?"dn2":"";
  const inner = `<span class="num">${acc}${jp.deg}${rd}${dots}${beam?'':u}</span>`;
  return {html: inner + (beam?u:''), cls};
}
function layoutVoice(bar,v){
  const n = bar.beats;
  const cells = Array.from({length:n},()=>({type:"empty"}));
  /* 先按「拍」分桶：同一拍内的八分/十六分音符放进一个 sub 组，
     不再用 Math.round 把它们挤到错误的拍位上 */
  const buckets = Array.from({length:n},()=>[]);
  (bar.V[v]||[]).forEach((ev,idx)=>{
    const c = Math.floor(ev[0]+1e-6);
    if (c>=0 && c<n) buckets[c].push({ev,idx});
  });
  buckets.forEach((list,c)=>{
    if (!list.length) return;
    if (list.some(({ev})=>ev[4] === 3 || Math.abs(ev[1]-1/3) < 0.01)){
      cells[c] = {type:"triplet",list};
      return;
    }
    const singleLong = list.length===1 && Math.abs(list[0].ev[0]-c)<1e-6 && list[0].ev[1]>=0.999;
    if (singleLong){
      const {ev,idx} = list[0];
      cells[c] = {type:"note",ev,idx};
      const span = Math.round(ev[1]);
      for (let k=1;k<span && c+k<n;k++) if (cells[c+k].type==="empty") cells[c+k] = {type:"tail",ev,idx,from:c};
    } else {
      cells[c] = {type:"sub",list};
    }
  });
  return cells;
}

const BAR_START = (()=>{ let t=0; return SCORE.bars.map(b=>{const s=t; t+=b.beats; return s;}); })();
const TOTAL_BEATS = SCORE.bars.reduce((a,b)=>a+b.beats,0);
const BAR_END = SCORE.bars.map((b,i)=>BAR_START[i]+b.beats);
let LINE_OF_BAR = {};
const SCORE_PITCHES = (()=>{
  const s = new Set();
  SCORE.bars.forEach(b=>VOICES.forEach(v=>(b.V[v]||[]).forEach(ev=>s.add(ev[2]))));
  return [...s].sort((a,b)=>a-b);
})();

/* ============================================================
   3. 设定
   ============================================================ */
const DEFAULTS = {
  theme:"light", follow:true, tempo:SCORE.tempo, volume:100,
  timbre:"church_organ", parts:{S:true,A:true,T:true,B:true},
  lyricFont:"hei", bold:true, scale:100, metronome:true, lang:"s", autowrap:true, capo:0
};
const STORE_KEY = "ys.settings." + SONG_ID + ".v2";
function loadSettings(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return Object.assign({}, DEFAULTS);
    const s = JSON.parse(raw);
    return Object.assign({}, DEFAULTS, s, {parts:Object.assign({}, DEFAULTS.parts, s.parts||{})});
  }catch(e){ return Object.assign({}, DEFAULTS); }
}
let settings = loadSettings();
let theme = settings.theme === "dark" ? "dark" : "light";
let follow = !!settings.follow;
let lyricFont = LYRIC_FONTS[settings.lyricFont] ? settings.lyricFont : "hei";
let bold = true;   /* 字体自定义已移除：歌词固定加粗 */
let autowrap = settings.autowrap !== false;
let scale = Math.max(80, Math.min(150, +settings.scale || 100));
let capo = Math.max(0, Math.min(12, +settings.capo || 0));
let lang = settings.lang === "s" ? "s" : "t";

/* ============================================================
   4. 引擎
   ============================================================ */
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

class Engine{
  constructor(score){
    this.score = score;
    this.tempo = +settings.tempo || score.tempo;
    this.parts = Object.assign({}, settings.parts);
    this.timbre = TIMBRES[settings.timbre] ? settings.timbre : "church_organ";
    this.volume = Math.max(0,Math.min(1,(+settings.volume)/100));
    this.metronome = !!settings.metronome;
    this.playing = false;
    this.ctx = null; this.master = null; this.instGain = null;
    this.usePerf = false; this.audioBlocked = false;
    this.anchorBeat = 0; this.anchorTime = 0;
    this.scheduledUpTo = 0; this.clickUpTo = 0;
    this.rangeStart = 0; this.rangeEnd = TOTAL_BEATS; this.loopSelect = false;
    this.repeat = null; this.repeatDone = false;
    this.dc = null; this.dcDone = false;
    this.clickStep = 1;
    this.timer = null; this.lookahead = 0.14; this.tickMs = 45;
    this.inst = null; this.instName = null;
    this.audioSupported = !!(window.AudioContext || window.webkitAudioContext);
    this.unavailableNotified = false;
    this.loading = null; this.sampleFailed = false; this.progress = null;
    this.activeSynth = new Set();
    this.activeClicks = new Set();
    this.activeSampleStops = new Set();
    this.playToken = 0;
    this.onEnd = null; this.onAudioBlocked = null; this.onProgress = null;
    this.onReady = null; this.onUnavailable = null;
    this.buildTimeline();
  }
  buildTimeline(){
    const evs = [];
    this.score.bars.forEach((bar,bi)=>{
      VOICES.forEach(v=>{
        (bar.V[v]||[]).forEach((ev,i)=>{
          const [b,d,p,syl] = ev;
          evs.push({bar:bi,voice:v,idx:i,beat:BAR_START[bi]+b,dur:d,midi:p,syl});
        });
      });
    });
    /* 同音连音线＝延音：后音不再发声，并入前音时值 */
    const byKey = new Map();
    evs.forEach(ev=>byKey.set(ev.bar+":"+ev.voice+":"+ev.idx, ev));
    SLURS.forEach(([bi,v,i1,i2])=>{
      const group = [];
      for (let k=i1;k<=i2;k++){ const e = byKey.get(bi+":"+v+":"+k); if (e) group.push(e); }
      if (group.length < 2) return;
      if (!group.every(e=>e.midi === group[0].midi)) return;      /* 不同音高＝圆滑，不合并 */
      const last = group[group.length-1];
      if (v === "S" && last.syl !== null && last.syl !== undefined && SCORE.lyrics[0][last.syl]) return; /* 新音节＝重新发声 */
      group[0].dur = Math.max(group[0].dur, (last.beat + last.dur) - group[0].beat);
      for (let k=1;k<group.length;k++) group[k].skip = true;
    });
    /* 跨小节同音连音线＝延音：后音不发声，并把前音时值补到后音结束 */
    TIES.forEach(([a,b])=>{
      const e1 = byKey.get(a[0]+":"+a[1]+":"+a[2]);
      const e2 = byKey.get(b[0]+":"+b[1]+":"+b[2]);
      if (!e1 || !e2 || e1.midi !== e2.midi) return;
      e1.dur = Math.max(e1.dur, (e2.beat + e2.dur) - e1.beat);
      e2.skip = true;
    });
    const playable = evs.filter(ev=>!ev.skip);
    evs.length = 0;
    playable.forEach(ev=>evs.push(ev));
    evs.sort((a,b)=>(a.beat-b.beat)||(a.voice<b.voice?-1:1));
    this.events = evs; this.totalBeats = TOTAL_BEATS;
  }
  ensureCtx(){
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC){ this.audioSupported = false; return null; }
    try { this.ctx = new AC({latencyHint:"interactive"}); }
    catch(e){ this.audioSupported = false; return null; }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 22; comp.ratio.value = 3;
    comp.attack.value = 0.004; comp.release.value = 0.24;
    this.master.connect(comp); comp.connect(this.ctx.destination);
    this.instGain = this.ctx.createGain();
    this.instGain.gain.value = (TIMBRES[this.timbre] && TIMBRES[this.timbre].gain) || 1;
    this.instGain.connect(this.master);
    this.ctx.onstatechange = ()=>{
      if (!this.ctx) return;
      if (this.ctx.state==="running" && this.usePerf){
        const pos = this.position;
        this.usePerf = false; this.anchorBeat = pos; this.anchorTime = this.ctx.currentTime;
        this.scheduledUpTo = Math.max(this.scheduledUpTo,pos);
        this.audioBlocked = false;
        if (this.onAudioBlocked) this.onAudioBlocked(false);
      } else if (this.ctx.state!=="running" && !this.usePerf && this.playing){
        const pos = this.position;
        this.usePerf = true; this.anchorBeat = pos; this.anchorTime = performance.now()/1000;
      }
    };
    return this.ctx;
  }
  clockNow(){
    if (this.usePerf || !this.ctx || this.ctx.state!=="running") return performance.now()/1000;
    return this.ctx.currentTime;
  }
  audioReady(){ return !!(this.ctx && this.ctx.state==="running" && !this.usePerf); }
  get position(){
    if (!this.playing) return this.anchorBeat;
    const t = this.clockNow();
    if (this.repeat && this.repeatDone && t < this.anchorTime){
      /* 已排到反覆点、但实际时间还沒到：仍显示原时间轴 */
      return this.repeat.end + (t - this.anchorTime)*this.tempo/60;
    }
    return this.anchorBeat + (t - this.anchorTime)*this.tempo/60;
  }
  timeAt(beat){ return this.anchorTime + (beat-this.anchorBeat)*60/this.tempo; }

  isTimbreReady(){
    return this.instName === this.timbre && !!this.inst;
  }
  async loadTimbre(id){
    const def = TIMBRES[id];
    if (!def) return null;
    if (this.instName === id && this.inst) return this.inst;
    if (this.sampleFailed) return null;
    if (this.loading){ try{ await this.loading; }catch(e){} }
    if (this.instName === id && this.inst) return this.inst;
    this.loading = (async ()=>{
      try{
        const mod = await import("https://cdn.jsdelivr.net/npm/smplr@1.2.0/dist/index.mjs");
        const ctx = this.ensureCtx();
        if (!ctx) return null;
        const opts = {
          instrument:id, kit:"MusyngKite", destination:this.instGain,
          notesToLoad:{notes:SCORE_PITCHES, fallback:"nearest"},
          onLoadProgress:({loaded,total})=>{
            this.progress = {loaded,total,id};
            if (this.onProgress) this.onProgress(this.progress);
          }
        };
        if (window.isSecureContext && mod.CacheStorage){
          try{ opts.storage = mod.CacheStorage(); }catch(e){}
        }
        const inst = mod.Soundfont(ctx, opts);
        await inst.ready;
        if (this.instGain) this.instGain.gain.value = def.gain || 1;
        if (this.inst && this.inst.dispose){ try{ this.inst.dispose(); }catch(e){} }
        this.inst = inst; this.instName = id;
        this.progress = {loaded:1,total:1,id};
        if (this.onProgress) this.onProgress(this.progress);
        return inst;
      }catch(e){
        this.sampleFailed = true; this.progress = null;
        if (this.onProgress) this.onProgress(null);
        return null;
      }finally{ this.loading = null; }
    })();
    try { return await this.loading; }
    finally { this.loading = null; }
  }

  async play(fromBeat, keepRepeat){
    const token = ++this.playToken;
    /* 立即停掉目前播放與已排程音符/節拍，避免重複點擊時疊音 */
    this.playing = false;
    if (this.timer){ clearInterval(this.timer); this.timer = null; }
    this.stopAll();
    const ctx = this.ensureCtx();
    if (!ctx){
      this.usePerf = true; this.audioBlocked = true;
      if (!this.unavailableNotified){
        this.unavailableNotified = true;
        if (this.onUnavailable) this.onUnavailable();
      }
    } else if (ctx.state!=="running"){
      try{ await Promise.race([ctx.resume(), sleep(420)]); }catch(e){}
    }
    if (token !== this.playToken) return;
    const blocked = !ctx || ctx.state!=="running";
    this.usePerf = blocked;
    if (this.audioBlocked !== blocked){
      this.audioBlocked = blocked;
      if (this.onAudioBlocked) this.onAudioBlocked(blocked);
    }
    if (typeof fromBeat === "number") this.seek(fromBeat, keepRepeat);
    this.playing = true;
    this.anchorTime = this.clockNow()+0.04;
    this.scheduledUpTo = this.anchorBeat;
    this.clickUpTo = Math.ceil(this.anchorBeat-1e-6);
    this.scheduleUntil(this.timeAt(this.anchorBeat)+this.lookahead+0.06);
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(()=>this.tick(),this.tickMs);
    /* 取样音源在背景载入：未就緒先以合成发声，完成后自动接上 */
    if (ctx && !blocked && !this.sampleFailed && !this.isTimbreReady()){
      const id = this.timbre;
      if (this.onSynthWhileLoading) this.onSynthWhileLoading(id);
      this.loadTimbre(id).then(inst=>{ if (inst && this.onReady) this.onReady(id); });
    }
  }
  pause(){
    this.playToken++;
    if (!this.playing) return;
    this.anchorBeat = this.position;
    this.playing = false;
    clearInterval(this.timer); this.timer = null;
    this.stopAll();
  }
  stop(){
    this.playToken++;
    this.playing = false;
    clearInterval(this.timer); this.timer = null;
    this.stopAll();
    if (this.dcDone){ this.dcDone = false; this.rangeEnd = this.totalBeats; }
    this.repeatDone = false;
    this.anchorBeat = this.rangeStart;
  }
  seek(beat, keepRepeat){
    beat = Math.max(0,Math.min(this.totalBeats-1e-6,beat));
    if (this.dcDone && (beat >= this.rangeEnd-1e-6 || beat < this.rangeStart)){
      this.dcDone = false; this.rangeEnd = this.totalBeats;
    }
    if (!keepRepeat || (this.repeat && beat < this.repeat.start - 1e-6)){
      this.repeatDone = !!(this.repeat && beat >= this.repeat.end-1e-6);
    }
    this.stopAll();
    this.anchorBeat = beat;
    this.anchorTime = this.clockNow()+0.02;
    this.scheduledUpTo = beat;
    this.clickUpTo = Math.ceil(beat-1e-6);
    if (this.playing) this.scheduleUntil(this.timeAt(beat)+this.lookahead+0.06);
  }
  setRange(a,b,loop){
    if (this.dcDone){ this.dcDone = false; this.rangeEnd = this.totalBeats; }
    this.rangeStart = Math.max(0,Math.min(this.totalBeats-1e-6,a));
    this.rangeEnd = Math.max(this.rangeStart+1e-6,Math.min(this.totalBeats,b));
    this.loopSelect = !!loop;
    if (this.anchorBeat < this.rangeStart || this.anchorBeat >= this.rangeEnd) this.anchorBeat = this.rangeStart;
  }
  tick(){
    if (!this.playing) return;
    const pos = this.position;
    /* D.C. al Fine：线性奏完 → 回到开头 → 到 Fine 停 */
    if (this.dc && !this.dcDone && !this.loopSelect && pos >= this.totalBeats-1e-6){
      this.dcDone = true;
      this.stopAll();
      this.anchorBeat = 0;
      this.anchorTime = this.clockNow();
      this.scheduledUpTo = 0;
      this.clickUpTo = 0;
      this.rangeEnd = this.dc.stopAt;
      this.scheduleUntil(this.timeAt(0)+this.lookahead+0.06);
      return;
    }
    if (this.repeat && !this.loopSelect && !this.repeatDone && pos >= this.repeat.end-1e-6){
      this.repeatDone = true;
      this.stopAll();
      this.anchorBeat = this.repeat.start;
      this.anchorTime = this.clockNow()+0.02;
      this.scheduledUpTo = this.repeat.start;
      this.clickUpTo = Math.ceil(this.repeat.start-1e-6);
      this.scheduleUntil(this.timeAt(this.repeat.start)+this.lookahead+0.06);
      return;
    }
    if (pos >= this.rangeEnd-1e-6){
      if (this.loopSelect){
        this.stopAll();
        this.anchorBeat = this.rangeStart;
        this.anchorTime = this.clockNow()+0.02;
        this.scheduledUpTo = this.rangeStart;
        this.clickUpTo = Math.ceil(this.rangeStart-1e-6);
        this.scheduleUntil(this.timeAt(this.rangeStart)+this.lookahead+0.06);
        return;
      }
      this.playing = false;
      clearInterval(this.timer); this.timer = null;
      this.stopAll();
      this.repeatDone = false;   /* 自然播完＝下一次从第一遍开始 */
      this.anchorBeat = this.dcDone ? 0 : this.rangeEnd;
      if (this.dcDone){ this.dcDone = false; this.rangeEnd = this.totalBeats; }
      if (this.onEnd) this.onEnd();
      return;
    }
    this.scheduleUntil(this.timeAt(pos)+this.lookahead);
  }
  scheduleUntil(untilTime){
    if (!this.audioReady()) return;
    const evs = this.events;
    let i = lowerBound(evs, this.scheduledUpTo);
    while (i < evs.length){
      const ev = evs[i];
      if (ev.beat >= this.rangeEnd-1e-9) break;
      const t = this.timeAt(ev.beat);
      if (t > untilTime) break;
      if (this.parts[ev.voice]){
        const durSec = ev.dur * 60 / this.tempo;
        if (isFinite(ev.midi) && isFinite(t) && isFinite(durSec)){
          this.note(ev.midi, Math.max(t,this.ctx.currentTime), durSec, ev.voice);
        }
      }
      i++;
      this.scheduledUpTo = ev.beat+1e-6;
    }
    if (this.metronome) this.scheduleClicks(untilTime);
    /* 反覆：提前把时间轴接回反覆起点，避免换段空拍 */
    if (this.repeat && !this.loopSelect && !this.repeatDone){
      const endT = this.timeAt(this.repeat.end);
      if (untilTime >= endT - 1e-9){
        this.repeatDone = true;
        this.anchorBeat = this.repeat.start;
        this.anchorTime = endT;
        this.scheduledUpTo = this.repeat.start;
        this.clickUpTo = Math.ceil(this.repeat.start-1e-6);
        this.scheduleUntil(untilTime);
      }
    }
  }
  scheduleClicks(untilTime){
    while (true){
      const beat = this.clickUpTo;
      if (beat >= this.rangeEnd-1e-9) break;
      const t = this.timeAt(beat);
      if (t > untilTime) break;
      const onGrid = this.clickStep<=1 || Math.abs(((beat%this.clickStep)+this.clickStep)%this.clickStep) < 1e-6;
      if (t >= this.ctx.currentTime-0.02 && onGrid){
        const isBar = BAR_START.some(s=>Math.abs(s-beat)<1e-6);
        this.click(Math.max(t,this.ctx.currentTime), isBar);
      }
      this.clickUpTo = beat+1;
    }
  }
  click(time,accent){
    if (!this.ctx || !isFinite(time)) return;
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "square"; o.frequency.value = accent?1750:1150;
    g.gain.setValueAtTime(0.0001,time);
    g.gain.exponentialRampToValueAtTime(accent?0.16:0.09,time+0.002);
    g.gain.exponentialRampToValueAtTime(0.0001,time+0.045);
    o.connect(g); g.connect(this.master);
    o.start(time); o.stop(time+0.06);
    this.activeClicks.add(o);
    o.onended = ()=>{ this.activeClicks.delete(o); };
  }
  note(midi,time,durSec,part){
    if (this.inst && this.audioReady()){
      try{
        const stopFn = this.inst.start({note:midi,velocity:86,time,duration:Math.max(0.1,durSec*0.96)});
        if (typeof stopFn === "function") this.activeSampleStops.add(stopFn);
        return;
      }catch(e){}
    }
    this.synth(midi,time,durSec);
  }

  synth(midi,when,durSec){
    const ctx = this.ctx;
    if (!ctx) return;
    if (!isFinite(when) || !isFinite(durSec) || !isFinite(midi)) return;
    const t0 = Math.max(when,ctx.currentTime), dur = Math.max(0.12,durSec);
    const base = 440*Math.pow(2,(midi-69)/12);
    const g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = 2600; f.Q.value = 0.7;
    g.connect(f); f.connect(this.master);
    g.gain.setValueAtTime(0.0001,t0);
    g.gain.exponentialRampToValueAtTime(0.16,t0+0.006);
    g.gain.exponentialRampToValueAtTime(0.0001,t0+Math.min(dur+0.15,2.2));
    [[1,1,"triangle"],[2,.35,"sine"],[3,.15,"sine"]].forEach(([m,a,type])=>{
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = type; o.frequency.value = base*m; og.gain.value = a;
      o.connect(og); og.connect(g);
      o.start(t0); o.stop(t0+Math.min(dur+0.2,2.4));
      this.activeSynth.add(o); o.onended = ()=>this.activeSynth.delete(o);
    });
  }
  stopAll(){
    if (this.activeSampleStops){
      this.activeSampleStops.forEach(fn=>{ try{ fn(); }catch(e){} });
      this.activeSampleStops.clear();
    }
    if (this.inst && this.inst.stop){ try{ this.inst.stop(); }catch(e){} }
    const now = this.ctx ? this.ctx.currentTime : 0;
    this.activeSynth.forEach(n=>{ try{ n.stop(now+0.03); }catch(e){} });
    this.activeSynth.clear();
    if (this.activeClicks){
      this.activeClicks.forEach(n=>{ try{ n.stop(now+0.02); }catch(e){} });
      this.activeClicks.clear();
    }
  }
  setTempo(bpm){
    const pos = this.position;
    this.tempo = Math.max(20,Math.min(400,bpm));
    if (this.ctx){ this.anchorBeat = pos; this.anchorTime = this.clockNow(); this.scheduledUpTo = Math.max(this.scheduledUpTo,pos); }
  }
  setVolume(v){
    this.volume = Math.max(0,Math.min(1,v));
    if (this.master) this.master.gain.value = this.volume;
  }
}
function lowerBound(arr,beat){
  let lo=0,hi=arr.length;
  while(lo<hi){ const mid=(lo+hi)>>1; if (arr[mid].beat<beat) lo=mid+1; else hi=mid; }
  return lo;
}

/* ============================================================
   5. 画面
   ============================================================ */
const $ = (s)=>document.querySelector(s);
const engine = new Engine(SCORE);
document.addEventListener("DOMContentLoaded", ()=>{
  const back = document.querySelector(".back");
  if (back) back.addEventListener("click", ()=>{ resumeOnVisible = false; try{ engine.stop(); setPlayUI(false); }catch(e){} });
});
engine.clickStep = SCORE.clickStep || 1;
if (SCORE.repeat) engine.repeat = { start: BAR_START[SCORE.repeat.from], end: BAR_END[SCORE.repeat.to] };
if (SCORE.dc) engine.dc = { stopAt: BAR_END[SCORE.dc.to] };   /* D.C. al Fine：奏完直回开头，到 Fine 收 */
const scoreEl = $("#score");
let barEls = [], tokens = [];
let sel = null;
let press = null, pressTimer = 0;

document.documentElement.dataset.theme = theme;
document.documentElement.style.setProperty("--lyric-font", LYRIC_FONTS[lyricFont]);
document.documentElement.style.setProperty("--lyric-weight", bold ? 600 : 400);
document.documentElement.style.setProperty("--scale", (scale/100) * 1.2);

const evId = (bi,v,i)=>`${bi}:${v}:${i}`;
const ICONS = {
  play:'<svg class="ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l10.5-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14z"/></svg>',
  pause:'<svg class="ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4.5" width="4.2" height="15" rx="1.2"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.2"/></svg>',
  sun:'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon:'<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
};

function escHtml(v){ return String(v==null?"":v).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function meterStackHTML(m){
  const parts = String(m||"").split("/");
  if (parts.length !== 2) return escHtml(m || "");
  return `<span class="meter-stack"><b>${escHtml(parts[0])}</b><i>${escHtml(parts[1])}</i></span>`;
}
const SHARP_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const FLAT_NAMES  = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
const ROOT_PC = {"C":0,"C#":1,"Db":1,"D":2,"D#":3,"Eb":3,"E":4,"F":5,"F#":6,"Gb":6,"G":7,"G#":8,"Ab":8,"A":9,"A#":10,"Bb":10,"B":11};
function transposeRoot(root, semitones, preferFlat){
  const pc = ROOT_PC[root];
  if (pc === undefined) return root;
  const n = ((pc - semitones) % 12 + 12) % 12;
  return (preferFlat ? FLAT_NAMES : SHARP_NAMES)[n];
}
const KEY_NAME_BY_PC = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
const FLAT_KEY_NAMES = {"Db":1,"Eb":1,"F":1,"Gb":1,"Ab":1,"Bb":1};
function capoPreferFlat(){
  const m = String(SCORE.key || 'C').match(/^([A-G][#b]?)/);
  if (!m) return false;
  const pc = ROOT_PC[m[1]];
  if (pc === undefined) return false;
  const targetPc = ((pc - capo) % 12 + 12) % 12;
  return !!FLAT_KEY_NAMES[KEY_NAME_BY_PC[targetPc]];
}
function transposeChord(chord, semitones, preferFlat){
  if (!semitones) return chord;
  const parts = String(chord).split('/');
  const main = parts[0].match(/^([A-G][#b]?)(.*)$/);
  if (!main) return chord;
  let out = transposeRoot(main[1], semitones, preferFlat) + main[2];
  if (parts[1]){
    const bass = parts[1].match(/^([A-G][#b]?)(.*)$/);
    if (bass) out += '/' + transposeRoot(bass[1], semitones, preferFlat) + bass[2];
    else out += '/' + parts[1];
  }
  return out;
}
function chordSpelling(part){
  /* 只看根音（及低音）的升降号，后缀里的 b（如 m7b5）不参与判断 */
  const m = String(part || '').match(/^([A-G][#b]?)/);
  if (!m || m[1].length < 2) return null;
  return m[1][1] === 'b';
}
function transposeChordText(text, semitones){
  if (!semitones) return text;
  const keyFlat = capoPreferFlat();
  return String(text).split(' · ').map(c=>{
    /* 和弦本身带降号就沿用降号记法，避免原谱的 Bb/F 变成 A#/F */
    const parts = String(c).split('/');
    const own = chordSpelling(parts[0]);
    const bassOwn = own === null && parts[1] ? chordSpelling(parts[1]) : null;
    const flat = own !== null ? own : (bassOwn !== null ? bassOwn : keyFlat);
    return transposeChord(c, semitones, flat);
  }).join(' · ');
}
/* 贝司「弦.品」记号随变调夹保音高换算：同弦减 capo，0 写 x，
   品数不够时换低音弦的等效位置，x 一律小写。 */
const MARK_OPEN = {1:43, 2:38, 3:33, 4:28};   // G2 / D2 / A1 / E1
function transposeMark(mark, capo){
  const t = String(mark || '').trim();
  const m = /^([1-4])(?:\.(\d+)|x)$/i.exec(t);
  if (!m) return t.replace(/X/g, 'x');
  if (!capo) return t.replace(/X/g, 'x');
  const str = +m[1], fret = m[2] ? +m[2] : 0;
  const pitch = MARK_OPEN[str] + fret;
  /* 变调夹只会升高音高，故只能往更低音的弦（编号更大）找等效位置，不能跳高八度 */
  for (let s = str; s <= 4; s++){
    const r = pitch - MARK_OPEN[s] - capo;
    if (Number.isFinite(r) && r >= 0 && r <= 24){
      return String(s) + (r === 0 ? 'x' : '.' + r);
    }
  }
  /* 原音低于「Capo + 最低弦空弦」时无法按原音高演奏，保留原记号 */
  return t.replace(/X/g, 'x');
}
function applyCapo(){
  document.querySelectorAll('#score .fret-mark[data-mark]').forEach(el=>{
    el.textContent = transposeMark(el.getAttribute('data-mark'), capo);
  });
  document.querySelectorAll('#score .chordrow span[data-chord]').forEach(el=>{
    const disp = transposeChordText(el.getAttribute('data-chord'), capo);
    el.textContent = disp; el.title = disp;
  });
  const badge = document.getElementById('scoreCapo');
  if (badge){
    badge.textContent = capo ? ('Capo ' + capo) : '';
    badge.style.display = capo ? '' : 'none';
  }
  fixChordOverlaps();
}
function fixBeams(){
  document.querySelectorAll('#score .cell.sub').forEach(cell=>{
    Array.prototype.slice.call(cell.querySelectorAll('.group-beam')).forEach(e=>e.remove());
    const notes = Array.prototype.slice.call(cell.querySelectorAll('.note')).filter(n=>n.querySelector('.num'));
    if (notes.length < 2) return;
    const nums = notes.map(n=>n.querySelector('.num'));
    const cr = cell.getBoundingClientRect();
    const first = nums[0].getBoundingClientRect();
    const last = nums[nums.length-1].getBoundingClientRect();
    const u = notes[0].querySelector('.u1');
    const y = u ? u.getBoundingClientRect().bottom - cr.top : (first.bottom - cr.top + 2);
    const line = document.createElement('i');
    line.className = 'group-beam';
    line.style.left = (first.left - cr.left) + 'px';
    line.style.width = Math.max(6, last.right - first.left) + 'px';
    line.style.top = y + 'px';
    cell.appendChild(line);
    notes.forEach(n=>{ const uu=n.querySelector('.u1'); if (uu) uu.style.display='none'; });
  });
}
function alignChords(){
  document.querySelectorAll('#score .bar').forEach(bar=>{
    const row=bar.querySelector('.chordrow'); if(!row) return;
    const spans=Array.prototype.slice.call(row.children);
    let vrow=bar.querySelector('.vrow[data-vrow="S"]');
    if (!vrow) vrow=bar.querySelector('.vrow');
    if (!vrow) return;
    const cells=Array.prototype.slice.call(vrow.children).filter(c=>c.classList && c.classList.contains('cell'));
    spans.forEach((span,ci)=>{
      span.dataset.align='0';
      span.dataset.shift='0';
      span.style.transform='';
      if(!span.textContent.trim()) return;
      const cell=cells[ci]; if(!cell) return;
      const note=cell.querySelector('.note .num') || cell.querySelector('.note');
      const tail=cell.querySelector('.tail');
      const sr=span.getBoundingClientRect();
      let dx=null;
      span.style.textAlign='left';
      if(note){
        dx=note.getBoundingClientRect().left - sr.left;
      } else if(tail){
        span.style.textAlign='center';
        const tr=tail.getBoundingClientRect();
        dx=(tr.left + tr.width/2) - (sr.left + sr.width/2);
      }
      if (dx !== null && isFinite(dx)){ span.dataset.align=String(dx); span.style.transform='translateX('+dx+'px)'; }
    });
  });
}
function fixChordOverlaps(){
  document.querySelectorAll('#score .chordrow').forEach(row=>{
    const spans = Array.prototype.slice.call(row.children).filter(s=>s.textContent.trim());
    spans.forEach(s=>{
      const base = +(s.dataset.align || 0);
      s.dataset.shift = '0';
      s.style.transform = base ? ('translateX(' + base + 'px)') : '';
    });
    const ink = s=>{ const r=document.createRange(); r.selectNodeContents(s); return r.getBoundingClientRect(); };
    /* 首和弦若压住小节序号（序号居中于小节线，会伸进小节内），整体右移让开 */
    const bar = row.closest('.bar');
    const bnum = bar && bar.querySelector('.bnum');
    if (bnum && spans.length){
      const bn = bnum.getBoundingClientRect();
      const first = ink(spans[0]);
      if (bn.width > 0 && first.left < bn.right + 1 && first.bottom > bn.top && first.top < bn.bottom){
        const shift = Math.ceil(bn.right + 1 - first.left);
        spans[0].dataset.shift = String(shift);
        spans[0].style.transform = 'translateX(' + ((+(spans[0].dataset.align || 0)) + shift) + 'px)';
      }
    }
    for (let i=0;i<spans.length-1;i++){
      const a = ink(spans[i]), b = ink(spans[i+1]);
      if (a.right > b.left - 1){
        const baseNext = +(spans[i+1].dataset.align || 0);
        const prev = +(spans[i+1].dataset.shift || 0);
        const shift = prev + Math.ceil(a.right - b.left + 2);
        spans[i+1].dataset.shift = String(shift);
        spans[i+1].style.transform = 'translateX(' + (baseNext + shift) + 'px)';
      }
    }
  });
}
function renderBar(bi, verseIdxs, hasHum){
  const bar = SCORE.bars[bi], n = bar.beats;
  const tripCells = new Set();
  VOICES.forEach(v=>layoutVoice(bar,v).forEach((c,i)=>{ if (c.type==="triplet") tripCells.add(i); }));
  const chordCells = Array.from({length:n},()=>"");
  /* 贝司版：原图在音符上方标「弦.品」（3.3 等），不写和弦名；随变调夹保音高换算 */
  const markMode = !!SCORE.markMode;
  (bar.chords||[]).forEach(([b,label])=>{
    const c = Math.min(n-1,Math.max(0,Math.round(b)));
    chordCells[c] = chordCells[c] ? chordCells[c]+" · "+label : label;
  });
  if (markMode){
    (bar.marks||[]).forEach(([b,label])=>{
      const c = Math.min(n-1,Math.max(0,Math.round(b)));
      chordCells[c] = chordCells[c] ? chordCells[c]+" · "+label : label;
    });
  }

  const basis = Math.max(n*1.75 + 0.5, 3.2);
  const EBAR = {thinThick:"endbar-thin-thick", doubleThin:"endbar-double-thin"};
  const ebar = EBAR[bar.endbar] || "";
  let h = `<div class="bar${(bi===SCORE.bars.length-1 && !bar.endbar)?" final":""}${ebar?` ${ebar}`:""}${bi===(SCORE.repeat?SCORE.repeat.to:-1)?" repeat-end":""}${bi===(SCORE.repeat?SCORE.repeat.from:-1)?" repeat-start":""}" data-bar="${bi}" style="flex:0.25 1 ${basis.toFixed(2)}em;max-width:${(basis*2.1).toFixed(2)}em"><span class="play-frame" aria-hidden="true"></span>`;
  let meterHTML = "";
  if (bar.meter){
    const prevMeter = bi>0 ? (SCORE.bars[bi-1].meter || SCORE.meter) : null;
    if (bi===0 || bar.meter !== prevMeter){
      meterHTML = `<span class="bar-meter">${meterStackHTML(bar.meter)}</span>`;
    }
  }
  h += meterHTML;
  /* 小节序号与和弦同一行并居中于小节线；拍号在其上方，序号始终保留 */
  h += `<span class="bnum">${bi+1}${bar.tag?`<span class="btag">${escHtml(bar.tag)}</span>`:""}</span>`;
  if (SCORE.dc && SCORE.dc.from === bi) h += `<span class="dc-mark">D.C. al Fine</span>`;
  if (SCORE.dc && SCORE.dc.to === bi) h += `<span class="dc-mark">Fine</span>`;
  h += `<div class="chordrow" style="grid-template-columns:repeat(${n},minmax(0,1fr))">`;
  chordCells.forEach((c,ci)=>{
    if (markMode){
      h += `<span class="fret-mark${ci===0 && c ? ' chord-first' : ''}" data-mark="${escHtml(c)}">${escHtml(transposeMark(c, capo))}</span>`;
      return;
    }
    const disp = transposeChordText(c, capo);
    h += `<span class="${ci===0 && c ? 'chord-first' : ''}" data-chord="${escHtml(c)}" title="${escHtml(disp)}">${escHtml(disp)}</span>`;
  });
  h += `</div>`;

  const voiceRow = (v)=>{
    const cells = layoutVoice(bar,v);
    let r = `<div class="vrow" data-vrow="${v}" style="grid-template-columns:repeat(${n},minmax(0,1fr))">`;
    cells.forEach((cell,ci)=>{
      const align = tripCells.has(ci) && cell.type!=="triplet" ? " start" : "";
      if (cell.type==="empty") r += `<div class="cell${align}" data-rest="1" data-bs="${ci}"><span class="rest">0</span></div>`;
      else if (cell.type==="note"){
        const d = cell.ev[1];
        let underline=0, dot=0, dashN=0;
        if (SCORE.compound){
          underline = d===1?1:0; dot = (d===3||d===5)?1:0; dashN = d>=4 ? Math.floor(d/2)-1 : 0;
        } else {
          underline = d<0.75?1:0; dot = Math.abs(d-1.5)<1e-6?1:0; dashN = d>=1.75 ? Math.round(d)-1 : 0;
        }
        const nh = noteHTML(midiToJianpu(cell.ev[2] + 12*(VOICE_OCT[v]||0)), {underline, dot, noOctDot: cell.ev[5]==="nodot"});
        const bs = cell.ev[0], bd = SCORE.compound ? d : Math.min(1, d);
        const dashes = (SCORE.compound && dashN>0) ? `<span class="dash">${"<i></i>".repeat(dashN)}</span>` : "";
        r += `<div class="cell${align}"><span class="note ${nh.cls}" data-id="${evId(bi,v,cell.idx)}" data-bs="${bs}" data-bd="${bd}" data-bar="${bi}" data-voice="${v}" data-idx="${cell.idx}">${nh.html}${dashes}</span></div>`;
      } else if (cell.type==="tail"){
        r += `<div class="cell${align}">${SCORE.compound ? '' : `<span class="tail" data-bs="${ci}" data-bd="1">–</span>`}</div>`;
      } else if (cell.type==="sub"){
        r += `<div class="cell sub">`;
        cell.list.forEach(({ev,idx}, ni)=>{
          const d = ev[1];
          let underline=0, dot=0;
          if (SCORE.compound){ underline = d===1?1:0; dot = (d===3||d===5)?1:0; }
          else { underline = d<0.75?1:0; dot = Math.abs(d-1.5)<1e-6?1:0; }
          const nh = noteHTML(midiToJianpu(ev[2] + 12*(VOICE_OCT[v]||0)), {underline, dot, beam: cell.list.length>1, beamLast: cell.list.length>1 && ni===cell.list.length-1, noOctDot: ev[5]==="nodot"});
          const left = (ev[0]-ci)*100, width = Math.max(22, d*100);
          r += `<span class="note ${nh.cls}" style="left:${left}%;width:${width}%" data-id="${evId(bi,v,idx)}" data-bs="${ev[0]}" data-bd="${d}" data-bar="${bi}" data-voice="${v}" data-idx="${idx}">${nh.html}</span>`;
        });
        r += `</div>`;
      } else {
        let inner = "";
        cell.list.forEach(({ev,idx})=>{
          const nh = noteHTML(midiToJianpu(ev[2]));
          inner += `<span class="note ${nh.cls}" data-id="${evId(bi,v,idx)}" data-bs="${ev[0]}" data-bd="${ev[1]}" data-bar="${bi}" data-voice="${v}" data-idx="${idx}">${nh.html}</span>`;
        });
        r += `<div class="cell trip"><i class="trip-arc"></i><span class="trip-mark">3</span><span class="trip-notes">${inner}</span></div>`;
      }
    });
    return r + `</div>`;
  };

  if (SHOW_VOICES.indexOf("S")>=0) h += voiceRow("S");
  if (SHOW_VOICES.indexOf("A")>=0) h += voiceRow("A");
  const sCells = layoutVoice(bar,"S");
  (verseIdxs || SCORE.lyrics.map((_,i)=>i)).forEach((vi)=>{
    const verse = SCORE.lyrics[vi] || [];
    let r = `<div class="lrow" style="grid-template-columns:repeat(${n},minmax(0,1fr))">`;
    sCells.forEach((cell,ci)=>{
      const align = tripCells.has(ci) ? " start" : "";
      let txt = "";
      if (cell.type==="note"){
        const s = cell.ev[3];
        txt = (s!==null && s!==undefined && verse[s]) ? verse[s] : "";
      } else if (cell.type==="triplet"){
        const s = cell.list[0].ev[3];
        txt = (s!==null && s!==undefined && verse[s]) ? verse[s] : "";
      } else if (cell.type==="sub"){
        r += `<div class="cell sub">`;
        cell.list.forEach(({ev})=>{
          const s = ev[3];
          const t = (s!==null && s!==undefined && verse[s]) ? verse[s] : "";
          const left = (ev[0]-ci)*100, width = Math.max(22, ev[1]*100);
          r += `<span class="lsub" style="left:${left}%;width:${width}%"><span>${escHtml(t)}</span></span>`;
        });
        r += `</div>`;
        return;
      }
      r += `<div class="cell${align}"><span>${escHtml(txt)}</span></div>`;
    });
    h += r + `</div>`;
  });
  if (SHOW_VOICES.indexOf("T")>=0) h += voiceRow("T");
  if (hasHum){
    const txt = bar.hum ? escHtml(bar.hum) : "";
    let r = `<div class="lrow hum-row" style="grid-template-columns:repeat(${n},minmax(0,1fr))">`;
    r += `<div class="cell"><span>${txt}</span></div>`;
    for (let k=1;k<n;k++) r += `<div class="cell"></div>`;
    h += r + `</div>`;
  }
  if (SHOW_VOICES.indexOf("B")>=0) h += voiceRow("B");
  return h + `</div>`;
}

/* 依可用宽度自动换行：DP 最小化留白、尽量在乐句起点断行、避免孤行 */
function layoutRows(){
  if (!autowrap) return PHRASES.map(g=>g.slice());
  const fs = parseFloat(getComputedStyle(scoreEl).fontSize) || 16;
  const width = scoreEl.clientWidth || 800;
  const avail = Math.max(160, width - 2.5*fs - 4);
  const unit = 1.75*fs, pad = 0.5*fs;
  const w = SCORE.bars.map(b=>b.beats*unit + pad);
  const n = w.length;
  const MAX_BARS = 6;
  const prefix = [0];
  for (let i=0;i<n;i++) prefix.push(prefix[i]+w[i]);
  const rowW = (i,j)=> prefix[j]-prefix[i];
  const phraseStart = new Set(PHRASES.map(g=>g[0]));
  const dp = new Array(n+1).fill(Infinity);
  const nxt = new Array(n+1).fill(-1);
  dp[n] = 0;
  for (let i=n-1;i>=0;i--){
    for (let j=i+1;j<=n && j-i<=MAX_BARS;j++){
      const rw = rowW(i,j);
      if (rw > avail && j > i+1) break;
      const slack = Math.max(0, avail-rw);
      let cost = Math.pow(slack/avail, 2) * 100;
      if (j<n && !phraseStart.has(j)) cost += 40;      // 非乐句起点断行
      if (j-i===1 && n>1) cost += 28;                  // 孤行
      if (dp[j] + cost < dp[i]){ dp[i] = dp[j]+cost; nxt[i] = j; }
    }
  }
  const rows = [];
  let i = 0;
  while (i < n){
    let j = nxt[i];
    if (j <= i) j = Math.min(n, i+1);                  // 保底
    const row = [];
    for (let k=i;k<j;k++) row.push(k);
    rows.push(row);
    i = j;
  }
  return rows;
}

function render(){
  const rows = layoutRows();
  scoreEl.classList.toggle("nowrap", !autowrap);
  scoreEl.classList.toggle("no-chords", SCORE.bars.every(b=>!(b.chords && b.chords.length) && !(SCORE.markMode && b.marks && b.marks.length)));
  scoreEl.classList.toggle("single-voice", SHOW_VOICES.length === 1);
  scoreEl.innerHTML = "";
  barEls = [];
  LINE_OF_BAR = {};
  rows.forEach((bars,li)=>{
    bars.forEach(bi=>{ LINE_OF_BAR[bi] = li; });
    const line = document.createElement("div");
    line.className = "line";
    line.dataset.line = li;

    const body = document.createElement("div");
    body.className = "line-body";
    const gutter = document.createElement("div");
    gutter.className = "gutter";
    let gh = `<div class="g-cell g-chord"></div>`;
    if (SHOW_VOICES.length>1 && SHOW_VOICES.indexOf("S")>=0) gh += `<div class="g-cell g-voice" data-gv="S">S</div>`;
    if (SHOW_VOICES.length>1 && SHOW_VOICES.indexOf("A")>=0) gh += `<div class="g-cell g-voice" data-gv="A">A</div>`;
    const hasHum = bars.some(bi=>!!SCORE.bars[bi].hum);
    const visVerses = SCORE.lyrics.map((_,vi)=>vi)
      .filter(vi=>vi===0 || LYRIC_SPLIT<0 || bars.some(bi=>barVerseSplit(bi)));
    const showVerseLabels = visVerses.length > 1;
    gh += visVerses.map(vi=>`<div class="g-cell g-lyr">${showVerseLabels?VERSE_LABELS[vi]:""}</div>`).join("");
    if (SHOW_VOICES.length>1 && SHOW_VOICES.indexOf("T")>=0) gh += `<div class="g-cell g-voice" data-gv="T">T</div>`;
    if (hasHum) gh += `<div class="g-cell g-hum"></div>`;
    if (SHOW_VOICES.length>1 && SHOW_VOICES.indexOf("B")>=0) gh += `<div class="g-cell g-voice" data-gv="B">B</div>`;
    gutter.innerHTML = gh;
    const barsWrap = document.createElement("div");
    barsWrap.className = "bars";
    bars.forEach((bi,idx)=>{
      const tmp = document.createElement("div");
      tmp.innerHTML = renderBar(bi, visVerses, hasHum);
      const el = tmp.firstElementChild;
      if (idx === 0) el.classList.add("line-first");
      barsWrap.appendChild(el);
    });
    body.appendChild(gutter);
    body.appendChild(barsWrap);
    line.appendChild(body);
    scoreEl.appendChild(line);
    bars.forEach(bi=>{ barEls[bi] = barsWrap.querySelector(`.bar[data-bar="${bi}"]`); });
  });
  tokens = [];
  collectTokens();
  applySelectionUI();
  applyPartUI();
  drawSlurs();
  alignChords();
  fixChordOverlaps();
  fixBeams();
  fixGroupBeams();
  drawSystemBrackets();
  if (lang === "t") convertTree(scoreEl);
}

/* 同一拍组内的连续短音符：画一条连续符槓，取代逐音符下划线（6/8 每 3 个八分音为一组） */
function fixGroupBeams(){
  document.querySelectorAll('#score .bar').forEach(bar=>{
    const bd = SCORE.bars[+bar.dataset.bar];
    if (!bd) return;
    const mm = String(bd.meter || SCORE.meter || "").match(/^(\d+)\/(\d+)$/);
    const num = mm ? +mm[1] : 4, den = mm ? +mm[2] : 4;
    const groupSize = (den === 8 && num % 3 === 0) ? 3 : 1;
    const gidx = b => Math.floor((b + 1e-6) / groupSize);
    bar.querySelectorAll('.vrow').forEach(row=>{
      const notes = Array.prototype.slice.call(row.querySelectorAll('.note'))
        .filter(n=>n.querySelector('.num'));
      let run = [], lastG = null;
      const flush = ()=>{
        if (run.length >= 2) drawRunBeam(row, run);
        run = [];
      };
      notes.forEach(n=>{
        const u = n.querySelector('.u1');
        const short = u && getComputedStyle(u).display !== 'none';
        const bs = parseFloat(n.dataset.bs);
        const end = bs + parseFloat(n.dataset.bd || "0");
        if (!short){ flush(); lastG = null; return; }
        const g = gidx(bs);
        if (run.length){
          const prev = run[run.length-1];
          const prevEnd = parseFloat(prev.dataset.bs) + parseFloat(prev.dataset.bd || "0");
          if (g !== lastG || bs > prevEnd + 1e-6) flush();
        }
        run.push(n); lastG = g;
      });
      flush();
    });
  });
}
function drawRunBeam(row, notes){
  const rr = row.getBoundingClientRect();
  const first = notes[0].getBoundingClientRect();
  const last = notes[notes.length-1].getBoundingClientRect();
  const u = notes[0].querySelector('.u1');
  if (!u) return;
  const ur = u.getBoundingClientRect();
  const line = document.createElement('i');
  line.className = 'group-beam';
  line.style.left = (first.left - rr.left) + 'px';
  line.style.width = Math.max(6, last.right - first.left) + 'px';
  line.style.top = (ur.bottom - rr.top - 1) + 'px';
  row.appendChild(line);
  notes.forEach(n=>{ const uu = n.querySelector('.u1'); if (uu) uu.style.display = 'none'; });
}

/* 多声部系统括号：参考 lz020 原谱——粗竖线 + 实心尖角弯钩，上下钩向右外扬；
   竖线右缘距首小节细线约 .4em，弯钩跨过细线约 .95em */
function drawSystemBrackets(){
  document.querySelectorAll(".sys-bracket").forEach(el=>el.remove());
  if (SHOW_VOICES.length < 2) return;
  const fs = parseFloat(getComputedStyle(scoreEl).fontSize) || 16;
  const bw = Math.max(2.4, fs*0.2);      /* 粗竖线宽 */
  const ext = fs*0.7;                    /* 端部弯钩向右伸出 */
  const gap = fs*0.14;                   /* 粗线右缘到首小节细线（与行末反复一致） */
  const NS = "http://www.w3.org/2000/svg";
  document.querySelectorAll(".line").forEach(line=>{
    const bar = line.querySelector(".bar");
    if (!bar) return;
    const rows = bar.querySelectorAll(".vrow");
    if (!rows.length) return;
    const first = rows[0], last = rows[rows.length-1];
    const lb = line.getBoundingClientRect();
    const rb = first.getBoundingClientRect(), eb = last.getBoundingClientRect();
    const br = bar.getBoundingClientRect();
    const rise = fs*0.32;
    const x = br.left - lb.left;
    /* 弯钩尾端落在左侧细线的上/下端（S 行顶 / B 行底） */
    const top = rb.top - lb.top;
    const h = eb.bottom - rb.top;
    /* 嵌入图片谱时 iframe 被隐藏，几何全为 0；跳过，避免生成负高度 SVG */
    if (!(h > fs * 0.5) || !(lb.width > 0)) return;
    const W = bw + ext;
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "sys-bracket");
    svg.setAttribute("width", String(W));
    svg.setAttribute("height", String(h));
    svg.setAttribute("viewBox", `0 0 ${W} ${h}`);
    svg.style.left = (x - gap - bw) + "px";
    svg.style.top = top + "px";
    const barRect = document.createElementNS(NS, "rect");
    barRect.setAttribute("x", "0");
    barRect.setAttribute("y", String(rise));
    barRect.setAttribute("width", String(bw));
    barRect.setAttribute("height", String(h - rise*2));
    barRect.setAttribute("fill", "currentColor");
    svg.appendChild(barRect);
    const flags = [
      `M 0 ${rise} C ${bw*0.7} ${rise-rise*0.8} ${ext*0.5} ${rise-rise*0.95} ${bw+ext} 0 ` +
      `C ${ext*0.55} ${rise*0.25} ${bw*1.25} ${rise*0.04} ${bw} ${rise} Z`,
      `M 0 ${h-rise} C ${bw*0.7} ${h-rise+rise*0.8} ${ext*0.5} ${h-rise+rise*0.95} ${bw+ext} ${h} ` +
      `C ${ext*0.55} ${h-rise*0.25} ${bw*1.25} ${h-rise*0.04} ${bw} ${h-rise} Z`
    ];
    flags.forEach(d=>{
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", d);
      p.setAttribute("fill", "currentColor");
      svg.appendChild(p);
    });
    line.appendChild(svg);
  });
}

function drawSlurs(){
  document.querySelectorAll("svg.slur-layer").forEach(el=>el.remove());
  const NS = "http://www.w3.org/2000/svg";
  const lineEls = Array.prototype.slice.call(document.querySelectorAll(".line"));
  const pairs = [];
  SLURS.forEach(s=>{
    if (s.length === 6) pairs.push([s[0],s[1],s[2],s[3],s[4],s[5]]);
    else pairs.push([s[0],s[1],s[2],s[0],s[1],s[3]]);
  });
  TIES.forEach(t=>{ if (t[2] !== "playonly") pairs.push([t[0][0],t[0][1],t[0][2],t[1][0],t[1][1],t[1][2]]); });
  const items = [];
  pairs.forEach(([b1,v1,i1,b2,v2,i2])=>{
    const l1 = LINE_OF_BAR[b1], l2 = LINE_OF_BAR[b2];
    if (l1===undefined || l2===undefined) return;
    const line1 = lineEls[l1], line2 = lineEls[l2];
    if (!line1 || !line2) return;
    const e1 = line1.querySelector(`.bar[data-bar="${b1}"] .note[data-voice="${v1}"][data-idx="${i1}"]`);
    const e2 = line2.querySelector(`.bar[data-bar="${b2}"] .note[data-voice="${v2}"][data-idx="${i2}"]`);
    if (!e1 || !e2) return;
    const base1 = line1.getBoundingClientRect();
    const r1 = e1.getBoundingClientRect(), r2 = e2.getBoundingClientRect();
    const k1 = `${b1}:${v1}:${i1}`, k2 = `${b2}:${v2}:${i2}`;
    if (l1 === l2){
      items.push({line:line1, x1:r1.left+r1.width/2-base1.left, x2:r2.left+r2.width/2-base1.left,
                  y:Math.min(r1.top,r2.top)-base1.top-3, k1, k2});
    } else {
      const bars1 = line1.querySelectorAll(".bar"), bars2 = line2.querySelectorAll(".bar");
      const xr = Math.max.apply(null, Array.prototype.map.call(bars1,b=>b.getBoundingClientRect().right)) - base1.left - 3;
      const base2 = line2.getBoundingClientRect();
      const xl = Math.min.apply(null, Array.prototype.map.call(bars2,b=>b.getBoundingClientRect().left)) - base2.left + 3;
      items.push({line:line1, x1:r1.left+r1.width/2-base1.left, x2:xr,
                  y:r1.top-base1.top-3, k1, k2:k2+"@s"});
      items.push({line:line2, x1:xl, x2:r2.left+r2.width/2-base2.left,
                  y:r2.top-base2.top-3, k1:k1+"@e", k2});
    }
  });
  const byLine = new Map();
  items.forEach(it=>{ if(!byLine.has(it.line)) byLine.set(it.line, []); byLine.get(it.line).push(it); });
  byLine.forEach(list=>{
    const groups = [], used = new Set();
    const overlap = (a,b)=>Math.min(a.x2,b.x2) > Math.max(a.x1,b.x1) - 1 && Math.abs(a.y-b.y) < 24;
    list.forEach((it,i)=>{
      if (used.has(i)) return;
      const group = [];
      const stack = [i]; used.add(i);
      while (stack.length){
        const k = stack.pop();
        group.push(list[k]);
        list.forEach((o,j)=>{
          if (!used.has(j) && overlap(list[k], o)){ used.add(j); stack.push(j); }
        });
      }
      groups.push(group);
    });
    groups.forEach(group=>{
      group.sort((a,b)=>Math.abs(b.x2-b.x1)-Math.abs(a.x2-a.x1)); /* longest first (highest) */
      const baseY = Math.min.apply(null, group.map(g=>g.y));
      const n = group.length;
      group.forEach((it,rank)=>{ it.baseY = baseY; it.level = rank; it.order = n; });
    });
  });
  byLine.forEach((list,line)=>{
    const base = line.getBoundingClientRect();
    const paths = list.map(it=>{
      const y = (it.baseY !== undefined ? it.baseY : it.y) - ((it.order||1) - 1 - (it.level||0))*5;
      const lift = Math.max(3.5, Math.min(10, Math.abs(it.x2-it.x1)*0.12 + 3.5));
      const mx = (it.x1+it.x2)/2;
      return `M ${it.x1.toFixed(1)} ${y.toFixed(1)} Q ${mx.toFixed(1)} ${(y-lift).toFixed(1)} ${it.x2.toFixed(1)} ${y.toFixed(1)}`;
    });
    if (!paths.length) return;
    const svg = document.createElementNS(NS,"svg");
    svg.setAttribute("class","slur-layer");
    svg.setAttribute("width", base.width);
    svg.setAttribute("height", base.height);
    svg.innerHTML = paths.map(d=>`<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>`).join("");
    line.appendChild(svg);
  });
}

function collectTokens(){
  tokens = [];
  document.querySelectorAll(".note[data-bs], .tail[data-bs], .cell[data-rest]").forEach(el=>{
    const bar = el.closest(".bar"); if (!bar) return;
    const bi = bar.dataset.bar;
    const bs = +el.dataset.bs, bd = el.dataset.rest ? 1 : +el.dataset.bd;
    tokens.push({el, bi, bs, bd});
  });
}

let renderRaf = 0, lastSig = "";
function scheduleRender(){
  cancelAnimationFrame(renderRaf);
  renderRaf = requestAnimationFrame(()=>{
    const sig = layoutRows().map(r=>r.join(",")).join("|");
    if (sig === lastSig) return;
    lastSig = sig;
    render();
  });
}

/* ---------- 选段（可精确到单一音符） ---------- */
function selStartBeat(){ return (sel && typeof sel.start === "number") ? sel.start : BAR_START[sel.a]; }
function selEndBeat(){ return (sel && typeof sel.end === "number") ? sel.end : BAR_END[sel.b]; }
function applySelectionUI(){
  const partial = !!sel;
  barEls.forEach((el,bi)=>{
    if (!el) return;
    const inSel = partial && bi>=sel.a && bi<=sel.b;
    el.classList.toggle("sel", inSel);
    el.classList.toggle("edge-a", inSel && bi===sel.a);
    el.classList.toggle("edge-b", inSel && bi===sel.b);
  });
  const info = $("#selInfo");
  if (partial){
    info.textContent = sel.a===sel.b ? `第 ${sel.a+1} 小节` : `第 ${sel.a+1}–${sel.b+1} 小节`;
    $("#clearSel").style.display = "";
  } else {
    info.textContent = "";
    $("#clearSel").style.display = "none";
  }
  if (partial) engine.setRange(selStartBeat(), selEndBeat(), true);
  else engine.setRange(0, TOTAL_BEATS, false);
  updateSelBands();
  if (lang === "t") convertTree($("#selInfo"));
}
/* 选区以「拍」为边界：跨声部的直向色带 */
function updateSelBands(){
  document.querySelectorAll(".sel-band").forEach(e=>e.remove());
  if (!sel) return;
  const start = selStartBeat(), end = selEndBeat();
  if (end <= start + 1e-6) return;
  const acc = new Map();
  barEls.forEach((barEl,bi)=>{
    if (!barEl) return;
    const bs = BAR_START[bi], be = BAR_END[bi];
    if (end <= bs+1e-6 || start >= be-1e-6) return;
    const line = barEl.closest(".line");
    const row = barEl.querySelector(".vrow");
    if (!line || !row) return;
    const r = row.getBoundingClientRect();
    const beats = SCORE.bars[bi].beats;
    const xa = r.left + r.width * Math.max(0,(start-bs)/beats);
    const xb = r.left + r.width * Math.min(1,(end-bs)/beats);
    const br = barEl.getBoundingClientRect();
    let a = acc.get(line);
    if (!a){ acc.set(line, {x1:xa, x2:xb, top:br.top, bottom:br.bottom}); }
    else { a.x1=Math.min(a.x1,xa); a.x2=Math.max(a.x2,xb); a.top=Math.min(a.top,br.top); a.bottom=Math.max(a.bottom,br.bottom); }
  });
  acc.forEach((a,line)=>{
    const lr = line.getBoundingClientRect();
    const band = document.createElement("div");
    band.className = "sel-band";
    band.style.left = (a.x1-lr.left)+"px";
    band.style.top = (a.top-lr.top)+"px";
    band.style.width = Math.max(3, a.x2-a.x1)+"px";
    band.style.height = (a.bottom-a.top)+"px";
    line.appendChild(band);
  });
}
function clearSelection(stopPlayback=true){
  sel = null;
  applySelectionUI();
  if (stopPlayback){
    engine.stop();
    setPlayUI(false);
    highlight(-1);
  }
}
function previewSelection(a,b,startBeat,endBeat,na,nb){
  sel = {a,b};
  if (typeof startBeat === "number") sel.start = startBeat;
  if (typeof endBeat === "number") sel.end = endBeat;
  sel.na = na || null;
  sel.nb = nb || null;
  applySelectionUI();
}
async function selectAndLoop(a,b){
  if (typeof a === "number") previewSelection(a,b);
  if (!sel) return;
  await playFrom(selStartBeat());
}

function barAtPoint(x,y){
  const el = document.elementFromPoint(x,y);
  const hit = el && el.closest ? el.closest(".bar") : null;
  if (hit) return hit;
  let best=null, bestD=1e9;
  barEls.forEach(b=>{
    if (!b) return;
    const r = b.getBoundingClientRect();
    if (x < r.left-6 || x > r.right+6) return;
    const d = y < r.top ? r.top-y : (y > r.bottom ? y-r.bottom : 0);
    if (d < bestD){ bestD = d; best = b; }
  });
  return bestD < 70 ? best : null;
}
function beatIndexAt(barEl, x){
  const row = barEl.querySelector(".vrow");
  if (!row) return 0;
  const r = row.getBoundingClientRect();
  const beats = SCORE.bars[+barEl.dataset.bar].beats;
  const f = (x - r.left) / Math.max(1, r.width);
  return Math.max(0, Math.min(beats-1, Math.floor(f * beats)));
}
/* 以「拍」为单位：起拍含、迄拍含 */
function previewBeats(b0, i0, b1, i1){
  const swap = (b0 > b1) || (b0 === b1 && i0 > i1);
  const fb = swap ? b1 : b0, fi = swap ? i1 : i0;
  const lb = swap ? b0 : b1, li = swap ? i0 : i1;
  const startBeat = BAR_START[fb] + fi;
  const endBeat = BAR_START[lb] + li + 1;
  previewSelection(Math.min(b0,b1), Math.max(b0,b1), startBeat, endBeat, null, null);
}
/* 选段拖曳到边缘时自动卷页 */
const EDGE = 84;
let autoSelRaf = 0, lastPoint = null;
function selectionAutoScroll(){
  if (!press || !press.armed){ autoSelRaf = 0; return; }
  if (lastPoint){
    const h = window.innerHeight, y = lastPoint.y;
    let dy = 0;
    if (y > h - EDGE) dy = Math.min(16, 2 + (y - (h-EDGE)) * 0.22);
    else if (y < EDGE) dy = -Math.min(16, 2 + (EDGE - y) * 0.22);
    if (dy){
      scrollPageTo(pageScrollY() + dy);
      const cy = Math.max(1, Math.min(h-2, y));
      const barEl = barAtPoint(lastPoint.x, cy);
      if (barEl) previewBeats(press.anchor.bar, press.anchor.idx, +barEl.dataset.bar, beatIndexAt(barEl, lastPoint.x));
    }
  }
  autoSelRaf = requestAnimationFrame(selectionAutoScroll);
}
/* 滑鼠：拖动才选；触控：长按后才进入选段；起迄点可落在任意一拍 */
const DRAG_THRESHOLD = 6;
scoreEl.addEventListener("pointerdown",(e)=>{
  const barEl = e.target.closest(".bar");
  if (!barEl) return;
  const noteEl = e.target.closest(".note[data-id]");
  const bi = +barEl.dataset.bar;
  const idx = beatIndexAt(barEl, e.clientX);
  const insideSel = !!(sel && bi>=sel.a && bi<=sel.b);
  press = {bar:bi, x:e.clientX, y:e.clientY, moved:false, armed:false,
           touch:e.pointerType==="touch", insideSel, noteEl,
           anchor:{bar:bi, idx}};
  if (press.touch){
    clearTimeout(pressTimer);
    pressTimer = setTimeout(()=>{
      if (press && !press.moved){
        press.armed = true;
        previewBeats(bi, idx, bi, idx);
      }
    }, 320);
  }
});
window.addEventListener("pointermove",(e)=>{
  if (!press) return;
  const dx = e.clientX-press.x, dy = e.clientY-press.y;
  if (!press.armed){
    if (Math.hypot(dx,dy) <= DRAG_THRESHOLD) return;
    press.moved = true;
    if (press.touch){                       // 触控滑动＝卷页，不选段
      clearTimeout(pressTimer); press = null; return;
    }
    press.armed = true;                     // 滑鼠拖动：开始选段
    previewBeats(press.anchor.bar, press.anchor.idx, press.anchor.bar, press.anchor.idx);
  }
  press.moved = true;
  lastPoint = {x:e.clientX, y:e.clientY};
  const barEl = barAtPoint(e.clientX, e.clientY);
  if (barEl) previewBeats(press.anchor.bar, press.anchor.idx, +barEl.dataset.bar, beatIndexAt(barEl, e.clientX));
  if (!autoSelRaf) autoSelRaf = requestAnimationFrame(selectionAutoScroll);
  if (press.touch) e.preventDefault();
});
/* 长按成功后阻止页面卷动，让手指可繼续拖曳扩大选段 */
document.addEventListener("touchmove",(e)=>{
  if (press && press.armed && e.cancelable) e.preventDefault();
},{passive:false});
window.addEventListener("pointerup",()=>{
  clearTimeout(pressTimer);
  cancelAnimationFrame(autoSelRaf); autoSelRaf = 0; lastPoint = null;
  if (!press) return;
  const p = press; press = null;
  if (p.armed){ if (sel) selectAndLoop(); return; }
  if (p.moved) return;
  if (p.noteEl){ playNoteEl(p.noteEl); return; }
  if (p.insideSel){ clearSelection(true); return; }
  /* 点任意一拍（含延音 –、空白格、歌词列）都从该拍开始播放 */
  if (p.anchor){
    playFrom(BAR_START[p.anchor.bar] + p.anchor.idx);
  }
});
window.addEventListener("pointercancel",()=>{ clearTimeout(pressTimer); cancelAnimationFrame(autoSelRaf); autoSelRaf=0; lastPoint=null; press = null; });

/* 点空白处取消 */
document.addEventListener("pointerdown",(e)=>{
  if (e.target.closest(".bar")) return;
  if (e.target.closest(".toolbar")) return;
  if (e.target.closest(".tb-more")) return;
  if (e.target.closest("#sheetBackdrop")) return;      /* 点遮罩只是关闭面板 */
  if (document.body.classList.contains("scroll-locked")) return;
  if (!sel) return;
  clearSelection(true);
},{capture:true});

function playNoteEl(el){
  const bi = +el.dataset.bar, v = el.dataset.voice, idx = +el.dataset.idx;
  const beat = BAR_START[bi] + SCORE.bars[bi].V[v][idx][0];
  if (sel && (bi < sel.a || bi > sel.b)){ sel = null; applySelectionUI(); }
  /* 只有「播放中且已进入第二遍」才保留已反覆状态；停止/暂停后再点区间内＝第一遍 */
  const keep = !!(engine.playing && engine.repeatDone && engine.repeat &&
    beat >= engine.repeat.start-1e-6 && beat < engine.repeat.end-1e-6);
  playFrom(beat, keep);
}

/* ---------- 弥撒时段防误触：任何开始播放都先向用户确认 ----------
   使用使用者装置的本地时间：周一至周六 07:30–08:30、主日 09:00–10:30 与 20:00–21:30 */
const MASS_QUIET_WINDOWS = [
  {days:[1,2,3,4,5,6], from:7*60+30, to:8*60+30},
  {days:[0], from:9*60, to:10*60+30},
  {days:[0], from:20*60, to:21*60+30}
];
function isMassQuietHour(d){
  try{
    const now = d || new Date();
    const mins = now.getHours()*60 + now.getMinutes();
    return MASS_QUIET_WINDOWS.some(function(w){
      return w.days.indexOf(now.getDay()) >= 0 && mins >= w.from && mins < w.to;
    });
  }catch(e){ return false; }
}
function confirmPlayInQuietHour(){
  if (!isMassQuietHour()) return true;
  const msg = '目前為彌撒時段（週一至六 07:30–08:30；主日 09:00–10:30、20:00–21:30）。確定要播放嗎？\nPlay now during Mass quiet hours?';
  try{ return window.confirm(msg); }catch(e){ return false; }
}

/* ---------- 播放 ---------- */
function setPlayUI(playing){
  const btn = $("#playBtn");
  btn.innerHTML = playing ? ICONS.pause : ICONS.play;
  btn.setAttribute("aria-label", playing ? "暂停" : "播放");
  const stop = $("#stopBtn");
  if (stop) stop.style.display = playing ? "" : "none";
}
async function playFrom(beat, keepRepeat){
  if (annotMode) return;
  if (!confirmPlayInQuietHour()){ setPlayUI(false); return; }
  await engine.play(beat, keepRepeat);
  setPlayUI(engine.playing);
}
async function togglePlay(){
  if (engine.playing){ engine.pause(); setPlayUI(false); return; }
  if (annotMode) return;
  let from;
  if (sel){
    from = (engine.anchorBeat >= engine.rangeEnd-1e-6 || engine.anchorBeat < engine.rangeStart)
      ? engine.rangeStart : engine.anchorBeat;
  } else {
    from = engine.anchorBeat >= engine.totalBeats-1e-6 ? 0 : engine.anchorBeat;
  }
  await playFrom(from, true);
}
$("#playBtn").addEventListener("click", togglePlay);
$("#stopBtn").addEventListener("click", ()=>{ engine.stop(); setPlayUI(false); highlight(-1); });

window.addEventListener("keydown",(e)=>{
  const t = e.target;
  if (t && (t.tagName==="INPUT" || t.tagName==="TEXTAREA" || t.tagName==="SELECT" || t.isContentEditable)){
    if (t.tagName === "INPUT" && (e.key === "PageUp" || e.key === "PageDown")) e.preventDefault();
    return;
  }
  if ((e.ctrlKey||e.metaKey) && (e.key==="a"||e.key==="A")){
    e.preventDefault();
    selectAndLoop(0, SCORE.bars.length-1);
    return;
  }
  if (e.code==="Space"){ e.preventDefault(); togglePlay(); }
  else if (e.code==="Escape"){ engine.stop(); setPlayUI(false); highlight(-1); }
  else if (e.key==="PageDown" || e.key==="PageUp"){
    e.preventDefault();
    window.vp2Page(e.key==="PageDown" ? 1 : -1);
  }
  else if (e.key==="Home" || e.key==="End"){
    e.preventDefault();
    window.vp2Home(e.key==="End" ? 1 : -1);
  }
});
window.vp2Page = function(dir){
  const step = Math.max(320, window.innerHeight - 60);
  window.scrollBy({top: dir*step, behavior:"auto"});
};
window.vp2Home = function(dir){
  window.scrollTo({top: dir>0 ? document.documentElement.scrollHeight : 0, behavior:"auto"});
};
$("#clearSel").addEventListener("click", ()=>{ clearSelection(true); toast("已取消选择"); });

/* ---------- 速度／音量／节拍器 ---------- */
const tempoEl = $("#tempo"), tempoVal = $("#tempoVal");
tempoEl.value = engine.tempo; tempoVal.textContent = engine.tempo;
tempoEl.addEventListener("input", ()=>{
  const v = +tempoEl.value; tempoVal.textContent = v;
  engine.setTempo(v); saveSettings();
});
const volEl = $("#vol");
volEl.value = Math.round(engine.volume*100);
volEl.addEventListener("input", ()=>{ engine.setVolume(+volEl.value/100); saveSettings(); });
const metroBtn = $("#metroBtn");
function applyMetroUI(){
  metroBtn.classList.toggle("on", engine.metronome);
  metroBtn.setAttribute("aria-pressed", String(engine.metronome));
}
metroBtn.addEventListener("click", ()=>{ engine.metronome = !engine.metronome; applyMetroUI(); saveSettings(); });

/* ---------- 声部 ---------- */
function applyPartUI(){
  VOICES.forEach(v=>{
    const on = !!engine.parts[v];
    const btn = document.querySelector(`.chip[data-part="${v}"]`);
    if (btn){ btn.classList.toggle("off", !on); btn.setAttribute("aria-pressed", String(on)); }
    document.querySelectorAll(`.vrow[data-vrow="${v}"]`).forEach(el=>el.classList.toggle("muted", !on));
    document.querySelectorAll(`.g-cell[data-gv="${v}"]`).forEach(el=>el.classList.toggle("dim", !on));
  });
}
document.querySelectorAll(".chip[data-part]").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    const p = btn.dataset.part;
    engine.parts[p] = !engine.parts[p];
    applyPartUI(); saveSettings();
  });
});
$("#partsAll").addEventListener("click", ()=>{
  VOICES.forEach(v=>engine.parts[v]=true);
  applyPartUI(); saveSettings();
});

/* ---------- 音色 ---------- */

const timbreEl = $("#timbre");
GM_GROUPS.forEach(g=>{
  const og = document.createElement("optgroup");
  og.label = g.name;
  g.items.forEach(([id,label])=>{
    const o = document.createElement("option");
    o.value = id; o.textContent = label;
    og.appendChild(o);
  });
  timbreEl.appendChild(og);
});
timbreEl.value = engine.timbre;
timbreEl.addEventListener("change", ()=>{
  engine.timbre = timbreEl.value;
  saveSettings();
  engine.loadTimbre(engine.timbre).then(inst=>{ if (inst && engine.playing) engine.onReady && engine.onReady(engine.timbre); });
});

const wrapBtn = $("#wrapBtn");
function applyWrapUI(){
  wrapBtn.classList.toggle("on", autowrap);
  wrapBtn.setAttribute("aria-pressed", String(autowrap));
}
wrapBtn.addEventListener("click", ()=>{
  autowrap = !autowrap;
  applyWrapUI(); saveSettings();
  lastSig = ""; render();
});

/* ---------- 歌词字体／字号 ---------- */
$("#lyricFont").value = lyricFont;
$("#lyricFont").addEventListener("change", (e)=>{
  lyricFont = e.target.value;
  document.documentElement.style.setProperty("--lyric-font", LYRIC_FONTS[lyricFont]);
  saveSettings();
});
const boldBtn = $("#boldBtn");
function applyBoldUI(){
  document.documentElement.style.setProperty("--lyric-weight", bold ? 600 : 400);
  boldBtn.classList.toggle("on", bold);
  boldBtn.setAttribute("aria-pressed", String(bold));
}
boldBtn.addEventListener("click", ()=>{ bold = !bold; applyBoldUI(); saveSettings(); });

const scaleEl = $("#scale"), scaleVal = $("#scaleVal");
scaleEl.value = scale; scaleVal.textContent = scale+"%";
scaleEl.addEventListener("input", ()=>{
  scale = +scaleEl.value;
  scaleVal.textContent = scale+"%";
  document.documentElement.style.setProperty("--scale", (scale/100) * 1.2);
  saveSettings();
  lastSig = "";
  scheduleRender();
});

/* ---------- 跟随／主题／语言 ---------- */
const followBtn = $("#followBtn");
function applyFollowUI(){
  followBtn.classList.toggle("on", follow);
  followBtn.setAttribute("aria-pressed", String(follow));
}
followBtn.addEventListener("click", ()=>{ follow=!follow; saveSettings(); applyFollowUI(); });

const themeBtn = $("#themeBtn");
function applyTheme(){
  document.documentElement.dataset.theme = theme;
  themeBtn.innerHTML = theme === "dark" ? ICONS.sun : ICONS.moon;
  themeBtn.title = theme==="dark" ? "切换日间" : "切换夜间";
}
themeBtn.addEventListener("click", ()=>{
  theme = theme==="dark" ? "light" : "dark";
  applyTheme(); saveSettings();
});

/* ---------- 简繁转换（OpenCC） ---------- */
let conv = null, ocLoading = null;
const TEXT_ORIG = new WeakMap(), ATTR_ORIG = new WeakMap();
function loadScript(src){
  return new Promise((res,rej)=>{
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}
async function ensureOpenCC(){
  if (window.OpenCC) return window.OpenCC;
  if (!ocLoading) ocLoading = loadScript("https://cdn.jsdelivr.net/npm/opencc-js@1.4.2/dist/umd/full.js");
  await ocLoading;
  return window.OpenCC;
}
function convertTree(root){
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())){
    const tag = n.parentElement && n.parentElement.tagName;
    if (tag === "SCRIPT" || tag === "STYLE") continue;
    if (!TEXT_ORIG.has(n)) TEXT_ORIG.set(n, n.nodeValue);
    const src = TEXT_ORIG.get(n);
    n.nodeValue = (lang === "t" && conv) ? conv(src) : src;
  }
  if (root.querySelectorAll) root.querySelectorAll("[title]").forEach(el=>{
    if (!ATTR_ORIG.has(el)) ATTR_ORIG.set(el, el.getAttribute("title"));
    const src = ATTR_ORIG.get(el);
    el.setAttribute("title", (lang === "t" && conv) ? conv(src) : src);
  });
}
function vp2LangState(state){
  try{ parent.postMessage({type:'vp2:lang', state:state, lang:lang}, location.origin); }catch(e){}
}
async function applyLang(){
  vp2LangState('loading');
  if (lang === "t"){
    try{
      const OC = await ensureOpenCC();
      if (!conv) conv = OC.Converter({from:"cn", to:"tw"});
    }catch(e){
      lang = "s"; saveSettings(); toast("简繁转换需要连网，已暂停");
      vp2LangState('failed');
      return;
    }
  }
  convertTree(document.body);
  document.title = (lang === "t" && conv) ? conv(SCORE.title) : SCORE.title;
  $("#langBtn").textContent = lang === "s" ? "简" : "繁";
  vp2LangState('ready');
}
const globalLoading = $("#globalLoading");
$("#langBtn").addEventListener("click", async ()=>{
  lang = lang === "s" ? "t" : "s";
  saveSettings();
  globalLoading.classList.add("show");
  $("#langBtn").textContent = lang === "s" ? "简" : "繁";
  try {
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    await applyLang();
    await new Promise(r=>setTimeout(r,120));
  } finally {
    globalLoading.classList.remove("show");
  }
});

/* ---------- 重置 ---------- */
function resetAllSettings(){
  try{ localStorage.removeItem(STORE_KEY); }catch(e){}
  engine.stop(); setPlayUI(false); highlight(-1);
  sel = null;
  theme = DEFAULTS.theme; follow = DEFAULTS.follow;
  lyricFont = DEFAULTS.lyricFont; bold = DEFAULTS.bold; scale = DEFAULTS.scale;
  autowrap = DEFAULTS.autowrap;
  engine.tempo = DEFAULTS.tempo; engine.setTempo(DEFAULTS.tempo);
  engine.setVolume(DEFAULTS.volume/100);
  engine.timbre = DEFAULTS.timbre;
  engine.parts = Object.assign({}, DEFAULTS.parts);
  engine.metronome = DEFAULTS.metronome;
  tempoEl.value = DEFAULTS.tempo; tempoVal.textContent = DEFAULTS.tempo;
  volEl.value = DEFAULTS.volume;
  timbreEl.value = DEFAULTS.timbre;
  $("#lyricFont").value = lyricFont;
  scaleEl.value = scale; scaleVal.textContent = scale+"%";
  document.documentElement.style.setProperty("--lyric-font", LYRIC_FONTS[lyricFont]);
  document.documentElement.style.setProperty("--scale", (scale/100) * 1.2);
  lang = DEFAULTS.lang;
  capo = DEFAULTS.capo;
  applyTheme(); applyFollowUI(); applyMetroUI(); applyPartUI(); applyBoldUI(); applyWrapUI();
  applyLang();
  lastSig = ""; render(); applySelectionUI(); applyCapo();
  toast("已回复预设");
}
$("#resetAll").addEventListener("click", ()=>{
  if (!confirm(tr("确定回复所有预设设定？（版面、音色、速度、显示等）"))) return;
  resetAllSettings();
});

/* ---------- 高亮与跟随 ---------- */
let lastLine = -1, scrollRaf = 0;
let sheetOpen = false, sheetScrollY = 0;
function pageScrollY(){ return sheetOpen ? sheetScrollY : (window.scrollY || 0); }
function scrollPageTo(y){
  if (sheetOpen){
    sheetScrollY = Math.max(0, y);
    document.body.style.top = `-${sheetScrollY}px`;
  } else {
    window.scrollTo(0, y);
  }
}
let lastFollowAt = 0, lastManualX = 0, autoXAt = 0;
function smoothScrollXY(targetY, targetX, duration=380){
  const startY = pageScrollY(), startX = scoreEl.scrollLeft;
  const dY = (targetY === null) ? 0 : targetY - startY;
  const dX = (targetX === null) ? 0 : targetX - startX;
  if (Math.abs(dY) < 2 && Math.abs(dX) < 2) return;
  cancelAnimationFrame(scrollRaf);
  const t0 = performance.now();
  const ease = k => k<0.5 ? 4*k*k*k : 1-Math.pow(-2*k+2,3)/2;
  const step = (t)=>{
    const k = Math.min(1,(t-t0)/duration), e = ease(k);
    if (dY) scrollPageTo(startY + dY*e);
    if (dX){ autoXAt = performance.now(); scoreEl.scrollLeft = startX + dX*e; }
    if (k<1) scrollRaf = requestAnimationFrame(step);
    else scrollRaf = 0;
  };
  scrollRaf = requestAnimationFrame(step);
}
function followTo(bi){
  if (!follow || bi<0) return;
  const li = LINE_OF_BAR[bi];
  if (li === undefined) return;
  const line = document.querySelector(`.line[data-line="${li}"]`);
  if (!line) return;

  /* ---- 垂直目标 ---- */
  const tb = document.querySelector(".toolbar");
  const tbH = tb ? tb.getBoundingClientRect().height : 0;
  const visibleTop = tbH + 10;
  const visibleBottom = window.innerHeight - 10;
  const visibleH = Math.max(80, visibleBottom - visibleTop);
  const rect = line.getBoundingClientRect();
  const changed = li !== lastLine;
  const outTop = rect.top < visibleTop - 2;
  const outBottom = rect.bottom > visibleBottom + 2;
  let targetY = null;
  if (changed || outTop || outBottom){
    if (rect.height <= visibleH){
      /* 整行放得进视窗：垂直置中 */
      targetY = pageScrollY() + rect.top - visibleTop - (visibleH - rect.height)/2;
    } else {
      /* 行太高：至少让 S–B 声部区块可见（对齐顶部） */
      targetY = pageScrollY() + rect.top - visibleTop - 2;
    }
  }

  /* ---- 水平目标（关闭自动换行时） ---- */
  let targetX = null;
  if (scoreEl.classList.contains("nowrap") && scoreEl.scrollWidth > scoreEl.clientWidth + 2
      && performance.now() - lastManualX >= 1000){
    const bar = barEls[bi];
    if (bar){
      const sr = scoreEl.getBoundingClientRect(), br = bar.getBoundingClientRect();
      const margin = Math.min(90, sr.width * 0.2);
      if (!(br.left >= sr.left + margin && br.right <= sr.right - margin)){
        targetX = Math.max(0, scoreEl.scrollLeft + (br.left - sr.left) - (sr.width - br.width)/2);
      }
    }
  }

  if (targetY === null && targetX === null) return;
  const now = performance.now();
  if (!changed && now - lastFollowAt < 650) return;   /* 非跨行：节流，避免互抢 */
  lastFollowAt = now;
  lastLine = li;
  /* 垂直、水平同一條时间轴：一步斜直线到位 */
  smoothScrollXY(targetY, targetX, changed ? 400 : 300);
}
scoreEl.addEventListener("scroll", ()=>{
  if (performance.now() - autoXAt > 180) lastManualX = performance.now();
}, {passive:true});
function highlight(pos){
  const active = new Set();
  if (pos >= 0 && engine.playing){
    for (const t of tokens){
      const abs = BAR_START[+t.bi] + t.bs;
      if (abs <= pos+1e-6 && pos < abs + t.bd - 1e-6) active.add(t.el);
    }
  }
  document.querySelectorAll(".note.on, .tail.on, .cell.on").forEach(el=>{
    if (!active.has(el)) el.classList.remove("on");
  });
  active.forEach(el=>el.classList.add("on"));
  barEls.forEach((el,bi)=>{
    if (!el) return;
    el.classList.toggle("playing", engine.playing && pos>=BAR_START[bi]-1e-6 && pos<BAR_END[bi]-1e-6);
  });
}
function frame(){
  const pos = engine.playing ? engine.position : engine.anchorBeat;
  highlight(pos);
  if (engine.playing){
    const bi = barIndexAt(pos);
    followTo(bi);
  }
  requestAnimationFrame(frame);
}
function barIndexAt(pos){
  for (let i=0;i<SCORE.bars.length;i++){
    if (pos < BAR_END[i]-1e-6 || i===SCORE.bars.length-1) return i;
  }
  return SCORE.bars.length-1;
}

/* ---------- toast ---------- */
let toastTimer = 0;
function tr(text){ return (lang === "t" && conv) ? conv(text) : text; }
function toast(msg){
  const el = $("#toast");
  el.textContent = msg; el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>el.classList.remove("show"),1900);
  if (lang === "t" && conv) el.textContent = conv(msg);
}

/* ---------- 音源狀態 ---------- */
function setLoadInfo(text, warn){
  const info = $("#loadInfo");
  info.textContent = text;
  info.classList.toggle("err", !!warn);
  if (text && lang === "t" && conv) info.textContent = conv(text);
}
engine.onSynthWhileLoading = ()=>{
  setLoadInfo("合成音源 · 取样载入中…", false);
};
engine.onProgress = (p)=>{
  if (!p){ setLoadInfo("合成音源 · 取样不可用", false); return; }
  const label = TIMBRES[p.id] ? TIMBRES[p.id].label : "";
  if (p.loaded >= p.total) setLoadInfo("", false);
  else setLoadInfo(`合成音源 · ${label}${p.tag||""} ${Math.round(p.loaded/p.total*100)}%`, false);
};
engine.onReady = (id)=>{
  const label = TIMBRES[id] ? TIMBRES[id].label : "";
  toast(`${label} 音源已就緒`);
  setLoadInfo("", false);
};
engine.onAudioBlocked = (b)=>{ if (b && engine.audioSupported) toast("音讯未启动，乐谱仍可行进"); };
engine.onUnavailable = ()=>{
  setLoadInfo("此瀏览器不支援音讯 · 仅供阅谱", true);
  toast("此瀏览器不支援音讯或合成器，请改用 Chrome／Edge／Safari／Firefox");
};
engine.onEnd = ()=>{ setPlayUI(false); };

/* ---------- 按键回馈（触控瀏览器 :active 不可靠，补 .pressed） ---------- */
document.addEventListener("pointerdown", (e)=>{
  const btn = e.target.closest && e.target.closest("button");
  if (!btn) return;
  btn.classList.add("pressed");
  const clear = ()=>btn.classList.remove("pressed");
  btn.addEventListener("pointerup", clear, {once:true});
  btn.addEventListener("pointerleave", clear, {once:true});
  btn.addEventListener("pointercancel", clear, {once:true});
}, {passive:true});

/* ---------- 顶栏收納 ---------- */
const tbEl = $("#toolbar");
const tbToggle = $("#tbToggle");
let tbOpen = true, tbAuto = false;
function setToolbarOpen(v, auto){
  tbOpen = v; tbAuto = !!auto;
  tbEl.classList.toggle("collapsed", !v);
  tbToggle.textContent = v ? "▴" : "▾";
  tbToggle.setAttribute("aria-expanded", String(v));
  tbToggle.title = v ? "收合设定" : "展开设定";
}
let manualHold = false, lastScrollY = window.scrollY;
tbToggle.addEventListener("click", ()=>{
  const willOpen = !tbOpen;
  /* 在页面中段手动展开时，保持展开直到回到顶部；在顶部展开则照常可自动收起 */
  manualHold = willOpen && window.scrollY > 12;
  setToolbarOpen(willOpen, false);
});
window.addEventListener("scroll", ()=>{
  if (window.matchMedia("(max-width:860px)").matches) return;
  const y = window.scrollY;
  const dy = y - lastScrollY;
  if (y < 12) manualHold = false;
  if (!manualHold && tbOpen && dy > 6 && y > 120){
    setToolbarOpen(false, true);
  } else if (y < 10 && !tbOpen && tbAuto && dy < -10){
    setToolbarOpen(true, false);
  }
  lastScrollY = y;
}, {passive:true});

/* ---------- 手机：设定面板 ---------- */
const menuBtn = $("#menuBtn"), tbMore = $("#tbMore"), backdrop = $("#sheetBackdrop");
let sheetLockY = 0;
function lockPageScroll(lock){
  if (lock){
    cancelAnimationFrame(scrollRaf);          /* 停掉正在进行的平滑卷动 */
    sheetLockY = window.scrollY || 0;
    sheetScrollY = sheetLockY;
    sheetOpen = true;
    document.body.style.top = `-${sheetLockY}px`;
    document.body.classList.add("scroll-locked");
  } else {
    const y = sheetScrollY;                   /* 面板开著时的自动卷动位置 */
    sheetOpen = false;
    document.body.classList.remove("scroll-locked");
    document.body.style.top = "";
    window.scrollTo(0, y);
    sheetLockY = y;
  }
}
let lastSheetToggle = 0;
menuBtn.addEventListener("click", ()=>{
  const now = performance.now();
  if (now - lastSheetToggle < 260) return;
  lastSheetToggle = now;
  const open = tbMore.classList.toggle("open");
  backdrop.classList.toggle("open", open);
  document.body.classList.toggle("sheet-open", open);
  lockPageScroll(open);
});
function closeSheetAll(){
  tbMore.classList.remove("open");
  backdrop.classList.remove("open");
  document.body.classList.remove("sheet-open");
  lockPageScroll(false);
}
backdrop.addEventListener("click", closeSheetAll);

/* ---------- 尺寸变化自动换行 ---------- */
let resizeTimer = 0;
function reflowSoon(){
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(()=>{ lastSig=""; scheduleRender(); }, 80);
}
window.addEventListener("resize", reflowSoon);
window.addEventListener("orientationchange", reflowSoon);
if (window.ResizeObserver){
  try { new ResizeObserver(()=>scheduleRender()).observe(scoreEl); } catch(e){}
}
if (document.fonts && document.fonts.ready){
  document.fonts.ready.then(()=>{ lastSig=""; scheduleRender(); });
}
/* 使用者调整系统／瀏览器字号或缩放：无需刷新，定期比对字号与宽度 */
let lastFsSeen = 0, lastWSeen = 0;
setInterval(()=>{
  const fs = parseFloat(getComputedStyle(scoreEl).fontSize) || 16;
  const w = scoreEl.clientWidth;
  if (fs !== lastFsSeen || w !== lastWSeen){
    lastFsSeen = fs; lastWSeen = w;
    lastSig = "";
    scheduleRender();
  }
}, 400);

/* ---------- 设定持久化 ---------- */
function saveSettings(){
  try{
    localStorage.setItem(STORE_KEY, JSON.stringify({
      theme, follow, tempo:engine.tempo, volume:Math.round(engine.volume*100),
      timbre:engine.timbre, parts:engine.parts, lyricFont, bold, autowrap, scale,
      metronome:engine.metronome, lang, capo
    }));
  }catch(e){}
}

/* ---------- 启动 ---------- */
render();
applyCapo();
applyFollowUI(); applyTheme(); applyMetroUI(); applyPartUI(); applyBoldUI(); applyWrapUI();
setPlayUI(false); applySelectionUI();
requestAnimationFrame(()=>requestAnimationFrame(()=>document.body.classList.add("ready")));
if (!engine.audioSupported) setLoadInfo("此瀏览器不支援音讯 · 仅供阅谱", true);
if (lang === "t") applyLang();
requestAnimationFrame(frame);

let preloaded = false;
function preload(){
  if (preloaded) return; preloaded = true;
  if (!engine.audioSupported) return;
  engine.ensureCtx();
    engine.loadTimbre(engine.timbre).then(inst=>{ if (inst) engine.onReady && engine.onReady(engine.timbre); });
}
window.addEventListener("pointerdown", preload, {once:true});
window.addEventListener("keydown", preload, {once:true});

/* 测试 API */
window.__hymn = {
  SCORE, PHRASES, BAR_START, BAR_END, TOTAL_BEATS, TIMBRES, GM_GROUPS, SCORE_PITCHES, LYRIC_FONTS,
  engine, render, layoutVoice, layoutRows, midiToJianpu, barIndexAt,
  get sel(){ return sel; }, get follow(){ return follow; },
  get theme(){ return theme; }, get lyricFont(){ return lyricFont; }, get scale(){ return scale; },
  get lang(){ return lang; }, get bold(){ return bold; }, get autowrap(){ return autowrap; }, get lineOfBar(){ return LINE_OF_BAR; },
  selectAndLoop, clearSelection, playFrom, togglePlay, saveSettings, isMassQuietHour,
  version:"4.0.0"
};
