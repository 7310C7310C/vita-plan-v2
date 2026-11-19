/* Extracted from player-frame.html; edit here, not in the HTML. */
(function(){
  const qs = new URLSearchParams(location.search);
  const id = qs.get("id") || "";
  const empty = {id:id||"__empty__",title:"乐谱未加载",credit:"",key:"C",keyBase:60,meter:"4/4",beatUnit:1,tempo:80,compound:false,clickStep:1,lyricsMode:"note",phrases:[[0]],bars:[{beats:4,chords:[],V:{S:[]}}],lyrics:[[]],slurs:[],ties:[],repeat:null};
  let data = null;
  try{ const raw = localStorage.getItem("v2.current.score"); if (raw) data = JSON.parse(raw); }catch(e){}
  window.__SCORE = data || empty;
  window.__SONG_ID = qs.get("id") || (data && data.id) || id || "__empty__";
  document.body.classList.add("embed");
  setTimeout(()=>document.body.classList.add("ready"), 2500);   /* 保险：即使初始化失敗也显示 */
})();
