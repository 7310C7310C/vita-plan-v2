/* V2 UI bridge: JSON score in an isolated frame, v1 chrome outside. */
(function(){
  'use strict';

  const $ = (s)=>document.querySelector(s);
  /* Must match JSON_CACHE in sw-v2.js and v2-cache.js. */
  const JSON_CACHE = 'v2-json-v3';
  const frame = document.getElementById('v2Frame');
  const headActions = document.getElementById('v2HeadActions');
  const imageBtn = document.getElementById('v2ImageBtn');
  const menuBtn = document.getElementById('v2MenuBtn');
  const menu = document.getElementById('v2Menu');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const loadingIndicator = document.getElementById('loadingIndicator');

  const state = {
    data: null,
    active: false,
    image: false,
    ready: false,
    cat: null,
    song: null,
    score: null,
    playing: false,
    tempo: 100,
    parts: {S:true, A:true, T:true, B:true},
    lang: 's',
    uiLang: 'zh',
    metro: false,
    volume: 100,
    timbre: 'church_organ',
    timbres: null,
    scale: 100,
    autowrap: true,
    follow: true,
    theme: 'light',
    capo: 0,
    annot: false,
    annotCount: 0,
    annotEraser: false,
    annotUndo: false,
    annotRedo: false,
    langPending: false,
    langLoading: false,
    loadToken: 0,
    version: 'o'
  };
  let frameIdleTimer = 0;

  /* Runtime mapping is a tiny JS file loaded before this script (no sync XHR). */
  state.data = window.VP2_DATA || null;

  function basePath(){
    try{ return new URL('.', document.baseURI).pathname; }catch(e){ return '/'; }
  }
  function codeFor(cat){
    return state.data && state.data.codes ? state.data.codes[cat] : null;
  }
  function scoreFor(cat, id){
    const code = codeFor(cat);
    return code && state.data.scores ? state.data.scores[code + '/' + id] : null;
  }
  function has(cat, id){ return !!scoreFor(cat, id); }
  /* 版本 JSON：v2-scores.json 每个曲目可带 versions:{g|b|a:{file,label}}，缺省回落到原谱 */
  function versionScore(cat, id, versionCode){
    const ent = scoreFor(cat, id);
    if (!ent) return null;
    const map = ent.versions || {};
    const v = map[versionCode || 'o'] || null;
    return v && v.file ? v : null;
  }
  function post(cmd, extra){
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage(Object.assign({type:'vp2:cmd', cmd:cmd}, extra || {}), location.origin);
  }
  /* iframe.src 会在浏览器 joint session history 里再压一条，导致页内返回
     / history.back() 先吃掉 iframe 条目（表现为要按两次才退一层）。用
     location.replace 只替换当前条目，不增加历史。 */
  function loadFrame(url){
    if (!frame) return;
    try{
      if (frame.contentWindow && frame.contentWindow.location){
        frame.contentWindow.location.replace(url);
        return;
      }
    }catch(e){}
    frame.src = url;
  }
  function setLoading(on){
    if (!loadingOverlay || !loadingIndicator) return;
    loadingOverlay.style.display = on ? 'block' : 'none';
    loadingIndicator.style.display = on ? 'block' : 'none';
  }
  function validScorePath(path){
    return /^data\/scores\/[a-z0-9_-]+\/[0-9]+(?:-[a-z])?\.json$/i.test(String(path || ''));
  }
  function errorScore(song){
    return {id:'__error__', title:(song && song.title) || '乐谱加载失败', credit:'',
      key:'C', keyBase:60, meter:'4/4', beatUnit:1, tempo:80, compound:false, clickStep:1,
      lyricsMode:'note', phrases:[[0]], bars:[{beats:4, chords:[], V:{S:[]}}],
      lyrics:[[]], slurs:[], ties:[], repeat:null};
  }
  async function loadScore(score){
    const path = String(score && score.file || '');
    if (!validScorePath(path)) throw new Error('invalid score path');
    const url = basePath() + path;
    let cache = null;
    try{ cache = await caches.open(JSON_CACHE); }catch(e){}
    if (cache){
      try{
        const hit = await cache.match(url, {ignoreSearch:true});
        if (hit) return await hit.json();   /* 全量预缓存的谱直接秒开，不再逐谱请求 */
      }catch(e){}
    }
    const res = await fetch(url, {cache:'no-store'});
    if (!res || !res.ok) throw new Error('score unavailable');
    const copy = res.clone();
    const data = await res.json();
    if (cache){
      try{ await cache.put(url, copy); }catch(e){}
    }
    return data;
  }

  async function enter(cat, song, score, versionCode){
    const token = ++state.loadToken;
    if (frameIdleTimer){ clearTimeout(frameIdleTimer); frameIdleTimer = 0; }
    state.active = true; state.image = false; state.ready = false;
    state.cat = cat; state.song = song; state.score = score; state.version = versionCode || 'o';
    state.playing = false;
    setPlayUI(false);
    document.body.classList.add('v2-active', 'v2-json-mode');
    document.documentElement.classList.add('v2-lock');
    document.body.classList.remove('v2-image-mode');
    if (headActions) headActions.style.display = 'flex';
    if (menuBtn) menuBtn.style.display = '';
    if (imageBtn){ imageBtn.style.display = ''; imageBtn.textContent = state.uiLang === 'en' ? 'Image' : '图片谱'; }
    if (menu) menu.classList.remove('open');
    setAnnot(false);
    const vc = document.getElementById('viewerContent');
    if (vc) vc.classList.add('v2-mode');
    setLoading(true);
    document.title = song.title || '复活计划乐队';
    let data;
    try{ data = await loadScore(score); }
    catch(e){ data = errorScore(song); }
    if (token !== state.loadToken || !state.active) return;
    try{ localStorage.setItem('v2.current.score', JSON.stringify(data)); }catch(e){}
    loadFrame(basePath() + 'player-frame.html');
    setTimeout(()=>{ if (!state.ready && token === state.loadToken) setLoading(false); }, 6000);
  }
  function leave(){
    state.loadToken++;
    const wasActive = state.active;
    state.active = false; state.image = false; state.ready = false;
    setPlayUI(false);
    setAnnot(false);
    document.body.classList.remove('v2-active', 'v2-json-mode', 'v2-image-mode');
    document.documentElement.classList.remove('v2-lock');
    if (headActions) headActions.style.display = 'none';
    if (menu) menu.classList.remove('open');
    const vc = document.getElementById('viewerContent');
    if (vc) vc.classList.remove('v2-mode');
    /* 先停播；稍后确认没有重新进入再卸载 iframe。
       用 location.replace 卸载不会新增浏览器历史条目。 */
    if (wasActive) post('stop');
    if (frameIdleTimer){ clearTimeout(frameIdleTimer); frameIdleTimer = 0; }
    frameIdleTimer = setTimeout(function(){
      frameIdleTimer = 0;
      if (!state.active) loadFrame('about:blank');
    }, 250);
    setLoading(false);
    document.title = '复活计划乐队';
    state.cat = null; state.song = null; state.score = null;
  }
  /* 无 JSON 的纯图片谱：VP2UI 已 leave()，但仍需让 isImage() 与画面一致 */
  function setExternalImageMode(on){
    state.image = !!on;
    document.body.classList.toggle('v2-image-mode', !!on);
    document.body.classList.toggle('v2-json-mode', false);
  }
  function setImageMode(on){
    if (!state.active) return;
    if (on) setAnnot(false);
    state.image = !!on;
    document.body.classList.toggle('v2-image-mode', !!on);
    document.body.classList.toggle('v2-json-mode', !on);
    const vc = document.getElementById('viewerContent');
    if (vc) vc.classList.toggle('v2-mode', !on);
    if (on){ post('stop'); }
    if (imageBtn) imageBtn.textContent = on ? (state.uiLang === 'en' ? 'Back' : '返回') : (state.uiLang === 'en' ? 'Image' : '图片谱');
    if (menuBtn) menuBtn.style.display = on ? 'none' : '';
    if (on && menu) menu.classList.remove('open');
  }
  function routeForCategory(cat){
    const code = codeFor(cat);
    return code ? (basePath() + code) : null;
  }
  function routeFor(cat, id){
    const code = codeFor(cat);
    return code ? (basePath() + code + '/' + id) : null;
  }
  function pushPath(path){
    try{ history.pushState({v2:true}, '', basePath() + path); }catch(e){}
  }
  function versionCode(version){
    return ({'原谱':'o','贝司':'b','吉他':'g','备选':'a'})[version] || '';
  }
  function withVersion(href, version){
    const code = versionCode(version);
    if (!code || code === 'o') return href;
    return href + '?v=' + encodeURIComponent(code);
  }
  function pushRoute(cat, id, version){
    let href = routeFor(cat, id);
    if (!href) return;
    href = withVersion(href, version);
    try{ history.pushState({v2song:true}, '', href); }catch(e){}
  }
  function replaceRoute(cat, id, version){
    let href = routeFor(cat, id);
    if (!href) return;
    href = withVersion(href, version);
    let depth = 1;
    try{
      if (history.state && typeof history.state.depth === 'number') depth = history.state.depth;
    }catch(e){}
    try{ history.replaceState({v2:true, view:'song', depth:depth}, '', href); }catch(e){}
  }
  function setVersionQuery(version){
    try{
      const url = new URL(location.href);
      const code = versionCode(version);
      if (!code || code === 'o') url.searchParams.delete('v');
      else url.searchParams.set('v', code);
      history.replaceState(history.state, '', url.pathname + url.search);
    }catch(e){}
  }
  function handleRoute(songsData){
    try{
      let p = location.pathname;
      const base = basePath();
      if (p.indexOf(base) === 0) p = p.slice(base.length);
      p = p.replace(/^\/+|\/+$/g, '');
      const parts = p.split('/').filter(Boolean);
      if (parts.length === 1){
        if (parts[0] === 'weekly'){ if (window.showWeeklySongs) window.showWeeklySongs(); return true; }
        const cat1 = Object.keys(state.data.codes).find(c => state.data.codes[c] === parts[0]);
        if (cat1 && window.showCategory){ window.showCategory(cat1); return true; }
        return false;
      }
      if (parts.length !== 2) return false;
      const code = parts[0], id = parts[1];
      const cat = Object.keys(state.data.codes).find(c => state.data.codes[c] === code);
      const song = cat && songsData && songsData.categories && songsData.categories[cat] &&
                   songsData.categories[cat].songs && songsData.categories[cat].songs[id];
      if (!song) return false;
      window.showSong(cat, Object.assign({}, song, {id:id}));
      return true;
    }catch(e){ return false; }
  }

  /* Menu controls */
  function setPlayUI(playing){
    state.playing = !!playing;
    const q = document.getElementById('v2QuickPauseBtn');
    if (q){
      const label = state.uiLang === 'en' ? (playing ? 'Pause' : 'Play') : (playing ? '暂停' : '播放');
      q.title = label; q.setAttribute('aria-label', label);
      q.classList.toggle('playing', !!playing);
      q.style.display = state.active ? 'flex' : 'none';
    }
  }
  function syncVoices(list){
    if (!Array.isArray(list) || !list.length) return;
    document.querySelectorAll('#v2Menu [data-part]').forEach(function(el){
      const p = el.getAttribute('data-part');
      el.style.display = list.indexOf(p) >= 0 ? '' : 'none';
    });
    const all = document.getElementById('v2PartsAll');
    if (all) all.style.display = list.length > 1 ? '' : 'none';
    const anyPart = document.querySelector('#v2Menu [data-part]');
    if (anyPart){
      const row = anyPart.closest('.v2-row');
      if (row) row.style.display = list.length > 1 ? '' : 'none';
    }
  }
  function syncParts(parts){
    if (!parts) return;
    state.parts = Object.assign({}, state.parts, parts);
    document.querySelectorAll('#v2Menu [data-part]').forEach(el=>{
      const p = el.getAttribute('data-part');
      el.classList.toggle('on', !!state.parts[p]);
    });
  }
  function syncTempo(v){
    state.tempo = +v || 100;
    const r = document.getElementById('v2Tempo');
    const l = document.getElementById('v2TempoVal');
    if (r) r.value = state.tempo;
    if (l) l.textContent = state.tempo;
  }
  function syncLang(v){
    state.lang = v === 't' ? 't' : 's';
    const b = document.getElementById('v2LangBtn');
    if (b) b.textContent = state.lang === 't' ? '繁' : '简';
  }
  const GM_GROUP_EN = {
    '钢琴':'Piano', '半音打击':'Chromatic Percussion', '风琴':'Organ', '吉他':'Guitar',
    '低音':'Bass', '弦乐':'Strings', '合奏':'Ensemble', '铜管':'Brass', '簧管':'Reed',
    '笛管':'Pipe', '合成主音':'Synth Lead', '合成背景':'Synth Pad',
    '合成效果':'Synth Effects', '民族':'Ethnic'
  };
  function gmEn(id){
    return String(id || '').replace(/_+/g, ' ').replace(/\b[a-z]/g, function(c){ return c.toUpperCase(); });
  }
  function buildTimbres(list){
    if (!Array.isArray(list) || !list.length) return;
    state.timbres = list;
    const sel = document.getElementById('v2Timbre');
    if (!sel) return;
    sel.textContent = '';
    const en = state.uiLang === 'en';
    list.forEach(function(g){
      const og = document.createElement('optgroup');
      og.label = en ? (GM_GROUP_EN[g.name] || g.name || '') : (g.name || '');
      (g.items || []).forEach(function(it){
        if (!Array.isArray(it) || it.length < 2) return;
        const o = document.createElement('option');
        o.value = it[0];
        o.textContent = en ? gmEn(it[0]) : it[1];
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
    if (state.timbre) sel.value = state.timbre;
  }
  function syncSettings(m){
    if (!m) return;
    if (m.timbre){
      state.timbre = m.timbre;
      const el = document.getElementById('v2Timbre'); if (el) el.value = m.timbre;
    }
    if (m.scale != null){
      state.scale = +m.scale || 100;
      const r = document.getElementById('v2Scale'), l = document.getElementById('v2ScaleVal');
      if (r) r.value = state.scale;
      if (l) l.textContent = state.scale + '%';
    }
    if (typeof m.autowrap === 'boolean') setAutowrap(m.autowrap);
    if (typeof m.follow === 'boolean'){
      state.follow = m.follow;
      const b = document.getElementById('v2FollowBtn'); if (b) b.classList.toggle('on', m.follow);
    }
    if (m.theme){
      state.theme = m.theme;
      const b = document.getElementById('v2ThemeBtn'); if (b) b.classList.toggle('on', m.theme === 'dark');
    }
    if (m.capo != null){
      state.capo = Math.max(0, Math.min(12, +m.capo || 0));
      const el = document.getElementById('v2Capo'); if (el) el.value = String(state.capo);
    }
  }
  function setAutowrap(on){
    state.autowrap = !!on;
    document.querySelectorAll('#v2WrapBarBtn').forEach(function(b){ b.classList.toggle('on', state.autowrap); });
  }
  function updateAnnotTools(m){
    if (m.count != null){
      state.annotCount = +m.count || 0;
      const clr = document.getElementById('v2AnnotClearBtn'); if (clr) clr.disabled = state.annotCount === 0;
    }
    if (typeof m.eraser === 'boolean'){
      state.annotEraser = m.eraser;
      const er = document.getElementById('v2AnnotEraserBtn'); if (er) er.classList.toggle('on', state.annotEraser);
    }
    if (typeof m.undo === 'boolean'){
      state.annotUndo = m.undo;
      const b = document.getElementById('v2AnnotUndoBtn'); if (b) b.disabled = !m.undo;
    }
    if (typeof m.redo === 'boolean'){
      state.annotRedo = m.redo;
      const b = document.getElementById('v2AnnotRedoBtn'); if (b) b.disabled = !m.redo;
    }
  }
  function setAnnot(on){
    state.annot = !!on;
    document.body.classList.toggle('v2-annot-mode', state.annot);
    document.querySelectorAll('#v2AnnotBarBtn').forEach(function(b){ b.classList.toggle('on', state.annot); });
    const q = document.getElementById('v2QuickPauseBtn');
    if (q) q.disabled = state.annot;
    post('annot', {value: state.annot});
    if (state.annot){
      post('stop');
      setPlayUI(false);
      state.annotEraser = false;
      const er = document.getElementById('v2AnnotEraserBtn'); if (er) er.classList.remove('on');
      if (window.showToast) window.showToast('标记模式：点击或框选音符，可加文字');
    }
  }
  function applyUILang(lang){
    const en = lang === 'en';
    state.uiLang = en ? 'en' : 'zh';
    document.querySelectorAll('#v2Menu [data-zh]').forEach(el=>{
      const t = en ? (el.getAttribute('data-en') || el.getAttribute('data-zh')) : el.getAttribute('data-zh');
      if (el.tagName === 'INPUT') return;
      if (el.children.length === 0) el.textContent = t;
      else { const span = el.querySelector('span'); if (span) span.textContent = t; }
    });
    if (imageBtn && state.active) imageBtn.textContent = state.image ? (en?'Back':'返回') : (en?'Image':'图片谱');
    const annotBar = document.getElementById('v2AnnotBarBtn');
    if (annotBar) annotBar.textContent = en ? 'Mark' : '标注';
    const wrapBar = document.getElementById('v2WrapBarBtn');
    if (wrapBar) wrapBar.textContent = en ? 'Wrap' : '自动换行';
    const toolMap = {v2AnnotSaveBtn:'保存', v2AnnotClearBtn:'清空', v2AnnotEraserBtn:'橡皮擦'};
    const toolEn = {v2AnnotSaveBtn:'Save', v2AnnotClearBtn:'Clear', v2AnnotEraserBtn:'Eraser'};
    Object.keys(toolMap).forEach(function(id){
      const el = document.getElementById(id);
      if (el) el.textContent = en ? toolEn[id] : toolMap[id];
    });
    [['v2AnnotUndoBtn','撤销','Undo'], ['v2AnnotRedoBtn','重做','Redo']].forEach(function(x){
      const el = document.getElementById(x[0]);
      if (el){ const t = en ? x[2] : x[1]; el.title = t; el.setAttribute('aria-label', t); }
    });
    if (menuBtn) menuBtn.textContent = en ? 'Menu' : '菜单';
    if (state.timbres) buildTimbres(state.timbres);
    setPlayUI(state.playing);
  }

  function ready(m){
    state.ready = true;
    setLoading(false);
    buildTimbres(m.timbres);
    if (m.voices) syncVoices(m.voices);
    syncSettings(m);
    if (m.tempo) syncTempo(m.tempo);
    if (m.parts) syncParts(m.parts);
    if (m.lang) syncLang(m.lang);
    if (typeof m.metronome === 'boolean'){
      state.metro = m.metronome;
      const el = document.getElementById('v2Metro');
      if (el) el.classList.toggle('on', state.metro);
    }
    if (m.volume != null){
      state.volume = m.volume;
      const el = document.getElementById('v2Vol');
      const l = document.getElementById('v2VolVal');
      if (el) el.value = state.volume;
      if (l) l.textContent = state.volume;
    }
  }

  window.addEventListener('message', function(e){
    if (e.origin !== location.origin) return;
    const m = e.data || {};
    if (m.type === 'vp2:menu-close'){
      if (menu) menu.classList.remove('open');
    } else if (m.type === 'vp2:lang'){
      if (m.lang) syncLang(m.lang);
      const btn = document.getElementById('v2LangBtn');
      if (m.state === 'loading'){
        state.langLoading = true;
        if (btn) btn.disabled = true;
        if (state.langPending && window.showToast) window.showToast('繁體轉換載入中…');
      } else {
        state.langLoading = false;
        if (btn) btn.disabled = false;
        if (state.langPending && window.showToast){
          if (m.state === 'ready') window.showToast(m.lang === 't' ? '已切換繁體' : '已切換簡體');
          else if (m.state === 'failed') window.showToast('繁體轉換需要連網，已保持簡體');
        }
        state.langPending = false;
      }
    } else if (m.type === 'vp2:timbre'){
      if (window.showToast){
        const label = m.label || (state.uiLang === 'en' ? 'Timbre' : '音色');
        const en = state.uiLang === 'en';
        if (m.state === 'loading') window.showToast(en ? label + ' loading… (synth for now)' : label + ' 音色加载中…（先用合成音）');
        else if (m.state === 'ready') window.showToast(en ? label + ' ready' : label + ' 音色已就绪');
        else if (m.state === 'failed') window.showToast(en ? label + ' failed; using synth' : label + ' 加载失败，继续使用合成音');
      }
    } else if (m.type === 'vp2:annot'){
      updateAnnotTools(m);
    } else if (m.type === 'vp2:ready'){
      ready(m);
    } else if (m.type === 'vp2:state'){
      setPlayUI(!!m.playing);
      syncSettings(m);
      if (m.voices) syncVoices(m.voices);
      if (m.tempo) syncTempo(m.tempo);
      if (m.parts) syncParts(m.parts);
      if (m.lang) syncLang(m.lang);
      if (typeof m.metronome === 'boolean'){
        state.metro = m.metronome;
        const el = document.getElementById('v2Metro');
        if (el) el.classList.toggle('on', state.metro);
      }
      if (m.volume != null){
        state.volume = m.volume;
        const el = document.getElementById('v2Vol');
        const l = document.getElementById('v2VolVal');
        if (el) el.value = state.volume;
        if (l) l.textContent = state.volume;
      }
    }
  });

  /* Wire UI on DOM ready; the script is loaded at end of body. */
  function wire(){
    if (imageBtn){
      imageBtn.addEventListener('click', function(){
        if (!state.active) return;
        if (state.image){
          setImageMode(false);
          if (window.__vpSetImageMode) window.__vpSetImageMode(false);
        } else {
          setImageMode(true);
          if (window.__vpSetImageMode) window.__vpSetImageMode(true);
        }
      });
    }
    const capoSel = document.getElementById('v2Capo');
    if (capoSel){
      for (let i=0;i<=12;i++){
        const o=document.createElement('option');
        o.value=String(i);
        o.textContent = i ? String(i) : '关闭';
        if (!i){ o.setAttribute('data-zh','关闭'); o.setAttribute('data-en','Off'); }
        capoSel.appendChild(o);
      }
      capoSel.addEventListener('change', function(){
        state.capo = +capoSel.value || 0;
        post('capo', {value: state.capo});
      });
    }
    if (menuBtn && menu){
      menuBtn.addEventListener('click', function(e){
        e.stopPropagation();
        menu.classList.toggle('open');
      });
      menu.addEventListener('click', function(e){ e.stopPropagation(); });
      const menuClose = document.getElementById('v2MenuClose');
      if (menuClose) menuClose.addEventListener('click', function(){ menu.classList.remove('open'); });
      /* capture：即使目标元素 stopPropagation（例如收藏按钮），点菜单外也关闭 */
      document.addEventListener('click', function(e){
        if (menu.contains(e.target)) return;
        if (menuBtn && menuBtn.contains(e.target)) return;
        menu.classList.remove('open');
      }, true);
    }
    const quickPause = document.getElementById('v2QuickPauseBtn');
    if (quickPause) quickPause.addEventListener('click', function(){
      if (state.playing){ post('pause'); setPlayUI(false); }
      else { post('play'); setPlayUI(true); }
    });
    document.querySelectorAll('#v2Menu [data-part]').forEach(el=>{
      el.addEventListener('click', function(){
        const p = el.getAttribute('data-part');
        state.parts[p] = !state.parts[p];
        el.classList.toggle('on', state.parts[p]);
        post('parts', {parts: state.parts});
      });
    });
    const tempo = document.getElementById('v2Tempo');
    const tempoVal = document.getElementById('v2TempoVal');
    if (tempo){
      tempo.addEventListener('input', function(){
        state.tempo = +tempo.value;
        if (tempoVal) tempoVal.textContent = state.tempo;
        post('tempo', {value: state.tempo});
      });
    }
    const metro = document.getElementById('v2Metro');
    if (metro){
      metro.addEventListener('click', function(){
        state.metro = !state.metro;
        metro.classList.toggle('on', state.metro);
        post('metronome', {value: state.metro});
      });
    }
    const vol = document.getElementById('v2Vol');
    const volVal = document.getElementById('v2VolVal');
    if (vol){
      vol.addEventListener('input', function(){
        state.volume = +vol.value;
        if (volVal) volVal.textContent = state.volume;
        post('volume', {value: state.volume});
      });
    }
    const langBtn = document.getElementById('v2LangBtn');
    if (langBtn){
      langBtn.addEventListener('click', function(){
        if (state.langLoading) return;
        state.langPending = true;
        syncLang(state.lang === 't' ? 's' : 't');
        post('lang', {value: state.lang});
      });
    }
    const annotBar = document.getElementById('v2AnnotBarBtn');
    if (annotBar) annotBar.addEventListener('click', function(){ setAnnot(!state.annot); });
    const annotSave = document.getElementById('v2AnnotSaveBtn');
    if (annotSave) annotSave.addEventListener('click', function(){
      post('annotSave');
      if (window.showToast) window.showToast('标记已保存到本机');
      setAnnot(false);
    });
    const annotClear = document.getElementById('v2AnnotClearBtn');
    if (annotClear) annotClear.addEventListener('click', function(){
      if (!state.annotCount) return;
      const ask = state.uiLang === 'en' ? 'Clear all marks for this score?' : '清空本曲所有标记？';
      if (!confirm(ask)) return;
      post('annotClear');
      if (window.showToast) window.showToast('已清空标记');
    });
    const annotEraser = document.getElementById('v2AnnotEraserBtn');
    if (annotEraser) annotEraser.addEventListener('click', function(){
      state.annotEraser = !state.annotEraser;
      annotEraser.classList.toggle('on', state.annotEraser);
      post('annotEraser', {value: state.annotEraser});
      if (window.showToast){
        const en = state.uiLang === 'en';
        window.showToast(state.annotEraser
          ? (en ? 'Eraser mode: drag across marks to erase' : '橡皮擦模式：拖过标记即可清除')
          : (en ? 'Eraser off' : '已退出橡皮擦模式'));
      }
    });
    const annotUndo = document.getElementById('v2AnnotUndoBtn');
    if (annotUndo) annotUndo.addEventListener('click', function(){ post('annotUndo'); });
    const annotRedo = document.getElementById('v2AnnotRedoBtn');
    if (annotRedo) annotRedo.addEventListener('click', function(){ post('annotRedo'); });
    const partsAll = document.getElementById('v2PartsAll');
    if (partsAll) partsAll.addEventListener('click', function(){
      ['S','A','T','B'].forEach(function(p){ state.parts[p] = true; });
      document.querySelectorAll('#v2Menu [data-part]').forEach(function(el){ el.classList.add('on'); });
      post('parts', {parts: state.parts});
    });
    const timbre = document.getElementById('v2Timbre');
    if (timbre) timbre.addEventListener('change', function(){
      state.timbre = timbre.value;
      post('timbre', {value: state.timbre});
    });
    const scale = document.getElementById('v2Scale');
    const scaleVal = document.getElementById('v2ScaleVal');
    if (scale) scale.addEventListener('input', function(){
      state.scale = +scale.value || 100;
      if (scaleVal) scaleVal.textContent = state.scale + '%';
      post('scale', {value: state.scale});
    });
    const wrapBar = document.getElementById('v2WrapBarBtn');
    if (wrapBar) wrapBar.addEventListener('click', function(){
      setAutowrap(!state.autowrap);
      post('autowrap', {value: state.autowrap});
    });
    const followBtn = document.getElementById('v2FollowBtn');
    if (followBtn) followBtn.addEventListener('click', function(){
      state.follow = !state.follow;
      followBtn.classList.toggle('on', state.follow);
      post('follow', {value: state.follow});
    });
    const themeBtn = document.getElementById('v2ThemeBtn');
    if (themeBtn) themeBtn.addEventListener('click', function(){
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      themeBtn.classList.toggle('on', state.theme === 'dark');
      post('theme', {value: state.theme});
    });
    const resetBtn = document.getElementById('v2ResetBtn');
    if (resetBtn) resetBtn.addEventListener('click', function(){
      const ask = state.uiLang === 'en' ? 'Reset all settings to defaults?' : '确定回复所有预设设定？';
      if (!confirm(ask)) return;
      post('reset');
    });
    applyUILang(localStorage.getItem('fhj_language') || 'zh');
    document.addEventListener('languagechange', function(){
      applyUILang(localStorage.getItem('fhj_language') || 'zh');
    });
  }

  window.VP2UI = {
    has, scoreFor, versionScore, enter, leave, setImageMode, setExternalImageMode, isActive:()=>state.active, isImage:()=>state.image,
    pushRoute, replaceRoute, setVersionQuery, routeFor, routeForCategory, pushPath, handleRoute, basePath, post, setUILang: applyUILang,
    get state(){ return state; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();

  /* PageUp/PageDown: forward to the score iframe when v2 mode is active */
  document.addEventListener('keydown', function(e){
    const k = e.key;
    if (k !== 'PageUp' && k !== 'PageDown' && k !== 'Home' && k !== 'End') return;
    if (!frame || getComputedStyle(frame).display === 'none') return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    e.preventDefault();
    try {
      const w = frame.contentWindow;
      if (k === 'Home' || k === 'End') {
        if (w && typeof w.vp2Home === 'function') w.vp2Home(k === 'End' ? 1 : -1);
        else frame.focus();
      } else {
        if (w && typeof w.vp2Page === 'function') w.vp2Page(k === 'PageDown' ? 1 : -1);
        else frame.focus();
      }
    } catch (err) {
      try { frame.focus(); } catch (_) {}
    }
  });
})();
