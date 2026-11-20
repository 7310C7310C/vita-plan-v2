/* Extracted from player-frame.html; edit here, not in the HTML. */
/* Guitar chord fingering popup (data: @tombatossals/chords-db, MIT) */
const CHORD_ROOT_KEY = {"C":"C","C#":"Csharp","Db":"Csharp","D":"D","D#":"Eb","Eb":"Eb","E":"E","F":"F","F#":"Fsharp","Gb":"Fsharp","G":"G","G#":"Ab","Ab":"Ab","A":"A","A#":"Bb","Bb":"Bb","B":"B"};
let chordDB = null, chordDBPromise = null;
function getChordDB(){
  if (chordDB) return Promise.resolve(chordDB);
  if (!chordDBPromise){
    chordDBPromise = fetch('data/chords-guitar.json', {cache:'no-cache'})
      .then(r=>{ if (!r.ok) throw new Error('http '+r.status); return r.json(); })
      .then(j=>{ chordDB = j; return j; })
      .catch(e=>{ chordDBPromise = null; throw e; });
  }
  return chordDBPromise;
}
function chordLookup(db, name){
  const m = String(name).match(/^([A-G][#b]?)(.*)$/);
  if (!m) return null;
  const rootKey = CHORD_ROOT_KEY[m[1]];
  if (!rootKey) return null;
  let rest = m[2] || '';
  let slash = null;
  if (rest.indexOf('/') >= 0){
    const p = rest.split('/');
    rest = p[0]; slash = p[1];
  }
  let base = rest === '' ? 'major' : (rest === 'm' ? 'minor' : (rest === '4' ? 'sus4' : rest));
  const entries = db.chords[rootKey] || [];
  let suffix = base;
  if (slash) suffix = (base === 'major' ? '' : base) + '/' + slash;
  let entry = entries.find(e=>e.suffix === suffix);
  let fallback = false;
  if (!entry && slash){
    entry = entries.find(e=>e.suffix === base);
    fallback = true;
  }
  if (!entry && base === 'major') entry = entries.find(e=>e.suffix === 'minor');
  if (!entry) return null;
  return {entry:entry, slash:slash, fallback:fallback};
}
function chordDiagramSVG(pos){
  const NS='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(NS,'svg');
  svg.setAttribute('viewBox','0 0 112 148'); svg.setAttribute('width','112'); svg.setAttribute('height','148');
  const base = +pos.baseFret || 1;
  const abs = (pos.frets||[]).map(f=> f>0 ? base+f-1 : f);
  const played = abs.filter(f=>f>0);
  const start = played.length ? Math.max(1, Math.min.apply(null, played)) : 1;
  const x0=18, dx=15, y0=30, dy=19, strings=6;
  function el(tag, attrs){ const e=document.createElementNS(NS,tag); Object.keys(attrs||{}).forEach(k=>e.setAttribute(k,attrs[k])); return e; }
  for (let i=0;i<strings;i++) svg.appendChild(el('line',{x1:x0+i*dx,y1:y0,x2:x0+i*dx,y2:y0+dy*4,stroke:'#f4eee2','stroke-width':1,opacity:.65}));
  for (let f=0;f<=4;f++) svg.appendChild(el('line',{x1:x0,y1:y0+f*dy,x2:x0+dx*(strings-1),y2:y0+f*dy,stroke:'#f4eee2','stroke-width':(f===0&&start===1)?3:1,opacity:.65}));
  if (start>1){
    const t=el('text',{x:2,y:y0+13,fill:'#cfc3b2','font-size':10}); t.textContent=String(start); svg.appendChild(t);
  }
  (pos.barres||[]).forEach(b=>{
    const fret = base + b - 1;
    const idx = fret - start;
    if (idx < 0 || idx > 3) return;
    svg.appendChild(el('rect',{x:x0-3,y:y0+idx*dy+dy/2-4,width:dx*(strings-1)+6,height:8,rx:4,fill:'#f4eee2',opacity:.9}));
  });
  abs.forEach((f,i)=>{
    const x=x0+i*dx;
    if (f === -1){
      const t=el('text',{x:x,y:y0-8,fill:'#cfc3b2','font-size':11,'text-anchor':'middle'}); t.textContent='×'; svg.appendChild(t);
    } else if (f === 0){
      svg.appendChild(el('circle',{cx:x,cy:y0-8,r:3.2,fill:'none',stroke:'#f4eee2','stroke-width':1.2}));
    } else {
      const idx=f-start;
      if (idx<0 || idx>3) return;
      svg.appendChild(el('circle',{cx:x,cy:y0+idx*dy+dy/2,r:5.4,fill:'#f4eee2'}));
      const fing = pos.fingers && pos.fingers[i];
      if (fing){
        const t=el('text',{x:x,y:y0+idx*dy+dy/2+3.4,fill:'#241f19','font-size':8,'text-anchor':'middle','font-weight':700}); t.textContent=String(fing); svg.appendChild(t);
      }
    }
  });
  return svg;
}
function closeChordPop(){
  const p=document.getElementById('chordPop');
  if (p){ p.classList.remove('open'); p.setAttribute('aria-hidden','true'); }
}
async function openChordPop(text){
  const pop=document.getElementById('chordPop'), title=document.getElementById('chordPopTitle'), body=document.getElementById('chordPopBody');
  if (!pop || !body) return;
  pop.classList.add('open'); pop.setAttribute('aria-hidden','false');
  title.textContent = text;
  body.textContent = '';
  const loading=document.createElement('div'); loading.className='chord-loading'; loading.textContent='指法加载中…'; body.appendChild(loading);
  try{
    const db=await getChordDB();
    body.textContent='';
    const names=String(text).split(' · ').filter(Boolean).slice(0,4);
    names.forEach(name=>{
      const found=chordLookup(db,name);
      const block=document.createElement('div'); block.className='chord-block';
      const n=document.createElement('div'); n.className='cd-name'; n.textContent=name; block.appendChild(n);
      if (!found){
        const e=document.createElement('div'); e.className='chord-empty'; e.textContent='暂无现成指法'; block.appendChild(e);
      } else {
        (found.entry.positions||[]).slice(0,3).forEach(pos=>{ block.appendChild(chordDiagramSVG(pos)); });
        if (found.fallback && found.slash){
          const note=document.createElement('div'); note.className='cd-note'; note.textContent='主和弦指法 · 低音 ' + found.slash; block.appendChild(note);
        }
      }
      body.appendChild(block);
    });
    if (!names.length){ const e=document.createElement('div'); e.className='chord-empty'; e.textContent='没有可显示的和弦'; body.appendChild(e); }
  }catch(e){
    body.textContent=''; const err=document.createElement('div'); err.className='chord-empty'; err.textContent='指法数据加载失败，请联网后重试'; body.appendChild(err);
  }
}
document.addEventListener('pointerdown', function(e){
  if (annotMode) return;
  if (e.target.closest && e.target.closest('.chordrow span[data-chord]')){ e.preventDefault(); e.stopPropagation(); }
}, true);
document.addEventListener('click', function(e){
  if (annotMode) return;
  const el=e.target.closest && e.target.closest('.chordrow span[data-chord]');
  if (!el) return;
  e.preventDefault(); e.stopPropagation();
  openChordPop(el.textContent);
}, true);
document.addEventListener('click', function(e){
  const p=document.getElementById('chordPop');
  if (!p || !p.classList.contains('open')) return;
  if (e.target.closest && (e.target.closest('#chordPop') || e.target.closest('.chordrow span[data-chord]'))) return;
  closeChordPop();
});
document.addEventListener('keydown', function(e){ if (e.key==='Escape') closeChordPop(); });
(function(){
  const close=document.getElementById('chordPopClose');
  if (close) close.addEventListener('click', function(e){ e.stopPropagation(); closeChordPop(); });
})();

/* v2 parent <-> frame API */
(function(){
  let playSeq = 0;
  window.vp2CancelPlay = function(){ playSeq++; };
  function vp2State(){
    return {type:'vp2:state', playing: !!(engine.playing || engine.playPending), tempo:engine.tempo, parts:engine.parts,
      lang:lang, metronome:engine.metronome, volume:Math.round(engine.volume*100),
      timbre:engine.timbre, lyricFont:lyricFont, bold:bold, scale:scale,
      autowrap:autowrap, follow:follow, theme:theme, capo:capo, voices:SHOW_VOICES};
  }
  function vp2Send(){ try{ parent.postMessage(vp2State(), location.origin); }catch(e){} }
  /* 任何来源（含点谱上音符 playFrom、隐藏播放键、可见性）改了播放 UI 都同步父页 */
  try{
    const prevSetPlayUI = window.setPlayUI;
    window.setPlayUI = function(playing){
      try{ prevSetPlayUI(playing); }catch(e){}
      vp2Send();
    };
  }catch(e){}
  try{
    const prevEnd = engine.onEnd;
    engine.onEnd = function(){ try{ if (prevEnd) prevEnd(); }catch(e){} vp2Send(); };
  }catch(e){}
  document.addEventListener('visibilitychange', function(){
    if (document.visibilityState === 'hidden') playSeq++;
    setTimeout(vp2Send, 120);
  });
  document.addEventListener('pointerdown', function(){
    try{ parent.postMessage({type:'vp2:menu-close'}, location.origin); }catch(e){}
  }, true);
  window.addEventListener('message', function(e){
    if (e.origin !== location.origin) return;
    const m = e.data || {};
    if (m.type !== 'vp2:cmd') return;
    try{
      switch(m.cmd){
        case 'warmup': preload(); break;
        case 'play':
          if (annotMode) break;
          if (!confirmPlayInQuietHour()){ vp2Send(); break; }
          preload();
          if (!engine.playing){
            const seq = ++playSeq;
            const startBeat = engine.anchorBeat >= engine.totalBeats-1e-6 ? 0 : engine.anchorBeat;
            const p = engine.play(startBeat, startBeat > 0);
            const done = function(){
              /* 已被 pause/stop 或更晚的 play 取代时，对应命令已处理引擎状态；
                 这里只补 UI，不能 stop，否则会误杀之后的新播放。 */
              if (seq !== playSeq && !engine.playing && !engine.playPending) setPlayUI(false);
              vp2Send();
            };
            if (p && p.then) p.then(done).catch(done);
            return;
          }
          break;
        case 'pause': playSeq++; engine.pause(); setPlayUI(false); break;
        case 'stop': playSeq++; engine.stop(); setPlayUI(false); break;
        case 'tempo': engine.setTempo(+m.value); saveSettings(); break;
        case 'metronome': engine.metronome = !!m.value; saveSettings(); break;
        case 'volume': engine.setVolume((+m.value)/100); saveSettings(); break;
        case 'parts': if (m.parts) Object.assign(engine.parts, m.parts); applyPartUI(); saveSettings(); break;
        case 'lang': {
          const v = m.value === 't' ? 't' : 's';
          if (v !== lang){ lang = v; applyLang(); saveSettings(); }
          break;
        }
        case 'annot': annotSetMode(!!m.value); break;
        case 'annotSave': annotSaveNow(); break;
        case 'annotClear': annotClearAll(); break;
        case 'annotEraser': annotSetEraser(!!m.value); break;
        case 'annotUndo': annotUndo(); break;
        case 'annotRedo': annotRedo(); break;
        case 'timbre': {
          const id = String(m.value || '');
          if (TIMBRES[id]){
            const label = TIMBRES[id].label || id;
            const already = engine.instName === id && !!engine.inst;
            engine.timbre = id;
            if (timbreEl) timbreEl.value = id;
            saveSettings();
            if (already){
              if (engine.playing) engine.playUsesSample = true;
              try{ parent.postMessage({type:'vp2:timbre', state:'ready', label:label}, location.origin); }catch(e){}
            } else {
              try{ parent.postMessage({type:'vp2:timbre', state:'loading', label:label}, location.origin); }catch(e){}
              engine.loadTimbre(id).then(function(inst){
                try{ parent.postMessage({type:'vp2:timbre', state: inst ? 'ready' : 'failed', label:label}, location.origin); }catch(e){}
                if (inst && engine.playing){
                  engine.playUsesSample = true;   /* 用户主动换音色：允许立即改用取样音 */
                  if (engine.onReady) engine.onReady(id);
                }
              });
            }
          }
          break;
        }
        case 'lyricFont': {
          const v = String(m.value || '');
          if (LYRIC_FONTS[v]){
            lyricFont = v;
            document.documentElement.style.setProperty('--lyric-font', LYRIC_FONTS[lyricFont]);
            const el = $('#lyricFont'); if (el) el.value = v;
            saveSettings();
          }
          break;
        }
        case 'bold': bold = !!m.value; applyBoldUI(); saveSettings(); break;
        case 'scale': {
          const v = Math.max(80, Math.min(150, +m.value || 100));
          scale = v;
          if (scaleEl){ scaleEl.value = v; scaleVal.textContent = v + '%'; }
          applyDisplayScale();
          saveSettings(); lastSig = ''; scheduleRender();
          break;
        }
        case 'autowrap': autowrap = !!m.value; applyWrapUI(); saveSettings(); lastSig = ''; render(); break;
        case 'follow': follow = !!m.value; applyFollowUI(); saveSettings(); break;
        case 'theme': theme = m.value === 'dark' ? 'dark' : 'light'; applyTheme(); saveSettings(); break;
        case 'capo': capo = Math.max(0, Math.min(12, +m.value || 0)); applyCapo(); saveSettings(); break;
        case 'reset': resetAllSettings(); break;
      }
      vp2Send();
    }catch(err){}
  });
  window.addEventListener('load', function(){
    try{ parent.postMessage({type:'vp2:ready', title:SCORE.title, id:SONG_ID,
      tempo:engine.tempo, parts:engine.parts, lang:lang,
      metronome:engine.metronome, volume:Math.round(engine.volume*100),
      timbre:engine.timbre, lyricFont:lyricFont, bold:bold, scale:scale,
      autowrap:autowrap, follow:follow, theme:theme, capo:capo, voices:SHOW_VOICES,
      timbres:GM_GROUPS.map(function(g){ return {name:g.name, items:g.items}; })}, location.origin); }catch(e){}
  });
})();

/* ============================================================
   v2 annotations v2: click a note or drag a marquee; the selected
   notes are enclosed by one red ring; optional text chip with a
   translucent background; clear/eraser/undo/redo; saved locally.
   ============================================================ */
const ANNOT_KEY = 'v2.annot.' + SONG_ID;
let annotMode = false, annotEraser = false;
let annotGroups = loadAnnots();
let annotHistory = [], annotHistIndex = -1;
let annotStart = null, annotMoved = false, annotErasing = false, annotActive = null;
let annotMarquee = null, annotPop = null;
const SVG_NS = 'http://www.w3.org/2000/svg';

function loadAnnots(){
  try{
    const raw = JSON.parse(localStorage.getItem(ANNOT_KEY) || '[]');
    if (Array.isArray(raw)){
      return raw.filter(function(g){ return g && Array.isArray(g.ids) && g.ids.length; })
        .map(function(g){
          const ids = g.ids.map(String);
          const shape = g.shape === 'rect' ? 'rect' : (ids.length > 1 ? 'rect' : 'circle');
          return {ids: ids, text: String(g.text || ''), shape: shape};
        });
    }
    if (raw && typeof raw === 'object'){
      /* migrate old per-note {id:{text}} format into one group per note */
      return Object.keys(raw).map(function(id){ return {ids:[String(id)], text: String((raw[id] && raw[id].text) || ''), shape:'circle'}; });
    }
  }catch(e){}
  return [];
}
function annotPersist(){ try{ localStorage.setItem(ANNOT_KEY, JSON.stringify(annotGroups)); }catch(e){} }
function annotSend(){
  try{
    parent.postMessage({type:'vp2:annot', count: annotGroups.length, eraser: annotEraser,
      undo: annotHistIndex > 0, redo: annotHistIndex >= 0 && annotHistIndex < annotHistory.length - 1}, location.origin);
  }catch(e){}
}
function annotHistoryReset(){
  annotHistory = [JSON.stringify(annotGroups)];
  annotHistIndex = 0;
}
function annotCommit(){
  annotPersist();
  const snap = JSON.stringify(annotGroups);
  if (annotHistIndex < 0 || annotHistory[annotHistIndex] !== snap){
    annotHistory = annotHistory.slice(0, annotHistIndex + 1);
    annotHistory.push(snap);
    annotHistIndex = annotHistory.length - 1;
  }
  annotRender();
  annotSend();
}
function annotHistoryGo(i){
  if (i < 0 || i >= annotHistory.length) return;
  annotHistIndex = i;
  annotGroups = JSON.parse(annotHistory[i]);
  annotPersist(); annotRender(); annotSend();
}
function annotUndo(){ annotHistoryGo(annotHistIndex - 1); }
function annotRedo(){ annotHistoryGo(annotHistIndex + 1); }
function annotSaveNow(){ annotPersist(); annotSend(); }
function annotClearAll(){ annotGroups = []; annotCommit(); }
function annotSetEraser(on){
  annotEraser = !!on;
  document.body.classList.toggle('annot-erase', annotEraser);
  annotSend();
}

function annotNoteMap(){
  const map = new Map();
  document.querySelectorAll('#score .note[data-id]').forEach(function(el){
    const id = el.getAttribute('data-id');
    if (!map.has(id)) map.set(id, el);
  });
  return map;
}
function annotEls(ids){
  const map = annotNoteMap();
  return ids.map(function(id){ return map.get(String(id)); }).filter(Boolean);
}
function annotRender(){
  const layer = document.getElementById('annotLayer');
  if (!layer) return;
  const lr = layer.getBoundingClientRect();
  Array.prototype.slice.call(layer.querySelectorAll('.annot-ring,.annot-chip,.annot-del,.annot-marquee')).forEach(function(el){ el.remove(); });
  annotGroups.forEach(function(g, gi){
    const els = annotEls(g.ids);
    if (!els.length) return;
    let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
    els.forEach(function(el){
      const r = el.getBoundingClientRect();
      x1 = Math.min(x1, r.left); y1 = Math.min(y1, r.top);
      x2 = Math.max(x2, r.right); y2 = Math.max(y2, r.bottom);
    });
    const pad = 7;
    const w = x2 - x1 + pad * 2, h = y2 - y1 + pad * 2;
    const left = x1 - lr.left - pad, top = y1 - lr.top - pad;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'annot-ring' + (annotActive === gi ? ' active' : ''));
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.style.left = left + 'px';
    svg.style.top = top + 'px';
    svg.style.width = w + 'px';
    svg.style.height = h + 'px';
    const isRect = g.shape === 'rect' || (g.shape === undefined && g.ids.length > 1);
    const mkShape = function(cls, sw){
      let el;
      if (isRect){
        el = document.createElementNS(SVG_NS, 'rect');
        el.setAttribute('x', 1.5); el.setAttribute('y', 1.5);
        el.setAttribute('width', Math.max(1, w - 3)); el.setAttribute('height', Math.max(1, h - 3));
        const r = Math.min(6, Math.max(1, (h - 3) / 2));
        el.setAttribute('rx', r); el.setAttribute('ry', r);
      } else {
        el = document.createElementNS(SVG_NS, 'ellipse');
        el.setAttribute('cx', w / 2); el.setAttribute('cy', h / 2);
        el.setAttribute('rx', Math.max(1, w / 2 - 1.5)); el.setAttribute('ry', Math.max(1, h / 2 - 1.5));
      }
      el.setAttribute('class', cls); el.setAttribute('stroke-width', sw);
      return el;
    };
    if (annotMode && !annotEraser){
      const hit = mkShape('annot-hit', 16);
      hit.addEventListener('click', function(e){
        e.stopPropagation(); e.preventDefault();
        annotActive = gi; annotRender();
        if (!g.text) annotShowPop(g);
      });
      svg.appendChild(hit);
    }
    svg.appendChild(mkShape('annot-vis', 2));
    layer.appendChild(svg);

    if (g.text){
      const chip = document.createElement('span');
      chip.className = 'annot-chip';
      chip.textContent = g.text;
      chip.style.left = ((x1 + x2) / 2 - lr.left) + 'px';
      chip.style.top = (y1 - lr.top - pad - 17) + 'px';
      chip.style.pointerEvents = (annotMode && !annotEraser) ? 'auto' : 'none';
      if (annotMode && !annotEraser){
        chip.addEventListener('click', function(e){
          e.stopPropagation(); e.preventDefault();
          annotActive = gi; annotShowPop(g);
        });
      }
      layer.appendChild(chip);
    }
    if (annotActive === gi && annotMode && !annotEraser){
      const del = document.createElement('button');
      del.type = 'button'; del.className = 'annot-del'; del.textContent = '×'; del.title = '删除标记';
      del.setAttribute('aria-label', '删除标记');
      del.style.left = (x2 - lr.left + pad) + 'px';
      del.style.top = (y1 - lr.top - pad) + 'px';
      del.addEventListener('click', function(e){
        e.stopPropagation(); e.preventDefault();
        annotGroups.splice(gi, 1); annotActive = null; annotHidePop(); annotCommit();
      });
      layer.appendChild(del);
    }
  });
}

function annotHidePop(){ if (annotPop){ annotPop.remove(); annotPop = null; } }
function annotShowPop(group){
  annotHidePop();
  const els = annotEls(group.ids);
  const r = els.length ? els[els.length - 1].getBoundingClientRect()
                       : {left: 20, bottom: 120, right: 20};
  const d = document.createElement('div');
  d.className = 'annot-pop';
  d.innerHTML = '<div class="annot-pop-in"><input type="text" placeholder="标注文字（可留空）"><button data-act="save">确定</button><button data-act="clear">清空</button></div>';
  d.style.left = Math.max(8, Math.min(window.innerWidth - 330, r.left)) + 'px';
  d.style.top = Math.max(8, Math.min(window.innerHeight - 70, r.bottom + 8)) + 'px';
  document.body.appendChild(d); annotPop = d;
  const inp = d.querySelector('input'); inp.value = group.text || ''; inp.focus();
  const save = function(){
    group.text = inp.value.trim();
    annotCommit(); annotHidePop();
  };
  d.querySelector('[data-act=save]').onclick = save;
  d.querySelector('[data-act=clear]').onclick = function(){
    group.text = '';
    annotCommit(); annotHidePop();
  };
  inp.addEventListener('keydown', function(e){ if (e.key === 'Enter') save(); else if (e.key === 'Escape') annotHidePop(); });
}
function annotMarqueeShow(x1, y1, x2, y2){
  const layer = document.getElementById('annotLayer'); if (!layer) return;
  if (!annotMarquee){ annotMarquee = document.createElement('div'); annotMarquee.className = 'annot-marquee'; layer.appendChild(annotMarquee); }
  const lr = layer.getBoundingClientRect();
  annotMarquee.style.left = (Math.min(x1, x2) - lr.left) + 'px';
  annotMarquee.style.top = (Math.min(y1, y2) - lr.top) + 'px';
  annotMarquee.style.width = Math.abs(x2 - x1) + 'px';
  annotMarquee.style.height = Math.abs(y2 - y1) + 'px';
}
function annotMarqueeHide(){ if (annotMarquee){ annotMarquee.remove(); annotMarquee = null; } }

function annotClickNote(note){
  if (!note) return;
  const id = String(note.getAttribute('data-id'));
  const gi = annotGroups.findIndex(function(g){ return g.ids.indexOf(id) >= 0; });
  if (gi >= 0){ annotActive = gi; annotShowPop(annotGroups[gi]); return; }
  const g = {ids:[id], text:'', shape:'circle'};
  annotGroups.push(g);
  annotActive = annotGroups.length - 1;
  annotCommit();
  annotShowPop(g);
}
function annotNoteAt(x, y){
  const list = document.elementsFromPoint(x, y);
  for (let i = 0; i < list.length; i++){
    const n = list[i].closest && list[i].closest('#score .note[data-id]');
    if (n) return n.getAttribute('data-id');
  }
  return null;
}
function annotEraseAt(id){
  const i = annotGroups.findIndex(function(g){ return g.ids.indexOf(String(id)) >= 0; });
  if (i >= 0){
    annotGroups.splice(i, 1);
    if (annotActive === i) annotActive = null;
    annotCommit();
  }
}
function annotSelectRect(x1, y1, x2, y2){
  const a = Math.min(x1, x2), b = Math.max(x1, x2);
  const c = Math.min(y1, y2), d = Math.max(y1, y2);
  const ids = [];
  annotNoteMap().forEach(function(el, id){
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx >= a && cx <= b && cy >= c && cy <= d) ids.push(id);
  });
  if (!ids.length) return;
  const g = {ids: ids, text:'', shape:'rect'};
  annotGroups.push(g);
  annotActive = annotGroups.length - 1;
  annotCommit();
  annotShowPop(g);
}

function annotSetMode(on){
  const was = annotMode;
  annotMode = !!on;
  document.body.classList.toggle('annot-mode', annotMode);
  if (!annotMode){
    annotEraser = false; annotErasing = false; annotActive = null;
    document.body.classList.remove('annot-erase');
    annotHidePop(); annotMarqueeHide();
    annotRender(); annotSend();
    return;
  }
  if (!was){
    try{ window.vp2CancelPlay && window.vp2CancelPlay(); }catch(e){}
    try{ engine.stop(); }catch(e){}
    try{ clearSelection(true); }catch(e){}
    setPlayUI(false);
    annotHistoryReset();
  }
  annotRender(); annotSend();
}

document.addEventListener('pointerdown', function(e){
  if (!annotMode) return;
  if (e.target.closest && (e.target.closest('.annot-ring') || e.target.closest('.annot-chip') || e.target.closest('.annot-del'))) return;
  if (annotActive != null){ annotActive = null; annotRender(); }
}, true);
document.addEventListener('pointerdown', function(e){
  if (!annotMode) return;
  if (!e.target.closest('#score')) return;
  e.preventDefault(); e.stopPropagation();
  if (annotEraser){
    annotErasing = true;
    const id = annotNoteAt(e.clientX, e.clientY);
    if (id) annotEraseAt(id);
    return;
  }
  annotStart = {x: e.clientX, y: e.clientY, note: e.target.closest('#score .note[data-id]')};
  annotMoved = false;
}, true);
document.addEventListener('pointermove', function(e){
  if (!annotMode) return;
  if (annotErasing){
    e.preventDefault(); e.stopPropagation();
    const id = annotNoteAt(e.clientX, e.clientY);
    if (id) annotEraseAt(id);
    return;
  }
  if (!annotStart) return;
  const dx = e.clientX - annotStart.x, dy = e.clientY - annotStart.y;
  if (!annotMoved && (Math.abs(dx) + Math.abs(dy)) > 6) annotMoved = true;
  if (annotMoved){
    e.preventDefault(); e.stopPropagation();
    annotMarqueeShow(annotStart.x, annotStart.y, e.clientX, e.clientY);
  }
}, true);
document.addEventListener('pointerup', function(e){
  if (!annotMode) return;
  if (annotErasing){ annotErasing = false; e.preventDefault(); e.stopPropagation(); return; }
  if (!annotStart) return;
  e.preventDefault(); e.stopPropagation();
  const st = annotStart; annotStart = null;
  if (annotMoved){
    annotMarqueeHide();
    annotSelectRect(st.x, st.y, e.clientX, e.clientY);
  } else {
    annotClickNote(st.note || e.target.closest('#score .note[data-id]'));
  }
}, true);
document.addEventListener('click', function(e){
  if (annotMode && e.target.closest('#score')){ e.preventDefault(); e.stopPropagation(); }
}, true);
document.addEventListener('keydown', function(e){
  if (annotMode && e.key === 'Escape'){ annotHidePop(); annotMarqueeHide(); }
});

/* Re-apply rings after every render */
const _vp2Render = render;
render = function(){ _vp2Render(); annotRender(); };
window.addEventListener('resize', function(){ annotRender(); });
setTimeout(annotRender, 0);
