/* ===== Route 66 Family Challenge — ARCADE EDITION ===== */
const ACCOUNTS={
  Jacob:{role:'player',hash:'03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'},
  Lily:{role:'player',hash:'fe2592b42a727e977f055947385b709cc82b16b9a87f88c6abf3900d65d0cdc3'},
  Hannah:{role:'player',hash:'9975baa75e1603273cbd3d94746a0442e22d5dc0268750dd45229f343f53fe19'},
  Ethan:{role:'player',hash:'08f61ac43fc9a9d5bd3d41f6dc2976ad27d8d5d8422e2ac87c12b98364a331fe'},
  admin:{role:'admin',hash:'7f3d56bb44da1a1f5239ac9db712488db90f135d999290ed9104eba8691096e2'}
};
/* Paste your Google Apps Script /exec URL into sheetEndpoint to sync across devices. */
const CONFIG={sheetEndpoint:'https://script.google.com/macros/s/AKfycbx_qOmtVWPm7BuClVf1Yj-w4pV7OyWgEzxntc89hgxNeQ9FB-acd6j5NcC0rO7wgkGy/exec',sheetUrl:'',youtubeKey:'AIzaSyC97QvLqWtLZ339RY01Zfv2ghEVJWr14TE'};
/* Departure: 12 Aug 2026, 11:40 UK time (BST = UTC+1) */
const DEPARTURE=Date.UTC(2026,7,12,10,40,0);
const SCORE_PER_STOP=100;
const PLAYER_NAMES=Object.keys(ACCOUNTS).filter(n=>ACCOUNTS[n].role==='player');
const STORAGE={session:'route66-session-v4',shared:'route66-shared-v4',progressPrefix:'route66-progress-v4-'};
const AVATARS={Jacob:'🦖',Lily:'🦄',Hannah:'🌻',Ethan:'🚀',admin:'👑',test:'🧪'};

let session=null,progress=freshProgress(),shared=freshShared(),currentLevel=null,countdownTimer=null,activeGame=null;
const $=s=>document.querySelector(s);
const els={
  login:$('#login'),site:$('#site'),loginForm:$('#loginForm'),username:$('#username'),password:$('#password'),loginError:$('#loginError'),
  who:$('#who'),homeView:$('#homeView'),levelView:$('#levelView'),levelBody:$('#levelBody'),backBtn:$('#backBtn'),
  countdown:$('#countdown'),map:$('#map'),mapProgress:$('#mapProgress'),
  hud:$('#hud'),hudName:$('#hudName'),hudFill:$('#hudFill'),hudCaption:$('#hudCaption'),hudScore:$('#hudScore'),hudAvatar:$('#hudAvatar'),
  reward:$('#reward'),rewardText:$('#rewardText'),amazonBtn:$('#amazonBtn'),voucher:$('#voucher'),
  adminPanel:$('#adminPanel'),adminRows:$('#adminRows'),adminEmpty:$('#adminEmpty'),sheetStatus:$('#sheetStatus'),
  leaderboard:$('#leaderboard'),leaderboardRows:$('#leaderboardRows'),leaderboardEmpty:$('#leaderboardEmpty'),
  syncBtn:$('#syncBtn'),logoutBtn:$('#logoutBtn'),adminRefreshBtn:$('#adminRefreshBtn'),exportCsvBtn:$('#exportCsvBtn')
};

/* ---------- storage ---------- */
function freshProgress(){return {completed:{},submitted:{},photos:{},hunt:{},huntPhotos:{},game:{},quiz:{},points:{},chips:25,chipGrant:{}};}
function freshShared(){return {submissions:[],updatedAt:null,players:[]};}
function readJson(k,f=null){try{const v=localStorage.getItem(k);return v?JSON.parse(v):f;}catch{return f;}}
function writeJson(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true;}catch{return false;}}
function progressKey(){return STORAGE.progressPrefix+(session?.username||'guest');}
function loadProgress(){progress=mergeProgress(readJson(progressKey(),null));if(session&&session.test)progress.chips=999999;}
function saveProgress(){if(session?.role!=='admin'&&!writeJson(progressKey(),progress)){alert('Phone storage is full — oldest photos may not save. Ask Ethan to sync!');}}
function mergeProgress(s){const m=freshProgress();if(!s||typeof s!=='object')return m;Object.keys(m).forEach(k=>{if(k==='chips'){m.chips=Number.isFinite(s.chips)?s.chips:25;}else{m[k]=s[k]&&typeof s[k]==='object'?s[k]:m[k];}});return m;}
function loadShared(){shared=normaliseShared(readJson(STORAGE.shared,freshShared()));}
function saveShared(){shared.updatedAt=new Date().toISOString();writeJson(STORAGE.shared,shared);}

/* ---------- helpers ---------- */
async function sha256(t){const b=new TextEncoder().encode(t);const d=await crypto.subtle.digest('SHA-256',b);return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');}
function normalName(n){const c=n.trim().toLowerCase();return Object.keys(ACCOUNTS).find(a=>a.toLowerCase()===c);}
function isAdmin(){return session?.role==='admin';}
function today(){const d=new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
function dateObj(v){const [y,m,d]=v.split('-').map(Number);return new Date(y,m-1,d);}
function stopById(id){return STOPS.find(s=>s.id===id);}
function timestamp(v){const t=Date.parse(v||'');return Number.isFinite(t)?t:0;}
function latestSubmission(u,id){return shared.submissions.filter(i=>i.username===u&&i.stopId===id).sort((a,b)=>timestamp(b.updatedAt)-timestamp(a.updatedAt))[0]||null;}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

/* ---------- PER-PLAYER TASKS (seeded picks so everyone gets different tasks) ---------- */
function seedFrom(str){let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
function pickFor(user,stopId,arr,n){
  const rnd=mulberry(seedFrom(user+'|'+stopId));
  const idx=arr.map((_,i)=>i);
  for(let i=idx.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[idx[i],idx[j]]=[idx[j],idx[i]];}
  return idx.slice(0,n).sort((a,b)=>a-b).map(i=>arr[i]);
}
function myHunt(stop){return pickFor(session?.username||'test',stop.id,stop.huntPool,5);}
function myQuiz(stop){return pickFor(session?.username||'test',stop.id,stop.quizPool,3);}

/* ---------- status / unlock ---------- */
function statusForStop(id){
  if(session?.test)return 'approved';
  if(isAdmin())return 'admin';
  const latest=latestSubmission(session?.username,id);
  if(latest?.status==='approved'||progress.completed[id])return 'approved';
  if(latest?.status==='pending'||progress.submitted[id]?.status==='pending')return 'pending';
  if(latest?.status==='rejected'||progress.submitted[id]?.status==='rejected')return 'rejected';
  return 'ready';
}
function unlocked(index){
  if(session?.test||isAdmin())return true;
  if(today()<dateObj(STOPS[index].unlock))return false;
  if(index===0)return true;
  return statusForStop(STOPS[index-1].id)==='approved';
}
function lockReason(index){
  if(today()<dateObj(STOPS[index].unlock))return 'Opens on '+STOPS[index].day+'.';
  if(index>0)return 'Clear '+STOPS[index-1].title+' first to unlock this.';
  return '';
}
function scoreWithBonus(i){return Number(i.score||SCORE_PER_STOP)+Number(i.bonus||0);}
function applySharedToProgress(){
  if(!session||session.test||isAdmin())return;
  STOPS.forEach(stop=>{
    const latest=latestSubmission(session.username,stop.id);
    if(!latest)return;
    progress.submitted[stop.id]={id:latest.id,status:latest.status};
    if(latest.status==='approved'){progress.completed[stop.id]=true;progress.points[stop.id]=scoreWithBonus(latest);}
    if(latest.status==='rejected'){delete progress.completed[stop.id];delete progress.points[stop.id];}
  });
  saveProgress();
}
function playerPoints(u){
  const t=shared.submissions.filter(i=>i.username===u&&i.status==='approved').reduce((s,i)=>s+scoreWithBonus(i),0);
  if(t)return t;
  return Object.values(progress.points).reduce((s,v)=>s+Number(v||0),0);
}

/* ---------- countdown ---------- */
function renderCountdown(){
  const diff=DEPARTURE-Date.now();
  if(diff<=0){els.countdown.innerHTML='<span class="cd-label">✈️ We are on our way to America! Have an amazing trip!</span>';return;}
  const days=Math.floor(diff/86400000),hrs=Math.floor(diff%86400000/3600000),mins=Math.floor(diff%3600000/60000);
  els.countdown.innerHTML='<span class="cd-label">🛫 Countdown to take-off!</span><div class="cd-units">'+
    '<div class="cd-unit"><b>'+days+'</b><span>days</span></div>'+
    '<div class="cd-unit"><b>'+hrs+'</b><span>hours</span></div>'+
    '<div class="cd-unit"><b>'+mins+'</b><span>mins</span></div></div>';
}

/* ---------- views ---------- */
function stopGame(){if(activeGame?.stop)activeGame.stop();activeGame=null;}
function showHome(){
  stopGame();currentLevel=null;
  els.levelView.classList.add('hidden');els.homeView.classList.remove('hidden');
  renderHome();window.scrollTo(0,0);
}
function openLevel(index){
  if(!unlocked(index)&&!isAdmin())return;
  stopGame();currentLevel=index;
  els.homeView.classList.add('hidden');els.levelView.classList.remove('hidden');
  renderLevel(index);window.scrollTo(0,0);
}
function renderHome(){
  els.who.textContent=session.test?'test mode':isAdmin()?'admin':session.username;
  renderCountdown();renderMap();
  els.adminPanel.classList.toggle('hidden',!isAdmin());
  els.leaderboard.classList.toggle('hidden',!isAdmin());
  els.hud.classList.toggle('hidden',isAdmin());
  renderAdminPanel();renderLeaderboard();renderReward();
  if(!isAdmin()){
    const done=STOPS.filter(s=>statusForStop(s.id)==='approved').length;
    const pct=Math.round(done/STOPS.length*100);
    els.mapProgress.textContent=done>=STOPS.length?'Every stop cleared! 🏆':'Tap the glowing stop to play!';
    els.hudName.textContent=session.test?'Test pilot':session.username;
    els.hudAvatar.textContent=AVATARS[session.username]||'🚗';
    els.hudFill.style.width=pct+'%';
    els.hudCaption.textContent=done+' / '+STOPS.length+' stops cleared · '+pct+'%';
    els.hudScore.textContent=playerPoints(session.username)+(progress.playBonus||0);updateChips();
  }else els.mapProgress.textContent='Admin view — approve missions below.';
}
function renderMap(){
  els.map.innerHTML='';
  let nextIndex=-1;
  for(let i=0;i<STOPS.length;i++){if(unlocked(i)&&!['approved','admin'].includes(statusForStop(STOPS[i].id))){nextIndex=i;break;}}
  STOPS.forEach((stop,index)=>{
    const status=statusForStop(stop.id),isLocked=!unlocked(index);
    const node=document.createElement('div');
    node.className='level-node '+(index%2===0?'up':'down')+' '+status+(isLocked?' is-locked':'')+(index===nextIndex&&!isLocked?' is-next':'');
    const sub=isLocked?stop.day:status==='approved'?'Cleared!':status==='pending'?'Checking…':'Play';
    node.innerHTML='<div class="level-circle" role="button" tabindex="0"><span class="level-num">'+(index+1)+'</span><span class="level-emoji">'+stop.emoji+'</span></div>'+
      (index===nextIndex&&!isLocked?'<div class="mascot">🚙</div>':'')+
      '<div class="level-stars">'+(status==='approved'?'★★★':'')+'</div>'+
      '<div class="level-title"></div><div class="level-sub">'+sub+'</div>';
    node.querySelector('.level-title').textContent=stop.title;
    if(!isLocked){
      const c=node.querySelector('.level-circle');
      const go=()=>openLevel(index);
      c.addEventListener('click',go);
      c.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}});
    }
    els.map.appendChild(node);
  });
}

/* ---------- LEVEL PAGE ---------- */
function renderLevel(index){
  const stop=STOPS[index];
  const status=statusForStop(stop.id),locked=!unlocked(index);
  const labels={approved:['Mission cleared ⭐','🏆','You smashed it — next stop unlocked!'],
    pending:['Checking your mission','🕵️','The boss is reviewing your photos and answers.'],
    rejected:['Mission failed — retry!','💥','Have another go and resubmit.'],
    ready:['Mission briefing','🎯','Complete all objectives, then submit!'],
    admin:['Admin view','👑','Approve from the map screen.']};
  const [pillText,statusEmoji,statusCopy]=labels[status]||labels.ready;
  const taskSection=(step,title,tag,cls,body)=>('<section class="task-block '+cls+'"><div class="task-head"><span class="task-step">'+step+'</span><h3>'+title+'</h3>'+
    (tag?'<span class="tag-pill">'+tag+'</span>':'')+'<span class="task-done-tag">Done ✓</span></div><div class="task-body">'+body+'</div></section>');

  const root=document.createElement('div');
  root.className='level-card';
  root.innerHTML=
    '<div class="level-head"><div class="hero-emoji">'+stop.emoji+'</div><div><h1 class="game-title"></h1><p class="hero-meta"></p><span class="level-pill">'+escapeHtml(pillText)+'</span></div></div>'+
    '<div class="level-pad">'+
      '<div class="approval-box '+(locked?'':status)+'"><span class="approval-emoji">'+(locked?'🔒':statusEmoji)+'</span><div><strong>'+escapeHtml(locked?'Locked':pillText)+'</strong><span>'+escapeHtml(locked?lockReason(index):statusCopy)+'</span></div></div>'+
      taskSection(1,'Intel — fun facts','','intel','<ul class="facts"></ul>')+
      taskSection(2,'Arrival photo','required','proof','<p class="hint">📸 Snap a photo of YOU at this stop!</p><input class="photo" type="file" accept="image/*" capture="environment"><img class="proof-preview hidden" alt="your photo"><p class="proofStatus"></p>')+
      taskSection(3,'Scavenger hunt','photo each one!','hunt-sec','<p class="hint">These are YOUR 5 targets — everyone gets different ones. Snap a photo of each!</p><div class="hunt"></div>')+
      taskSection(4,'<span class="game-name"></span>','arcade','arcade-sec','<p class="hint game-prompt"></p><div class="arcade"></div>')+
      taskSection(5,'Boss quiz','beat it!','quiz-sec','<p class="hint">Your questions — no copying, everyone gets different ones!</p><div class="quiz"></div><button class="btn btn-secondary check" type="button">Check answers</button><p class="quizResult"></p>')+
      '<div class="complete-row"><button class="btn btn-primary submit" type="button">🚩 Complete mission</button><span class="completeStatus"></span></div>'+
    '</div>';
  root.querySelector('h1').textContent=stop.title;
  root.querySelector('.hero-meta').textContent='Level '+(index+1)+' · '+stop.day+' · '+stop.loc;
  root.querySelector('.facts').innerHTML=stop.facts.map(f=>'<li>'+escapeHtml(f)+'</li>').join('');
  root.querySelector('.game-name').textContent='Arcade — 5 games';
  root.querySelector('.game-prompt').textContent='Pick a game below. Win any ONE to clear this objective — beat more for bonus points!';
  root.querySelector('.intel').classList.add('task-complete');

  els.levelBody.innerHTML='';els.levelBody.appendChild(root);
  renderProof(root,stop);renderHunt(root,stop);renderArcade(root,stop);renderQuiz(root,stop);refreshTaskTags(root,stop);

  const submit=root.querySelector('.submit'),cs=root.querySelector('.completeStatus');
  if(isAdmin())submit.classList.add('hidden');
  if(locked){submit.disabled=true;root.querySelectorAll('input,textarea,button,canvas').forEach(e=>{if(!e.classList.contains('submit'))e.disabled=true;});}
  if(status==='approved'){submit.disabled=true;submit.textContent='⭐ Mission cleared';}
  if(status==='pending'){submit.disabled=true;submit.textContent='🕵️ Being checked…';}
  submit.addEventListener('click',()=>submitStop(stop,index,cs,root));
}
function refreshTaskTags(root,stop){
  root.querySelector('.proof')?.classList.toggle('task-complete',Boolean(progress.photos[stop.id]?.dataUrl));
  const hp=progress.huntPhotos[stop.id]||{};
  root.querySelector('.hunt-sec')?.classList.toggle('task-complete',myHunt(stop).every((_,i)=>hp[i]?.dataUrl));
  root.querySelector('.arcade-sec')?.classList.toggle('task-complete',Boolean(progress.game[stop.id]?.complete));
  root.querySelector('.quiz-sec')?.classList.toggle('task-complete',Boolean(progress.quiz[stop.id]?.correct));
}

/* ---------- photo proof ---------- */
function renderProof(root,stop){
  const input=root.querySelector('.photo'),prev=root.querySelector('.proof-preview'),st=root.querySelector('.proofStatus');
  const saved=progress.photos[stop.id];
  if(saved?.dataUrl){prev.src=saved.dataUrl;prev.classList.remove('hidden');st.textContent='Photo locked in ✓';}
  input.addEventListener('change',async e=>{
    const file=e.target.files[0];if(!file)return;
    st.textContent='Saving…';
    try{const dataUrl=await imageToThumb(file,480,0.6);progress.photos[stop.id]={name:file.name,dataUrl};prev.src=dataUrl;prev.classList.remove('hidden');st.textContent='Photo locked in ✓';saveProgress();refreshTaskTags(root,stop);}
    catch{st.textContent='Could not read that image — try another.';}
  });
}

/* ---------- scavenger hunt: photo per item, per-player items ---------- */
function renderHunt(root,stop){
  const wrap=root.querySelector('.hunt');
  const items=myHunt(stop);
  const saved=progress.huntPhotos[stop.id]||{};
  items.forEach((item,i)=>{
    const box=document.createElement('div');
    box.className='hunt-item'+(saved[i]?.dataUrl?' done':'');
    box.innerHTML='<div class="hunt-item-head"><span class="hunt-check">'+(saved[i]?.dataUrl?'✓':(i+1))+'</span><span class="hunt-text"></span></div>'+
      '<input type="file" accept="image/*" capture="environment"><img class="hunt-thumb'+(saved[i]?.dataUrl?' show':'')+'" alt="">';
    box.querySelector('.hunt-text').textContent=item;
    const thumb=box.querySelector('.hunt-thumb');
    if(saved[i]?.dataUrl)thumb.src=saved[i].dataUrl;
    box.querySelector('input').addEventListener('change',async e=>{
      const file=e.target.files[0];if(!file)return;
      try{
        const dataUrl=await imageToThumb(file,300,0.55);
        progress.huntPhotos[stop.id]={...(progress.huntPhotos[stop.id]||{}),[i]:{dataUrl}};
        thumb.src=dataUrl;thumb.classList.add('show');box.classList.add('done');
        box.querySelector('.hunt-check').textContent='✓';
        saveProgress();refreshTaskTags(root,stop);
      }catch{box.querySelector('.hunt-check').textContent='!';}
    });
    wrap.appendChild(box);
  });
}

/* ============================================================
   ARCADE — 12 endless engines, 5 games per stop, lives & high scores
   Win the target in ANY game to clear the objective; extra wins = suggested bonus.
   ============================================================ */
const WIN_BONUS_PER_EXTRA=5;
/* Crisp SVG sprites (real art, not emoji) — always work offline */
const SPRITES={
SHIELD:'data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 110"><path d="M8 8h84v38c0 34-22 52-42 58C30 98 8 80 8 46Z" fill="#fff" stroke="#111" stroke-width="7"/><path d="M8 34h84" stroke="#111" stroke-width="6"/><text x="50" y="28" text-anchor="middle" font-family="Arial Black" font-size="17" font-weight="900" fill="#111">ROUTE</text><text x="50" y="86" text-anchor="middle" font-family="Arial Black" font-size="44" font-weight="900" fill="#111">66</text></svg>'),
HORSE:'data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="#3a2417" stroke-width="3" stroke-linejoin="round"><path d="M28 88c-3-18 0-34 10-44 8-8 10-16 9-24l14 10c9 2 17 8 21 17 3 8 3 17 1 25l-8-4c2 10 1 16-3 20H58c2-6 1-10-3-13-9 5-16 5-21 2 0 4 1 8 2 11z" fill="#8a5a33"/><path d="M47 20l6-12 8 14z" fill="#6f4526"/><path d="M52 34c10-1 19 4 24 13" fill="none"/></g><circle cx="63" cy="38" r="3.4" fill="#1c120b"/><path d="M40 47c-6 8-8 17-7 27" stroke="#5d3a1f" stroke-width="4" fill="none"/></svg>'),
CACTUS:'data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="#4f7a3a" stroke="#2f4d20" stroke-width="4"><rect x="42" y="18" width="16" height="70" rx="8"/><rect x="18" y="34" width="14" height="30" rx="7"/><rect x="24" y="52" width="20" height="12" rx="6"/><rect x="68" y="26" width="14" height="34" rx="7"/><rect x="56" y="46" width="20" height="12" rx="6"/></g></svg>')
};
function spriteEl(key,size){const im=new Image();im.src=SPRITES[key];im.width=size||44;im.height=size||44;im.className='sprite';return im;}
function isSprite(v){return typeof v==='string'&&SPRITES[v];}
function drawIcon(ctx,v,x,y,size,cache){
  if(isSprite(v)){let im=cache[v];if(!im){im=new Image();im.src=SPRITES[v];cache[v]=im;}
    if(im.complete)ctx.drawImage(im,x-size/2,y-size/2,size,size);return;}
  ctx.font=size+'px serif';ctx.textAlign='center';ctx.fillText(v,x,y+size*0.35);
}
/* per-stop game state */
function gameState(stopId){const g=progress.game[stopId];return (g&&g.perGame)?g:{perGame:{},complete:false};}
function gamesFor(stop){return stop.games.map(([t,n,o])=>({t,n,o:o||{}}));}
function winsCount(stop){const st=gameState(stop.id);return gamesFor(stop).filter((_,i)=>st.perGame[i]?.won).length;}
function reportScore(root,stop,gi,score,won){
  const st=gameState(stop.id);
  const cur=st.perGame[gi]||{best:0,won:false};
  st.perGame[gi]={best:Math.max(cur.best,score),won:cur.won||won};
  st.complete=Object.values(st.perGame).some(g=>g.won);
  progress.game[stop.id]=st;
  const gk=stop.id+'-'+gi;
  if(won&&!progress.chipGrant[gk]){progress.chipGrant[gk]=true;progress.chips=(progress.chips||0)+10;grantEarn(10);updateChips();syncPlayer();sfx('coin');bearShout('+10 chips! Come gamble them with me! 🐻🪙');setTimeout(maybeMysteryBox,1200);}
  saveProgress();refreshTaskTags(root,stop);
  const badge=root.querySelector('.gm-tab[data-gi="'+gi+'"] .gm-best');
  if(badge)badge.textContent=st.perGame[gi].best+(st.perGame[gi].won?' 🏆':'');
  if(won)burst(root.querySelector('.arcade'));
}
const TARGETS={runner:400,catch:15,whack:15,dodge:30,timing:5,tap:40,memory:2,simon:6,hl:5,reels:20,wheel:20,dice21:20};
const INSTR={runner:'Tap anywhere to start, tap to JUMP over obstacles. One crash ends the run — it gets faster!',
catch:'Tap to start, then SLIDE your finger to move the catcher. Catch the good stuff, avoid the bad. 3 lives!',
whack:'Tap any square to start. Tap the targets FAST when they pop up — don\u2019t tap decoys, don\u2019t let them escape. 3 lives!',
dodge:'Tap to start, SLIDE to dodge everything falling. It speeds up. 3 lives!',
timing:'Tap SNAP when the white marker is inside the gold zone. 3 misses and you\u2019re out — the zone shrinks!',
tap:'Tap the moving target as many times as you can in 30 seconds. Missing costs a second!',
memory:'Flip cards to find matching pairs. Clear the whole board before the timer — each round gets faster!',
simon:'Watch the pads light up, then repeat the sequence by tapping them in order. One wrong tap ends it!',
hl:'Guess if the next card is HIGHER or LOWER (2 low, Ace high). Build your streak — one wrong guess ends it!',
reels:'Tap SPIN (costs 1 chip). Match 2 symbols = +4, all 3 = JACKPOT +20. Run out = new stack.',
wheel:'Bet a chip on a colour: gold pays \u00d72 (likely), purple \u00d73, red \u00d75 (rare). Reach the goal!',
dice21:'Roll dice toward 21 without going bust, or STICK to beat the bank\u2019s roll. Hit exactly 21 = +8 chips!'};
function targetText(t,v){return {runner:'Score '+v,catch:'Catch '+v,whack:'Bop '+v,dodge:'Survive '+v+'s',timing:v+' perfect snaps',tap:v+' taps in 30s',memory:'Clear '+v+' rounds',simon:'Sequence of '+v,hl:'Streak of '+v,reels:'Reach '+v+' chips',wheel:'Reach '+v+' chips',dice21:'Reach '+v+' chips'}[t];}
function renderArcade(root,stop){
  const host=root.querySelector('.arcade');
  const games=gamesFor(stop);const st=gameState(stop.id);
  host.innerHTML='<p class="arcade-rule">🏆 Beat the goal in <b>ANY 1</b> of the 5 games to clear this objective. Every EXTRA game you beat = bonus points from the boss. Games are endless — chase the family high score!</p>'+
    '<div class="gm-tabs">'+games.map((g,i)=>'<button type="button" class="gm-tab" data-gi="'+i+'"><span class="gm-name">'+escapeHtml(g.n)+'</span><span class="gm-best">'+((st.perGame[i]?.best||0)+(st.perGame[i]?.won?' 🏆':''))+'</span></button>').join('')+'</div>'+
    '<div class="arcade-goal"></div><div class="arcade-stage"></div>';
  const stage=host.querySelector('.arcade-stage'),goal=host.querySelector('.arcade-goal');
  const engines={runner:egRunner,catch:egCatch,whack:egWhack,dodge:egDodge,timing:egTiming,tap:egTap,memory:egMemory,simon:egSimon,hl:egHL,reels:egReels,wheel:egWheel,dice21:egDice21};
  function open(i){
    stopGame();host.querySelectorAll('.gm-tab').forEach(b=>b.classList.toggle('active',+b.dataset.gi===i));
    const g=games[i];const target=g.o.target||TARGETS[g.t];
    goal.innerHTML='🎯 <b>'+targetText(g.t,target)+'</b> to win · endless after that!<br><span class="arcade-instr">📖 '+INSTR[g.t]+'</span>';
    stage.innerHTML='';
    activeGame=engines[g.t](stage,{...g.o,target,title:g.n},(score,won)=>reportScore(root,stop,i,score,won));
  }
  host.querySelectorAll('.gm-tab').forEach(b=>b.addEventListener('click',()=>open(+b.dataset.gi)));
  open(0);
}
/* helpers */
function makeCanvas(stage,h){const c=document.createElement('canvas');c.width=600;c.height=h||300;c.className='game-canvas';stage.appendChild(c);return c;}
function hudLine(stage){const d=document.createElement('div');d.className='game-hud';stage.prepend(d);return d;}
function hearts(n){return '❤️'.repeat(Math.max(0,n))+'🖤'.repeat(Math.max(0,3-n));}

/* 1 RUNNER — endless, crash = game over */
function egRunner(stage,g,report){
  const hud=hudLine(stage),c=makeCanvas(stage),ctx=c.getContext('2d'),cache={};
  let raf,run=false,y=0,vy=0,obs=[],score=0,speed=4.2,t=0,won=false;
  function frame(){
    t++;score++;if(t%70===0)speed+=0.15;
    if(t%Math.max(42,95-Math.floor(speed*7))===0)obs.push({x:640});
    vy+=0.7;y=Math.min(0,y+vy);if(y===0)vy=0;
    obs.forEach(o=>o.x-=speed);obs=obs.filter(o=>o.x>-40);
    for(const o of obs)if(Math.abs(o.x-90)<32&&y>-36)return over();
    ctx.clearRect(0,0,600,300);ctx.fillStyle='#f6b85f';ctx.fillRect(0,0,600,300);
    ctx.fillStyle='#241a22';ctx.fillRect(0,266,600,40);
    ctx.strokeStyle='#ffc24b';ctx.setLineDash([18,14]);ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(0,286);ctx.lineTo(600,286);ctx.stroke();ctx.setLineDash([]);
    drawIcon(ctx,g.p,90,240+y,42,cache);
    obs.forEach(o=>drawIcon(ctx,g.o,o.x,244,40,cache));
    if(!won&&score>=g.target){won=true;report(score,true);}
    hud.innerHTML='Score <b>'+score+'</b> · Speed '+speed.toFixed(1)+(won?' · 🏆':'');
    raf=requestAnimationFrame(frame);
  }
  function over(){run=false;cancelAnimationFrame(raf);report(score,won);
    ctx.fillStyle='rgba(36,26,34,.78)';ctx.fillRect(0,0,600,300);ctx.fillStyle='#ffc24b';ctx.textAlign='center';
    ctx.font='bold 30px sans-serif';ctx.fillText('💥 CRASH! Score '+score,300,140);ctx.font='bold 17px sans-serif';ctx.fillText('Tap to run again',300,175);}
  c.addEventListener('pointerdown',()=>{if(run){if(y===0)vy=-13.5;}else{y=0;vy=0;obs=[];score=0;speed=4.2;t=0;won=false;run=true;frame();}});
  ctx.fillStyle='#f6b85f';ctx.fillRect(0,0,600,300);ctx.fillStyle='#3a2417';ctx.font='bold 24px sans-serif';ctx.textAlign='center';ctx.fillText('Tap to start · tap to jump',300,150);
  hud.innerHTML='Endless run — how far can you get?';
  return {stop(){run=false;cancelAnimationFrame(raf);}};
}
/* 2 CATCH — 3 lives */
function egCatch(stage,g,report){
  const hud=hudLine(stage),c=makeCanvas(stage),ctx=c.getContext('2d'),cache={};
  let raf,run=false,items=[],caught=0,lives=3,bx=300,t=0,speed=1,won=false;
  function frame(){
    t++;if(t%36===0){const bad=Math.random()<0.3;const arr=bad?g.bad:g.good;items.push({x:40+Math.random()*520,y:-20,v:(2.1+Math.random()*2)*speed,e:arr[Math.floor(Math.random()*arr.length)],bad});}
    if(t%400===0)speed+=0.15;
    items.forEach(i=>i.y+=i.v);
    items=items.filter(i=>{
      if(i.y>232&&Math.abs(i.x-bx)<46){if(i.bad){lives--;}else caught++;return false;}
      if(i.y>=306){if(!i.bad)lives--;return false;}
      return true;});
    ctx.clearRect(0,0,600,300);ctx.fillStyle='#f6b85f';ctx.fillRect(0,0,600,300);
    ctx.fillStyle='#241a22';ctx.fillRect(0,272,600,28);
    items.forEach(i=>drawIcon(ctx,i.e,i.x,i.y,34,cache));
    drawIcon(ctx,g.catcher,bx,252,46,cache);
    if(!won&&caught>=g.target){won=true;report(caught,true);}
    hud.innerHTML='Caught <b>'+caught+'</b> · '+hearts(lives)+(won?' · 🏆':'');
    if(lives<=0)return over();
    raf=requestAnimationFrame(frame);
  }
  function over(){run=false;cancelAnimationFrame(raf);report(caught,won);
    ctx.fillStyle='rgba(36,26,34,.78)';ctx.fillRect(0,0,600,300);ctx.fillStyle='#ffc24b';ctx.textAlign='center';ctx.font='bold 30px sans-serif';ctx.fillText('Out of lives! '+caught+' caught',300,140);ctx.font='bold 17px sans-serif';ctx.fillText('Tap to play again',300,175);}
  c.addEventListener('pointermove',e=>{e.preventDefault();const r=c.getBoundingClientRect();bx=(e.clientX-r.left)*600/r.width;});
  c.addEventListener('pointerdown',e=>{e.preventDefault();try{c.setPointerCapture(e.pointerId);}catch(_){/**/}
    const r=c.getBoundingClientRect();bx=(e.clientX-r.left)*600/r.width;
    if(!run){items=[];caught=0;lives=3;t=0;speed=1;won=false;run=true;frame();}});
  c.addEventListener('touchmove',e=>e.preventDefault(),{passive:false});
  ctx.fillStyle='#f6b85f';ctx.fillRect(0,0,600,300);ctx.fillStyle='#3a2417';ctx.font='bold 24px sans-serif';ctx.textAlign='center';ctx.fillText('Tap to start · slide to catch · 3 lives',300,150);
  hud.innerHTML='Miss a good one or catch a bad one = lose a life!';
  return {stop(){run=false;cancelAnimationFrame(raf);}};
}
/* 3 WHACK — endless waves, speeds up, 3 misses */
function egWhack(stage,g,report){
  stage.innerHTML='<div class="game-hud"></div><div class="whack-grid"></div>';
  const hud=stage.querySelector('.game-hud'),grid=stage.querySelector('.whack-grid');
  const cells=[];for(let i=0;i<9;i++){const b=document.createElement('button');b.type='button';b.className='whack-cell';grid.appendChild(b);cells.push(b);}
  let score=0,lives=3,delay=850,popper=null,running=false,won=false,escapeTimer=null;
  function setCell(b,v){b.innerHTML='';if(isSprite(v))b.appendChild(spriteEl(v,46));else b.textContent=v;}
  function pop(){
    cells.forEach(x=>{x.innerHTML='';x.dataset.kind='';});
    clearTimeout(escapeTimer);
    const i=Math.floor(Math.random()*9),isMole=Math.random()<0.7;
    setCell(cells[i],isMole?g.mole:g.decoy);cells[i].dataset.kind=isMole?'mole':'decoy';
    if(isMole)escapeTimer=setTimeout(()=>{if(running&&cells[i].dataset.kind==='mole'){lives--;update();if(lives<=0)finish();}},delay*1.25);
    popper=setTimeout(pop,delay);
  }
  function update(){hud.innerHTML='Bopped <b>'+score+'</b> · '+hearts(lives)+(won?' · 🏆':'')+' · speed up!';}
  function start(){running=true;score=0;lives=3;delay=850;won=false;update();pop();}
  function finish(){running=false;clearTimeout(popper);clearTimeout(escapeTimer);cells.forEach(x=>{x.innerHTML='';x.dataset.kind='';});report(score,won);hud.innerHTML='💥 Game over — <b>'+score+'</b> bopped. Tap any square to retry.';}
  cells.forEach(b=>b.addEventListener('pointerdown',()=>{
    if(!running){start();return;}
    if(b.dataset.kind==='mole'){score++;b.classList.add('hit');setTimeout(()=>b.classList.remove('hit'),140);delay=Math.max(380,delay-14);
      if(!won&&score>=g.target){won=true;report(score,true);}
      clearTimeout(popper);clearTimeout(escapeTimer);pop();update();}
    else if(b.dataset.kind==='decoy'){lives--;update();if(lives<=0)finish();}
  }));
  hud.innerHTML='Tap any square to start · 3 lives · misses count!';
  return {stop(){clearTimeout(popper);clearTimeout(escapeTimer);running=false;}};
}
/* 4 DODGE — survive, one hit per life, endless */
function egDodge(stage,g,report){
  const hud=hudLine(stage),c=makeCanvas(stage),ctx=c.getContext('2d'),cache={};
  let raf,run=false,obs=[],px=300,secs=0,t=0,speed=1,lives=3,won=false;
  function frame(){
    t++;if(t%60===0){secs++;if(secs%10===0)speed+=0.25;}
    if(t%Math.max(16,34-Math.floor(speed*4))===0)obs.push({x:30+Math.random()*540,y:-20,v:(2.6+Math.random()*2.2)*speed});
    obs.forEach(o=>o.y+=o.v);
    obs=obs.filter(o=>{
      if(o.y>232&&o.y<286&&Math.abs(o.x-px)<38){lives--;return false;}
      return o.y<320;});
    ctx.clearRect(0,0,600,300);ctx.fillStyle='#f6b85f';ctx.fillRect(0,0,600,300);
    obs.forEach(o=>drawIcon(ctx,g.o,o.x,o.y,36,cache));
    drawIcon(ctx,g.p,px,258,44,cache);
    if(!won&&secs>=g.target){won=true;report(secs,true);}
    hud.innerHTML='Survived <b>'+secs+'s</b> · '+hearts(lives)+(won?' · 🏆':'');
    if(lives<=0)return over();
    raf=requestAnimationFrame(frame);
  }
  function over(){run=false;cancelAnimationFrame(raf);report(secs,won);
    ctx.fillStyle='rgba(36,26,34,.78)';ctx.fillRect(0,0,600,300);ctx.fillStyle='#ffc24b';ctx.textAlign='center';ctx.font='bold 30px sans-serif';ctx.fillText('💥 Survived '+secs+'s',300,140);ctx.font='bold 17px sans-serif';ctx.fillText('Tap to retry',300,175);}
  c.addEventListener('pointermove',e=>{e.preventDefault();const r=c.getBoundingClientRect();px=(e.clientX-r.left)*600/r.width;});
  c.addEventListener('pointerdown',e=>{e.preventDefault();try{c.setPointerCapture(e.pointerId);}catch(_){/**/}
    const r=c.getBoundingClientRect();px=(e.clientX-r.left)*600/r.width;
    if(!run){obs=[];secs=0;t=0;speed=1;lives=3;won=false;run=true;frame();}});
  c.addEventListener('touchmove',e=>e.preventDefault(),{passive:false});
  ctx.fillStyle='#f6b85f';ctx.fillRect(0,0,600,300);ctx.fillStyle='#3a2417';ctx.font='bold 24px sans-serif';ctx.textAlign='center';ctx.fillText('Tap to start · slide to dodge · 3 lives',300,150);
  hud.innerHTML='Dodge everything falling — it gets faster!';
  return {stop(){run=false;cancelAnimationFrame(raf);}};
}
/* 5 TIMING — endless, shrinking zone, 3 misses */
function egTiming(stage,g,report){
  stage.innerHTML='<div class="game-hud"></div><div class="time-bar"><div class="time-zone"></div><div class="time-marker"></div></div><button class="btn btn-primary time-btn" type="button">📸 SNAP!</button>';
  const hud=stage.querySelector('.game-hud'),marker=stage.querySelector('.time-marker'),zone=stage.querySelector('.time-zone'),btn=stage.querySelector('.time-btn');
  let pos=0,dir=1,hits=0,misses=0,speed=1.6,zw=20,zs=35,raf,running=true,won=false;
  function place(){zs=10+Math.random()*(88-zw);zone.style.left=zs+'%';zone.style.width=zw+'%';}
  function frame(){if(!running)return;pos+=dir*speed;if(pos>=100){pos=100;dir=-1;}if(pos<=0){pos=0;dir=1;}marker.style.left=pos+'%';raf=requestAnimationFrame(frame);}
  function update(){hud.innerHTML='Perfect snaps <b>'+hits+'</b> · '+hearts(3-misses)+(won?' · 🏆':'');}
  btn.addEventListener('click',()=>{
    if(!running){hits=0;misses=0;speed=1.6;zw=20;won=false;running=true;place();frame();update();btn.textContent='📸 SNAP!';return;}
    if(pos>=zs&&pos<=zs+zw){hits++;speed+=0.35;zw=Math.max(7,zw-1.2);place();
      if(!won&&hits>=g.target){won=true;report(hits,true);}}
    else misses++;
    update();
    if(misses>=3){running=false;cancelAnimationFrame(raf);report(hits,won);hud.innerHTML='💥 Out of film! <b>'+hits+'</b> perfect snaps.';btn.textContent='🔁 New roll of film';}
  });
  place();frame();update();
  return {stop(){running=false;cancelAnimationFrame(raf);}};
}
/* 6 TAP FRENZY — 30s rounds, moving shrinking target, misses cost time */
function egTap(stage,g,report){
  stage.innerHTML='<div class="game-hud"></div><div class="tap-arena"><button type="button" class="tap-target"></button></div>';
  const hud=stage.querySelector('.game-hud'),arena=stage.querySelector('.tap-arena'),tg=stage.querySelector('.tap-target');
  tg.textContent=g.t;let taps=0,timeLeft=30,timer=null,running=false,won=false,size=72;
  function move(){size=Math.max(40,size-0.6);tg.style.width=tg.style.height=size+'px';tg.style.left=(5+Math.random()*80)+'%';tg.style.top=(5+Math.random()*70)+'%';}
  function update(){hud.innerHTML='Taps <b>'+taps+'</b> · ⏱️ '+timeLeft+'s'+(won?' · 🏆':'');}
  function start(){running=true;taps=0;timeLeft=30;size=72;won=false;move();update();
    timer=setInterval(()=>{timeLeft--;update();if(timeLeft<=0){running=false;clearInterval(timer);report(taps,won);hud.innerHTML='⏱️ Time! <b>'+taps+'</b> taps. Tap target to retry.';}},1000);}
  tg.addEventListener('pointerdown',e=>{e.preventDefault();
    if(!running){start();return;}
    taps++;if(!won&&taps>=g.target){won=true;report(taps,true);}move();update();});
  arena.addEventListener('pointerdown',e=>{if(running&&e.target===arena){timeLeft=Math.max(1,timeLeft-1);update();}});
  hud.innerHTML='Tap the target to start · 30 seconds · missing costs a second!';move();
  return {stop(){clearInterval(timer);running=false;}};
}
/* 7 MEMORY — timed rounds, endless, faster each round */
function egMemory(stage,g,report){
  stage.innerHTML='<div class="game-hud"></div><div class="mem-grid"></div>';
  const hud=stage.querySelector('.game-hud'),grid=stage.querySelector('.mem-grid');
  let round=1,timeLeft=45,timer=null,open=[],lock=false,matched=0,running=false,won=false;
  function update(){hud.innerHTML='Round <b>'+round+'</b> · ⏱️ '+timeLeft+'s'+(won?' · 🏆':'');}
  function deal(){
    grid.innerHTML='';open=[];matched=0;lock=false;
    const icons=[...g.icons,...g.icons].sort(()=>Math.random()-0.5);
    icons.forEach(icon=>{const card=document.createElement('button');card.type='button';card.className='mem-card';
      card.innerHTML='<span class="mem-inner"><span class="mem-front">❓</span><span class="mem-back">'+icon+'</span></span>';card.dataset.icon=icon;
      card.addEventListener('click',()=>{
        if(!running){start();return;}
        if(lock||card.classList.contains('flip'))return;
        card.classList.add('flip');open.push(card);
        if(open.length===2){lock=true;const[a,b]=open;
          setTimeout(()=>{if(a.dataset.icon===b.dataset.icon){a.classList.add('matched');b.classList.add('matched');matched+=2;
              if(matched===icons.length){if(!won&&round>=g.target){won=true;report(round,true);}round++;timeLeft=Math.max(18,45-round*5);deal();update();}}
            else{a.classList.remove('flip');b.classList.remove('flip');}
            open=[];lock=false;},520);}
      });grid.appendChild(card);});
  }
  function start(){running=true;round=1;timeLeft=45;won=false;deal();update();
    timer=setInterval(()=>{timeLeft--;update();if(timeLeft<=0){running=false;clearInterval(timer);report(round-1,won);hud.innerHTML='⏱️ Time! Cleared <b>'+(round-1)+'</b> rounds. Tap a card to retry.';}},1000);}
  hud.innerHTML='Tap any card to start · clear the board before time runs out!';deal();
  return {stop(){clearInterval(timer);running=false;}};
}
/* 8 SIMON — repeat the growing light sequence */
function egSimon(stage,g,report){
  stage.innerHTML='<div class="game-hud"></div><div class="simon-grid">'+[0,1,2,3].map(i=>'<button type="button" class="simon-pad p'+i+'" data-i="'+i+'"></button>').join('')+'</div>';
  const hud=stage.querySelector('.game-hud'),pads=[...stage.querySelectorAll('.simon-pad')];
  let seq=[],pos=0,playing=false,running=false,won=false;
  function flash(i,d){return new Promise(res=>{pads[i].classList.add('lit');setTimeout(()=>{pads[i].classList.remove('lit');setTimeout(res,120);},d);});}
  async function playSeq(){playing=true;hud.innerHTML='👀 Watch… length <b>'+seq.length+'</b>'+(won?' · 🏆':'');
    for(const i of seq)await flash(i,Math.max(220,520-seq.length*30));
    playing=false;pos=0;hud.innerHTML='🫵 Your turn! Length <b>'+seq.length+'</b>'+(won?' · 🏆':'');}
  function next(){seq.push(Math.floor(Math.random()*4));playSeq();}
  function start(){running=true;won=false;seq=[];next();}
  pads.forEach(p=>p.addEventListener('pointerdown',async()=>{
    if(!running){start();return;}
    if(playing)return;
    const i=+p.dataset.i;flash(i,160);
    if(i===seq[pos]){pos++;
      if(pos===seq.length){if(!won&&seq.length>=g.target){won=true;report(seq.length,true);}setTimeout(next,650);}}
    else{running=false;report(seq.length-1,won);hud.innerHTML='💥 Wrong pad! You reached <b>'+(seq.length-1)+'</b>. Tap any pad to retry.';}
  }));
  hud.innerHTML='Tap any pad to start · repeat the light sequence!';
  return {stop(){running=false;}};
}
/* 9 HIGHER / LOWER — card streaks */
function egHL(stage,g,report){
  stage.innerHTML='<div class="game-hud"></div><div class="hl-card">?</div><div class="hl-btns"><button class="btn btn-primary" type="button" data-d="1">⬆️ Higher</button><button class="btn btn-secondary" type="button" data-d="-1">⬇️ Lower</button></div>';
  const hud=stage.querySelector('.game-hud'),card=stage.querySelector('.hl-card');
  let cur=draw(),streak=0,running=true,won=false;
  function draw(){return 2+Math.floor(Math.random()*11);}
  function label(n){return {11:'J',12:'Q',13:'A'}[n]||n;}
  function update(){card.textContent=label(cur);hud.innerHTML='Streak <b>'+streak+'</b>'+(won?' · 🏆':'')+' · cards run 2 → A';}
  stage.querySelectorAll('.hl-btns .btn').forEach(b=>b.addEventListener('click',()=>{
    if(!running){streak=0;cur=draw();running=true;won=false;update();return;}
    const d=+b.dataset.d;let nxt=draw();while(nxt===cur)nxt=draw();
    const ok=(d===1&&nxt>cur)||(d===-1&&nxt<cur);
    cur=nxt;
    if(ok){streak++;if(!won&&streak>=g.target){won=true;report(streak,true);}}
    else{running=false;report(streak,won);update();hud.innerHTML='💥 Busted at streak <b>'+streak+'</b>! It was '+label(nxt)+'. Tap a button to retry.';return;}
    update();
  }));
  update();
  return {stop(){running=false;}};
}
/* 10 REELS — chip-based slots: 10 chips, spin costs 1, match pays */
function egReels(stage,g,report){
  stage.innerHTML='<div class="game-hud"></div><div class="reels"></div><button class="btn btn-primary spin-btn" type="button">🎰 SPIN (1 chip)</button>';
  const hud=stage.querySelector('.game-hud'),wrap=stage.querySelector('.reels'),btn=stage.querySelector('.spin-btn');
  const reels=[];for(let r=0;r<3;r++){const el=document.createElement('div');el.className='reel';el.textContent='❔';wrap.appendChild(el);reels.push(el);}
  let chips=10,best=10,spinning=false,won=false;
  function update(msg){hud.innerHTML='🪙 Chips <b>'+chips+'</b>'+(won?' · 🏆':'')+(msg?' · '+msg:'');}
  btn.addEventListener('click',()=>{
    if(spinning)return;
    if(chips<=0){chips=10;best=Math.max(best,10);won=false;update('New stack of chips!');return;}
    chips--;spinning=true;update('Spinning…');
    let ticks=0;const iv=setInterval(()=>{reels.forEach(el=>el.textContent=g.icons[Math.floor(Math.random()*g.icons.length)]);
      if(++ticks>=14){clearInterval(iv);spinning=false;
        const v=reels.map(e=>e.textContent);
        if(v[0]===v[1]&&v[1]===v[2]){chips+=20;update('💎 JACKPOT +20!');burstNear(stage);}
        else if(v[0]===v[1]||v[1]===v[2]||v[0]===v[2]){chips+=4;update('Pair! +4');}
        else update('No match');
        best=Math.max(best,chips);
        if(!won&&chips>=g.target){won=true;report(best,true);}else report(best,won);
        if(chips<=0)update('Out of chips — tap SPIN for a new stack');
      }},90);
  });
  update('Start with 10 chips — reach '+g.target+'!');
  return {stop(){spinning=false;}};
}
/* 11 WHEEL — bet a chip on a colour */
function egWheel(stage,g,report){
  stage.innerHTML='<div class="game-hud"></div><div class="wheel-face">🎡</div><div class="hl-btns">'+
    '<button class="btn btn-primary" type="button" data-c="gold">🟡 Gold ×2</button>'+
    '<button class="btn btn-secondary" type="button" data-c="purple">🟣 Purple ×3</button>'+
    '<button class="btn btn-danger" type="button" data-c="red">🔴 Red ×5</button></div>';
  const hud=stage.querySelector('.game-hud'),face=stage.querySelector('.wheel-face');
  let chips=10,best=10,spinning=false,won=false;
  const POCKETS=['gold','gold','gold','purple','purple','red'];
  const FACE={gold:'🟡',purple:'🟣',red:'🔴'};
  function update(m){hud.innerHTML='🪙 Chips <b>'+chips+'</b>'+(won?' · 🏆':'')+(m?' · '+m:'');}
  stage.querySelectorAll('.hl-btns .btn').forEach(b=>b.addEventListener('click',()=>{
    if(spinning)return;
    if(chips<=0){chips=10;won=false;update('New stack!');return;}
    chips--;spinning=true;const pick=b.dataset.c;update('Spinning…');
    let ticks=0;const iv=setInterval(()=>{face.textContent=FACE[POCKETS[Math.floor(Math.random()*POCKETS.length)]];
      if(++ticks>=16){clearInterval(iv);spinning=false;
        const res=POCKETS[Math.floor(Math.random()*POCKETS.length)];face.textContent=FACE[res];
        if(res===pick){const pay={gold:2,purple:3,red:5}[pick];chips+=pay;update('🎉 '+res.toUpperCase()+'! +'+pay);}
        else update('Landed '+res);
        best=Math.max(best,chips);
        if(!won&&chips>=g.target){won=true;report(best,true);}else report(best,won);
      }},90);
  }));
  update('Bet 1 chip on a colour — reach '+g.target+'!');
  return {stop(){spinning=false;}};
}
/* 12 DICE 21 — twist or stick toward 21, chips */
function egDice21(stage,g,report){
  stage.innerHTML='<div class="game-hud"></div><div class="dice-row"></div><div class="hl-btns"><button class="btn btn-primary" type="button" data-a="hit">🎲 Roll</button><button class="btn btn-secondary" type="button" data-a="stick">✋ Stick</button></div>';
  const hud=stage.querySelector('.game-hud'),row=stage.querySelector('.dice-row');
  const DICE=['⚀','⚁','⚂','⚃','⚄','⚅'];
  let chips=10,best=10,total=0,inRound=false,won=false;
  function update(m){hud.innerHTML='🪙 Chips <b>'+chips+'</b> · Total <b>'+total+'</b>/21'+(won?' · 🏆':'')+(m?' · '+m:'');}
  function endRound(msg){inRound=false;total=0;best=Math.max(best,chips);
    if(!won&&chips>=g.target){won=true;report(best,true);}else report(best,won);
    update(msg);row.innerHTML+=' <b>'+msg+'</b>';}
  stage.querySelectorAll('.hl-btns .btn').forEach(b=>b.addEventListener('click',()=>{
    if(b.dataset.a==='hit'){
      if(!inRound){if(chips<=0){chips=10;won=false;update('New stack!');return;}chips--;total=0;row.innerHTML='';inRound=true;}
      const d=1+Math.floor(Math.random()*6);total+=d;row.innerHTML+='<span class="die">'+DICE[d-1]+'</span>';
      if(total===21){chips+=8;endRound('💎 21! +8 chips');}
      else if(total>21)endRound('💥 Bust!');
      else update('Roll again or stick?');
    }else if(inRound){
      const bank=1+Math.floor(Math.random()*6)+ (1+Math.floor(Math.random()*6));
      if(total>=bank&&total<=21){chips+=3;endRound('Beat the bank ('+bank+')! +3');}
      else endRound('Bank had '+bank+' — lost the chip');
    }
  }));
  update('1 chip per round · hit 21 for +8 · reach '+g.target+'!');
  return {stop(){inRound=false;}};
}
function burstNear(host){burst(host.closest('.task-block')||host);}
/* confetti burst */
function burst(host){
  const b=document.createElement('div');b.className='burst';
  for(let i=0;i<18;i++){const s=document.createElement('span');s.style.setProperty('--dx',(Math.random()*260-130)+'px');s.style.setProperty('--dy',(-80-Math.random()*160)+'px');s.style.setProperty('--c',['#ffc24b','#e8651f','#5b2a6b','#5f8a4a'][i%4]);s.style.animationDelay=(Math.random()*0.15)+'s';b.appendChild(s);}
  host.appendChild(b);setTimeout(()=>b.remove(),1600);
}

/* ---------- quiz (per-player questions) ---------- */
function renderQuiz(root,stop){
  const wrap=root.querySelector('.quiz'),res=root.querySelector('.quizResult');
  const quiz=myQuiz(stop);
  const saved=progress.quiz[stop.id]||{answers:{},checked:false,correct:false};
  quiz.forEach((q,i)=>{
    const block=document.createElement('div');block.className='question';
    const p=document.createElement('p');p.textContent=(i+1)+'. '+q[0];
    const opts=document.createElement('div');opts.className='options';
    (q[2]||['true','false']).forEach(val=>{
      const l=document.createElement('label'),inp=document.createElement('input'),sp=document.createElement('span');
      inp.type='radio';inp.name=stop.id+'-'+i;inp.value=val;inp.checked=saved.answers[i]===val;
      sp.textContent=val==='true'?'True':val==='false'?'False':val;
      inp.addEventListener('change',()=>{const cur=progress.quiz[stop.id]||{answers:{}};cur.answers[i]=val;cur.checked=false;cur.correct=false;progress.quiz[stop.id]=cur;saveProgress();});
      l.append(inp,sp);opts.appendChild(l);
    });
    block.append(p,opts);wrap.appendChild(block);
  });
  if(saved.checked)res.textContent=saved.correct?'Boss defeated! ✓':'Not quite — try again!';
  root.querySelector('.check').addEventListener('click',()=>{
    const cur=progress.quiz[stop.id]||{answers:{}};
    if(quiz.some((_,i)=>cur.answers[i]===undefined)){res.textContent='Answer every question first.';return;}
    const correct=quiz.every((q,i)=>cur.answers[i]===q[1]);
    progress.quiz[stop.id]={answers:cur.answers,checked:true,correct};saveProgress();
    res.textContent=correct?'Boss defeated! ✓':'Not quite — try again!';
    refreshTaskTags(root,stop);
  });
}

/* ---------- submit ---------- */
function validateStop(stop,index){
  if(!unlocked(index))return lockReason(index);
  if(session.test)return '';
  if(!progress.photos[stop.id]?.dataUrl)return '📸 Arrival photo needed first!';
  const hp=progress.huntPhotos[stop.id]||{};
  if(!myHunt(stop).every((_,i)=>hp[i]?.dataUrl))return 'Snap a photo for every scavenger target first.';
  if(!progress.game[stop.id]?.complete)return '🕹️ Win at least ONE arcade game first!';
  if(!progress.quiz[stop.id]?.checked)return 'Check the quiz answers first.';
  if(!progress.quiz[stop.id]?.correct)return 'Beat the boss quiz first.';
  return '';
}
function arcadeSummary(stop){const st=gameState(stop.id);const games=gamesFor(stop);
  return 'Games won '+winsCount(stop)+'/5 · '+games.map((g,i)=>g.n+': '+(st.perGame[i]?.best||0)+(st.perGame[i]?.won?'🏆':'')).join(' · ');}
function suggestedBonus(stop){return Math.min(25,Math.max(0,(winsCount(stop)-1))*WIN_BONUS_PER_EXTRA);}
async function submitStop(stop,index,cs,root){
  if(session.test){progress.completed[stop.id]=true;progress.points[stop.id]=SCORE_PER_STOP;saveProgress();burst(root);setTimeout(showHome,900);return;}
  const problem=validateStop(stop,index);
  if(problem){cs.textContent=problem;return;}
  const photo=progress.photos[stop.id]||{};
  const sub={id:session.username+'-'+stop.id+'-'+Date.now(),username:session.username,stopId:stop.id,stopTitle:stop.title,day:stop.day,hotel:stop.hotel,
    score:SCORE_PER_STOP,bonus:0,status:'pending',submittedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
    proofName:photo.name||'',proofImage:photo.dataUrl||'',activity:arcadeSummary(stop),chips:Number(progress.chips||0),playBonus:Number(progress.playBonus||0),suggestBonus:suggestedBonus(stop)};
  const i=shared.submissions.findIndex(x=>x.username===sub.username&&x.stopId===sub.stopId&&x.status==='pending');
  if(i>=0)shared.submissions[i]=sub;else shared.submissions.push(sub);
  saveShared();
  progress.submitted[stop.id]={id:sub.id,status:'pending'};saveProgress();
  cs.textContent='Mission sent to the boss! 🎉';burst(root);bearCelebrate('MISSION COMPLETE! Legend! 🏆');syncPlayer();
  await postRemote({action:'submit',submission:sub});
  setTimeout(showHome,900);
}

/* ---------- admin / leaderboard / reward ---------- */
function renderAdminPanel(){
  if(!isAdmin())return;
  const pending=shared.submissions.filter(i=>i.status==='pending');
  els.adminRows.innerHTML='';
  pending.forEach(item=>{
    const stop=stopById(item.stopId);
    const row=document.createElement('article');row.className='admin-row';
    row.innerHTML='<div><div class="admin-title"></div><div class="admin-meta"></div></div><div class="admin-photo"></div>'+
      '<div class="admin-controls"><label>Bonus <input class="bonus" type="number" min="0" max="25" step="5" value="0"></label>'+
      '<button class="btn btn-primary approve" type="button">Approve</button><button class="btn btn-danger reject" type="button">Reject</button></div>';
    row.querySelector('.admin-title').textContent=item.username+' — '+(stop?.title||item.stopTitle);
    row.querySelector('.admin-meta').textContent=(item.activity||'')+(item.proofImage?'':' · (no photo)')+(item.suggestBonus?' · suggested bonus: '+item.suggestBonus:'');
    if(item.suggestBonus)row.querySelector('.bonus').value=item.suggestBonus;
    if(item.proofImage){const img=document.createElement('img');img.src=item.proofImage;img.alt='proof';row.querySelector('.admin-photo').appendChild(img);}
    row.querySelector('.approve').addEventListener('click',()=>approveSubmission(item.id,row.querySelector('.bonus').value));
    row.querySelector('.reject').addEventListener('click',()=>rejectSubmission(item.id));
    els.adminRows.appendChild(row);
  });
  els.adminEmpty.classList.toggle('hidden',pending.length>0);
}
function chipStandings(){
  const latest=new Map();
  (shared.players||[]).forEach(p=>{if(p.username)latest.set(p.username,Number(p.chips||0));});
  [...shared.submissions].sort((a,b)=>timestamp(a.updatedAt)-timestamp(b.updatedAt)).forEach(i=>{if(i.username&&!latest.has(i.username))latest.set(i.username,Number(i.chips||0));});
  if(session&&!isAdmin()&&!session.test)latest.set(session.username,Number(progress.chips||0));
  return latest;
}
function renderChipChamp(){
  const el=document.getElementById('chipChamp');if(!el)return;
  const m=chipStandings();
  if(!m.size){el.textContent='🪙 Chip Champion: no chip counts reported yet.';return;}
  const rows=[...m.entries()].sort((a,b)=>b[1]-a[1]);
  const [name,chips]=rows[0];
  el.innerHTML='🪙 <b>Chip Champion: '+escapeHtml(name)+' ('+chips+' chips)</b> — wins an EXTRA $15 — the 30-second American shop dash (grab anything up to $15)! ('+rows.map(r=>escapeHtml(r[0])+': '+r[1]).join(' · ')+')';
}
function renderLeaderboard(){
  const chips=chipStandings();
  const m=new Map();PLAYER_NAMES.forEach(n=>m.set(n,{username:n,points:0,stops:0}));
  shared.submissions.forEach(i=>{if(i.status!=='approved')return;const r=m.get(i.username)||{username:i.username,points:0,stops:0};r.points+=scoreWithBonus(i);r.stops+=1;m.set(i.username,r);});
  const rows=[...m.values()].sort((a,b)=>b.points-a.points||a.username.localeCompare(b.username));
  els.leaderboardRows.innerHTML='';
  const pb=new Map();shared.submissions.forEach(i=>{pb.set(i.username,Math.max(pb.get(i.username)||0,Number(i.playBonus||0)));});
  rows.forEach(r=>r.points+=pb.get(r.username)||0);
  rows.sort((a,b)=>b.points-a.points||a.username.localeCompare(b.username));
  rows.forEach((r,i)=>{const tr=document.createElement('tr');tr.innerHTML='<td></td><td></td><td></td><td></td><td></td>';
    tr.children[0].textContent=i+1;tr.children[1].textContent=r.username;tr.children[2].textContent=r.points;tr.children[3].textContent=r.stops;tr.children[4].textContent=chips.get(r.username)??'—';
    els.leaderboardRows.appendChild(tr);});
  renderChipChamp();
  els.leaderboardEmpty.classList.toggle('hidden',rows.some(r=>r.points>0));
}
async function approveSubmission(id,bonus){
  const b=Math.max(0,Math.min(25,Number(bonus)||0));
  updateSub(id,{status:'approved',bonus:b,approvedAt:new Date().toISOString(),approvedBy:session.username,updatedAt:new Date().toISOString()});
  renderHome();await postRemote({action:'approve',id,bonus:b,approvedBy:session.username,adminKey:session.adminKey});
}
async function rejectSubmission(id){
  updateSub(id,{status:'rejected',approvedBy:session.username,updatedAt:new Date().toISOString()});
  renderHome();await postRemote({action:'reject',id,approvedBy:session.username,adminKey:session.adminKey});
}
function updateSub(id,u){const i=shared.submissions.findIndex(x=>x.id===id);if(i<0)return;shared.submissions[i]={...shared.submissions[i],...u};saveShared();}
function renderReward(){
  const done=!isAdmin()&&STOPS.every(s=>statusForStop(s.id)==='approved');
  els.amazonBtn.disabled=!done;
  els.rewardText.textContent=done?'You finished the whole road trip! Crack the vault! 🏆':'Clear every stop to crack the vault — $15 cash to spend in America!';
}

/* ---------- sync (Google Apps Script) ---------- */
async function syncShared(){
  if(!CONFIG.sheetEndpoint){loadShared();applySharedToProgress();renderHome();return;}
  try{const url=new URL(CONFIG.sheetEndpoint);url.searchParams.set('action','state');url.searchParams.set('t',Date.now());
    const r=await fetch(url.toString());shared=normaliseShared(await r.json());saveShared();}catch{loadShared();}
  applySharedToProgress();renderHome();syncPlayer();
}
async function postRemote(payload){
  if(!CONFIG.sheetEndpoint)return null;
  try{const r=await fetch(CONFIG.sheetEndpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)});
    const data=await r.json();if(data?.submissions){shared=normaliseShared(data);saveShared();}return data;}catch{return null;}
}
/* ===== API helpers for players + rooms ===== */
async function apiPost(payload){if(!CONFIG.sheetEndpoint)return null;try{const r=await fetch(CONFIG.sheetEndpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)});return await r.json();}catch(_){return null;}}
async function apiGet(params){if(!CONFIG.sheetEndpoint)return null;try{const u=new URL(CONFIG.sheetEndpoint);Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v));u.searchParams.set('t',Date.now());const r=await fetch(u.toString());return await r.json();}catch(_){return null;}}
/* push this player's live stats so admin sees them */
let _syncT=null;
function syncPlayer(){
  if(!session||isAdmin()||session.test||!CONFIG.sheetEndpoint)return;
  clearTimeout(_syncT);
  _syncT=setTimeout(()=>{
    const seasonTier=(typeof SEASON_REWARDS!=='undefined')?SEASON_REWARDS.filter(r=>totalEarned()>=r[0]).length:0;
    apiPost({action:'savePlayer',player:{
      username:session.username,
      points:playerPoints(session.username)+(progress.playBonus||0),
      chips:progress.chips||0,
      chipsEarned:progress.chipsEarned||0,
      seasonTier:seasonTier,
      stops:STOPS.filter(s=>statusForStop(s.id)==='approved').length,
      character:JSON.stringify((progress.char&&progress.char.equip)||{})
    }});
  },1500);
}
function normaliseShared(data){
  const c=freshShared();c.updatedAt=data?.updatedAt||null;c.players=Array.isArray(data?.players)?data.players:[];
  c.submissions=Array.isArray(data?.submissions)?data.submissions.map(i=>({
    id:String(i.id||i.ID||''),username:String(i.username||i.Username||''),stopId:String(i.stopId||i.StopID||''),
    stopTitle:String(i.stopTitle||i.StopTitle||''),day:String(i.day||i.Day||''),hotel:String(i.hotel||i.Hotel||''),
    score:Number(i.score||i.Score||SCORE_PER_STOP),bonus:Number(i.bonus||i.Bonus||0),status:String(i.status||i.Status||'pending').toLowerCase(),
    submittedAt:String(i.submittedAt||i.SubmittedAt||''),updatedAt:String(i.updatedAt||i.UpdatedAt||''),approvedAt:String(i.approvedAt||i.ApprovedAt||''),
    approvedBy:String(i.approvedBy||i.ApprovedBy||''),suggestBonus:Number(i.suggestBonus||i.SuggestBonus||0),chips:Number(i.chips||i.Chips||0),playBonus:Number(i.playBonus||i.PlayBonus||0),proofName:String(i.proofName||i.ProofName||''),proofImage:String(i.proofImage||i.ProofImage||''),activity:String(i.activity||i.Activity||'')
  })).filter(i=>i.id&&i.username&&i.stopId):[];
  return c;
}
function exportCsv(){
  const rows=[['ID','Username','Stop','Status','Score','Bonus','Notes']];
  shared.submissions.forEach(i=>rows.push([i.id,i.username,i.stopTitle,i.status,i.score,i.bonus,i.activity]));
  const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');
  const b=new Blob([csv],{type:'text/csv'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='route66-scores.csv';a.click();URL.revokeObjectURL(a.href);
}

/* ---------- image compression ---------- */
function imageToThumb(file,max,q){return new Promise((res,rej)=>{const rd=new FileReader();rd.onload=()=>{const im=new Image();im.onload=()=>{const sc=Math.min(1,(max||480)/Math.max(im.width,im.height));const c=document.createElement('canvas');c.width=Math.round(im.width*sc);c.height=Math.round(im.height*sc);c.getContext('2d').drawImage(im,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',q||0.6));};im.onerror=rej;im.src=rd.result;};rd.onerror=rej;rd.readAsDataURL(file);});}

/* ---------- auth / boot ---------- */
async function doLogin(name,password){
  if(name.trim().toLowerCase()==='test'){session={username:'test',role:'player',test:true};sessionStorage.setItem(STORAGE.session,JSON.stringify(session));await openSite();return true;}
  const acc=normalName(name);if(!acc)return false;
  const account=ACCOUNTS[acc];if(await sha256(password)!==account.hash)return false;
  session={username:acc,role:account.role,test:false};if(account.role==='admin')session.adminKey=password;
  sessionStorage.setItem(STORAGE.session,JSON.stringify(session));await openSite();return true;
}
async function openSite(){
  loadProgress();loadShared();
  els.login.classList.add('hidden');els.site.classList.remove('hidden');document.getElementById('cornerMascot')?.classList.remove('hidden');startBear();wireBear();
  showHome();
  if(countdownTimer)clearInterval(countdownTimer);
  countdownTimer=setInterval(renderCountdown,30000);
  setTimeout(()=>bearCelebrate(isAdmin()?'The boss has arrived! 👑':'WELCOME BACK, CHAMPION! 🎉'),700);checkStreak();document.getElementById('journey')?.classList.remove('hidden');
  await syncShared();
}
els.loginForm.addEventListener('submit',async e=>{e.preventDefault();els.loginError.textContent='';if(!await doLogin(els.username.value,els.password.value))els.loginError.textContent='Wrong name or password.';});
els.logoutBtn.addEventListener('click',()=>{sessionStorage.removeItem(STORAGE.session);session=null;stopGame();els.site.classList.add('hidden');els.login.classList.remove('hidden');document.getElementById('cornerMascot')?.classList.add('hidden');clearInterval(bearTimer);});
els.backBtn.addEventListener('click',showHome);
els.syncBtn.addEventListener('click',syncShared);
els.adminRefreshBtn.addEventListener('click',syncShared);
els.exportCsvBtn.addEventListener('click',exportCsv);
els.amazonBtn.addEventListener('click',()=>{if(!els.amazonBtn.disabled)jackpot(()=>els.voucher.classList.remove('hidden'));});
/* ===== 10-second Vegas JACKPOT sequence ===== */
function jackpot(done){
  if(document.querySelector('.jackpot'))return;
  const o=document.createElement('div');o.className='jackpot';
  o.innerHTML='<div class="jp-lights"></div>'+
    '<div class="jp-inner">'+
      '<div class="jp-reels"><span>7</span><span>7</span><span>7</span></div>'+
      '<div class="jp-title">JACKPOT!</div>'+
      '<div class="jp-sub">ROAD TRIP CHAMPION</div>'+
      '<div class="jp-count">$<b>0</b></div>'+
    '</div>';
  document.body.appendChild(o);sfx('jackpot');
  /* coin + confetti rain */
  const EM=['🪙','💰','⭐','💎','🎉','🍒','🔔'];
  const rain=setInterval(()=>{for(let i=0;i<6;i++){const s=document.createElement('span');s.className='jp-coin';s.textContent=EM[Math.floor(Math.random()*EM.length)];
    s.style.left=Math.random()*100+'vw';s.style.animationDuration=(1.6+Math.random()*1.8)+'s';s.style.fontSize=(1.2+Math.random()*2)+'rem';
    o.appendChild(s);setTimeout(()=>s.remove(),3600);}},130);
  /* money counter rolls up to 1,000,000 over ~6s... then reality hits */
  const cEl=o.querySelector('.jp-count b');const t0=Date.now();
  const count=setInterval(()=>{const p=Math.min(1,(Date.now()-t0)/6000);
    cEl.textContent=Math.floor(1000000*p*p).toLocaleString();
    if(p>=1){clearInterval(count);
      setTimeout(()=>{o.querySelector('.jp-count').classList.add('crash');cEl.textContent='15';
        o.querySelector('.jp-title').textContent='OK... $15';
        o.querySelector('.jp-sub').textContent='TO SPEND IN CALIFORNIA 🌴';
      },900);}
  },50);
  /* reels land one by one */
  const reels=[...o.querySelectorAll('.jp-reels span')];
  reels.forEach((r,i)=>{r.classList.add('spin');setTimeout(()=>{r.classList.remove('spin');r.classList.add('land');},900+i*800);});
  setTimeout(()=>o.querySelector('.jp-title').classList.add('show'),3400);
  setTimeout(()=>o.querySelector('.jp-sub').classList.add('show'),4100);
  /* end after 10s */
  setTimeout(()=>{clearInterval(rain);o.classList.add('out');setTimeout(()=>{o.remove();if(done)done();},600);},10000);
}
function updateChips(){const el=document.getElementById('hudChips');if(el)el.textContent=(progress.chips||0);const d=document.querySelector('.den-balance b');if(d)d.textContent=(progress.chips||0);const cc=document.getElementById('charChips');if(cc)cc.textContent=(progress.chips||0);}
function bearCelebrate(msg){
  const m=document.getElementById('cornerMascot');if(!m)return;
  m.classList.remove('mega');void m.offsetWidth; /* restart animation */
  m.classList.add('mega');setTimeout(()=>m.classList.remove('mega'),1900);
  if(msg)bearShout(msg);
}
function bearShout(msg){const b=document.getElementById('bearBubble');if(!b)return;b.textContent=msg;b.classList.add('show');clearTimeout(bearShout._t);bearShout._t=setTimeout(()=>b.classList.remove('show'),4200);}
/* talking bear mascot */
const BEAR_LINES=['Let\u2019s hit the road! \ud83d\udea6','Beat my high score\u2026 if you can!','Snap those photos! \ud83d\udcf8','Route 66, here we come!','I smell snacks\u2026 \ud83c\udf6b','Don\u2019t poke the burros!','Tap the glowing stop!','Grrreat driving, team!','Are we there yet? \ud83d\ude02','Watch out for meteors! \u2604\ufe0f','I bet Lily wins this one\u2026','Jacob, is that your best score?!','Bears LOVE scavenger hunts.','The Grand Canyon is GRRRAND.','Vegas lights, here I come! \ud83c\udfb0','Don\u2019t feed me\u2026 feed the leaderboard!','5 games per stop \u2014 beat them ALL!','Hannah\u2019s coming for first place!','Ethan built all this. Show off. \ud83d\ude0f','Photo of EVERY hunt item, no cheating!','My cousin lives at Bearizona!','Fastest paws in the West. \ud83d\udc3e','Bonus points for extra wins!','Horseshoe Bend \u2014 stay back from the edge!','I call shotgun! \ud83d\ude97','Winner gets\u2026 my respect. And points.','Simon says\u2026 tap faster!','Jackpot!! Oh wait, wrong game.','Stretch those tapping fingers!','11 hours on a plane? Wake me in LA.','TAP ME to visit my Bonus Den! \ud83c\udfb0','Feeling lucky? Tap me and find out!','My den. Your chips. One tap. \ud83d\udc3b','Double or nothing? Tap the bear!','I never lose at dice. Prove me wrong.','The wheel loves gold... usually.','Scared to gamble? Chicken! \ud83d\udc14','Win 10 chips every arcade game you beat!','House always wins. I AM the house.','All-in? You maniac. I respect it.','Psst\u2026 tap me. First flip\u2019s free-ish.','Chips buy glory, not sweets. Sorry.','A wise bear once said: one more spin.','Vegas rules: what happens in the den stays in the den.'];
let bearTimer=null,bearIdx=-1;
function bearSay(){const b=document.getElementById('bearBubble');if(!b)return;let i;do{i=Math.floor(Math.random()*BEAR_LINES.length);}while(i===bearIdx);bearIdx=i;b.textContent=BEAR_LINES[i];b.classList.add('show');setTimeout(()=>b.classList.remove('show'),4600);}
function wireBear(){const m=document.getElementById('cornerMascot');
  if(m&&!m.dataset.wired){m.dataset.wired='1';m.style.pointerEvents='auto';m.style.cursor='pointer';
    m.addEventListener('click',e=>{e.preventDefault();sfx('click');openDen();});
    if(!document.getElementById('bearAcc')){const a=document.createElement('span');a.id='bearAcc';a.className='bear-acc';m.appendChild(a);}}}
function startBear(){clearInterval(bearTimer);setTimeout(bearSay,800);bearTimer=setInterval(bearSay,5000);wireBear();}
/* ===== BEAR'S BONUS DEN — gamble your chips ===== */
let denWager=5;
function openDen(){
  if(isAdmin()){bearShout('Admins don\u2019t gamble. House rules!');return;}
  if(document.querySelector('.den'))return;
  const o=document.createElement('div');o.className='den';
  o.innerHTML='<div class="den-card">'+
    '<button type="button" class="den-close">\u2715</button>'+
    '<div class="den-head">\ud83d\udc3b BEAR\u2019S BONUS DEN</div>'+
    '<div class="den-balance">\ud83e\ude99 Chips: <b>'+(progress.chips||0)+'</b></div>'+
    '<div class="den-wager">Bet: '+[5,10,25].map(v=>'<button type="button" class="den-bet" data-v="'+v+'">'+v+'</button>').join('')+'<button type="button" class="den-bet" data-v="all">ALL IN</button></div>'+
    '<div class="den-games">'+
      '<div class="den-game"><h4>\ud83e\ude99 Coin Flip \u00d72</h4><div class="den-coin">?</div><div class="den-row"><button type="button" class="btn btn-primary den-flip" data-p="H">Heads</button><button type="button" class="btn btn-secondary den-flip" data-p="T">Tails</button></div></div>'+
      '<div class="den-game"><h4>\ud83c\udfb2 Beat the Bear \u00d72</h4><div class="den-dice"><span class="d-you">\u2680</span><span class="d-vs">vs</span><span class="d-bear">\u2680</span></div><div class="den-row"><button type="button" class="btn btn-primary den-roll">Roll!</button></div></div>'+
      '<div class="den-game"><h4>\ud83c\udfa1 Lucky Wheel</h4><div class="den-wheel">\ud83c\udfa1</div><div class="den-row"><button type="button" class="btn btn-primary den-spin" data-c="gold">\ud83d\udfe1 \u00d72</button><button type="button" class="btn btn-secondary den-spin" data-c="purple">\ud83d\udfe3 \u00d73</button><button type="button" class="btn btn-danger den-spin" data-c="red">\ud83d\udd34 \u00d75</button></div></div>'+
    '</div>'+
    '<p class="den-msg">Pick a bet, then play. Beat every arcade game for +10 chips each!</p>'+
    '<p class="den-instr">📖 HOW IT WORKS: choose your bet at the top, then tap a game. Win = your bet multiplied. Lose = bet gone. Ties give your bet back. MOST CHIPS AT THE END OF THE TRIP = EXTRA $15! (30-second shop dash — grab anything up to $15!)</p>'+
  '</div>';
  document.body.appendChild(o);
  const msg=o.querySelector('.den-msg');
  const bets=[...o.querySelectorAll('.den-bet')];
  function setBet(b){bets.forEach(x=>x.classList.toggle('on',x===b));denWager=b.dataset.v;}
  bets.forEach(b=>b.addEventListener('click',()=>setBet(b)));setBet(bets[0]);
  function stake(){const c=progress.chips||0;const w=denWager==='all'?c:Math.min(Number(denWager),c);
    if(w<=0){msg.textContent='No chips! Beat an arcade game (+10) and come back.';return 0;}
    return w;}
  function settle(win,w,mult,label){
    progress.chips=(progress.chips||0)-w+(win?w*mult:0);saveProgress();updateChips();syncPlayer();
    msg.textContent=win?('\ud83c\udf89 '+label+' You win '+(w*mult-w)+' chips!'):('\ud83d\udc80 '+label+' Lost '+w+' chips.');
    burst(o.querySelector('.den-card'));if(!win)o.querySelector('.den-card').classList.add('shake'),setTimeout(()=>o.querySelector('.den-card').classList.remove('shake'),400);
    if(win){sfx('win');bearCelebrate('NOO! My chips! 😭');}else{sfx('lose');bearShout('The house thanks you. 😏');}denReact(win);}
  /* coin flip */
  let busy=false;
  o.querySelectorAll('.den-flip').forEach(b=>b.addEventListener('click',()=>{
    if(busy)return;const w=stake();if(!w)return;busy=true;
    const coin=o.querySelector('.den-coin');coin.classList.add('flip');let t=0;
    const iv=setInterval(()=>{coin.textContent=Math.random()<0.5?'H':'T';if(++t>=12){clearInterval(iv);coin.classList.remove('flip');
      const res=Math.random()<0.5?'H':'T';coin.textContent=res;settle(res===b.dataset.p,w,2,'Coin says '+res+'.');busy=false;}},100);}));
  /* dice */
  const DIE=['\u2680','\u2681','\u2682','\u2683','\u2684','\u2685'];
  o.querySelector('.den-roll').addEventListener('click',()=>{
    if(busy)return;const w=stake();if(!w)return;busy=true;
    const y=o.querySelector('.d-you'),br=o.querySelector('.d-bear');let t=0;
    const iv=setInterval(()=>{y.textContent=DIE[Math.floor(Math.random()*6)];br.textContent=DIE[Math.floor(Math.random()*6)];
      if(++t>=10){clearInterval(iv);const a=1+Math.floor(Math.random()*6),b2=1+Math.floor(Math.random()*6);
        y.textContent=DIE[a-1];br.textContent=DIE[b2-1];
        if(a===b2){msg.textContent='Tie! Bet returned.';busy=false;return;}
        settle(a>b2,w,2,'You '+a+' vs Bear '+b2+'.');busy=false;}},90);});
  /* wheel: gold p=3/6 x2, purple 2/6 x3, red 1/6 x5 */
  const POCKETS=['gold','gold','gold','purple','purple','red'],FACE={gold:'\ud83d\udfe1',purple:'\ud83d\udfe3',red:'\ud83d\udd34'};
  o.querySelectorAll('.den-spin').forEach(b=>b.addEventListener('click',()=>{
    if(busy)return;const w=stake();if(!w)return;busy=true;
    const wh=o.querySelector('.den-wheel');let t=0;
    const iv=setInterval(()=>{wh.textContent=FACE[POCKETS[Math.floor(Math.random()*6)]];
      if(++t>=14){clearInterval(iv);const res=POCKETS[Math.floor(Math.random()*6)];wh.textContent=FACE[res];
        settle(res===b.dataset.c,w,{gold:2,purple:3,red:5}[b.dataset.c],'Landed '+res+'.');busy=false;}},90);}));
  o.querySelector('.den-close').addEventListener('click',()=>o.remove());
  o.addEventListener('click',e=>{if(e.target===o)o.remove();});
}
const pp=new URLSearchParams(location.search);
if(pp.get('preview')==='test'){session={username:'test',role:'player',test:true};sessionStorage.setItem(STORAGE.session,JSON.stringify(session));openSite();}
else{try{const s=JSON.parse(sessionStorage.getItem(STORAGE.session)||'null');if(s?.username){session=s;openSite();}}catch{}}

/* ================================================================
   HUB MODULE — Game Zone, Music, Postcards, Journey GPS, Streaks,
   Mystery Boxes, SFX, Bear moods/name, Ceremony, play-time points
   ================================================================ */
let BEAR_NAME='Buck';
const BEAR_NAMES=['Buck','Bruno','Nugget','Cactus Jack','Roadie','Sheriff Paws','Tumbleweed','Chips'];
function setBearName(n){BEAR_NAME=n;localStorage.setItem('r66-bearname',n);bearCelebrate('Call me '+n+'! 🐻');}
/* ---- SFX + haptics (34) ---- */
let muted=localStorage.getItem('r66-muted')==='1';let audioCtx=null;
function sfx(kind){
  if(muted)return;
  try{audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();
    const t=audioCtx.currentTime,o=audioCtx.createOscillator(),g=audioCtx.createGain();o.connect(g);g.connect(audioCtx.destination);
    const P={win:[[523,0],[659,.09],[784,.18],[1047,.27]],lose:[[300,0],[220,.12],[150,.24]],coin:[[988,0],[1319,.07]],click:[[600,0]],jackpot:[[523,0],[659,.1],[784,.2],[1047,.3],[1319,.4],[1568,.5]]}[kind]||[[440,0]];
    o.type='square';g.gain.setValueAtTime(.06,t);
    P.forEach(([f,d])=>o.frequency.setValueAtTime(f,t+d));
    g.gain.exponentialRampToValueAtTime(.001,t+(P[P.length-1][1]+.15));o.start(t);o.stop(t+P[P.length-1][1]+.2);
  }catch(_){/**/}
  try{if(navigator.vibrate){const V={win:[40,30,40],lose:[120],coin:[20],jackpot:[60,40,60,40,120]};navigator.vibrate(V[kind]||20);}}catch(_){/**/}
}
document.getElementById('muteBtn')?.addEventListener('click',()=>{muted=!muted;localStorage.setItem('r66-muted',muted?'1':'0');document.getElementById('muteBtn').textContent=muted?'🔇':'🔊';});
if(document.getElementById('muteBtn'))document.getElementById('muteBtn').textContent=muted?'🔇':'🔊';

/* ===== STORY CHAIN (12) — pass & play ===== */
const STORY_STARTS=['Buck the bear woke up in the back of the car and shouted...','At the Grand Canyon, Jacob leaned over the rail and suddenly...','The burro in Oatman ate Lily\u2019s hat and then...','In Las Vegas, the slot machine started flashing and out came...','Somewhere in the desert the car made a funny noise, so Dad...','A UFO landed right on Route 66 and asked the family for...'];
function hubStory(body){
  let lines=[],turn=0;
  const start=STORY_STARTS[Math.floor(Math.random()*STORY_STARTS.length)];lines.push(start);
  body.innerHTML='<div class="game-hud">📖 Add ONE sentence, then pass the phone. Tap READ to hear the whole tale!</div>'+
    '<div class="story-box"></div><textarea class="story-in" rows="2" placeholder="...and then..."></textarea>'+
    '<div class="den-row"><button class="btn btn-primary story-add" type="button">➕ Add & pass</button><button class="btn btn-secondary story-read" type="button">📢 Read it all</button></div>';
  const box=body.querySelector('.story-box'),inp=body.querySelector('.story-in');
  function paint(){box.innerHTML=lines.map((l,i)=>'<p'+(i===0?' class="story-first"':'')+'>'+escapeHtml(l)+'</p>').join('');box.scrollTop=box.scrollHeight;}
  paint();
  body.querySelector('.story-add').addEventListener('click',()=>{const t=inp.value.trim();if(!t)return;lines.push(t);inp.value='';turn++;paint();sfx('click');bearShout('Player '+(turn%4+1)+'\u2019s turn! Pass it on! 🐻');});
  body.querySelector('.story-read').addEventListener('click',()=>{paint();sfx('win');bearCelebrate('What a masterpiece! 📖✨');
    try{const u=new SpeechSynthesisUtterance(lines.join(' '));u.rate=.95;speechSynthesis.cancel();speechSynthesis.speak(u);}catch(_){/**/}});
}

/* ===== ACCENT ROULETTE (14) — 5 min timer ===== */
const ACCENTS=['🤠 Texan Cowboy','👑 Posh British','🏴\u200d☠️ Pirate','🤖 Robot','👽 Alien','🎬 Movie Trailer Voice','👶 Baby Talk','🦸 Superhero','🧛 Dracula','🎤 Rapper','🐨 Aussie','🍕 Italian Chef'];
function hubAccent(body){
  body.innerHTML='<div class="game-hud">🎭 Spin the wheel — everyone must talk in that accent for 5 minutes!</div>'+
    '<div class="accent-face">🎭</div><div class="accent-res"></div>'+
    '<div class="den-row"><button class="btn btn-primary accent-spin" type="button">🎡 SPIN</button></div>'+
    '<div class="accent-timer"></div>';
  const face=body.querySelector('.accent-face'),res=body.querySelector('.accent-res'),tEl=body.querySelector('.accent-timer');
  let spinning=false,acc=null;
  body.querySelector('.accent-spin').addEventListener('click',()=>{
    if(spinning)return;spinning=true;res.textContent='';let t=0;
    const iv=setInterval(()=>{acc=ACCENTS[Math.floor(Math.random()*ACCENTS.length)];face.textContent=acc.split(' ')[0];
      if(++t>=18){clearInterval(iv);spinning=false;res.textContent=acc;sfx('win');bearCelebrate('Do the '+acc.replace(/^\S+\s/,'')+' voice! 🎭');
        let left=300;tEl.textContent='⏱️ 5:00 left';const cd=setInterval(()=>{left--;tEl.textContent='⏱️ '+Math.floor(left/60)+':'+String(left%60).padStart(2,'0')+' left';
          if(left<=0){clearInterval(cd);tEl.textContent='✅ Time! You survived.';bearShout('You can talk normally now! 😅');}},1000);}
    },90);});
}

/* ===== DOODLE DUEL (1) — pass & play ===== */
const DOODLE_WORDS=['cactus','burro','Route 66 sign','Grand Canyon','slot machine','eagle','cowboy hat','meteor','red rock','canyon','petrol pump','diner','road trip car','sunglasses','tumbleweed','bear','dice','palm tree','suitcase','camera'];
function hubDoodle(body){
  const word=DOODLE_WORDS[Math.floor(Math.random()*DOODLE_WORDS.length)];
  body.innerHTML='<div class="game-hud">✏️ Drawer: peek at the word, draw it. Others guess out loud! Tap NEW for another.</div>'+
    '<div class="doodle-word">Tap to reveal word 👁️</div>'+
    '<canvas class="doodle-canvas" width="600" height="360"></canvas>'+
    '<div class="den-row"><button class="btn btn-secondary doodle-clear" type="button">🧹 Clear</button><button class="btn btn-primary doodle-new" type="button">🔄 New word</button></div>';
  const wEl=body.querySelector('.doodle-word'),c=body.querySelector('.doodle-canvas'),ctx=c.getContext('2d');
  let revealed=false,cur=word;
  ctx.fillStyle='#fff';ctx.fillRect(0,0,600,360);ctx.strokeStyle='#241a22';ctx.lineWidth=4;ctx.lineCap='round';ctx.lineJoin='round';
  wEl.addEventListener('click',()=>{revealed=!revealed;wEl.textContent=revealed?('✏️ Draw: '+cur):'Tap to reveal word 👁️';});
  let drawing=false;
  function pos(e){const r=c.getBoundingClientRect();return [(e.clientX-r.left)*600/r.width,(e.clientY-r.top)*360/r.height];}
  c.addEventListener('pointerdown',e=>{e.preventDefault();drawing=true;try{c.setPointerCapture(e.pointerId);}catch(_){}const[x,y]=pos(e);ctx.beginPath();ctx.moveTo(x,y);});
  c.addEventListener('pointermove',e=>{if(!drawing)return;e.preventDefault();const[x,y]=pos(e);ctx.lineTo(x,y);ctx.stroke();});
  c.addEventListener('pointerup',()=>drawing=false);c.addEventListener('pointerleave',()=>drawing=false);
  c.addEventListener('touchmove',e=>e.preventDefault(),{passive:false});
  body.querySelector('.doodle-clear').addEventListener('click',()=>{ctx.fillStyle='#fff';ctx.fillRect(0,0,600,360);});
  body.querySelector('.doodle-new').addEventListener('click',()=>{cur=DOODLE_WORDS[Math.floor(Math.random()*DOODLE_WORDS.length)];revealed=false;wEl.textContent='Tap to reveal word 👁️';ctx.fillStyle='#fff';ctx.fillRect(0,0,600,360);sfx('click');});
}

/* ===== INVESTING BOARD — tap the chip to invest ===== */
const MARKET=[
  {sym:'GOLD',name:'Gold',cg:null,base:2350,emoji:'🥇'},
  {sym:'SILVER',name:'Silver',cg:null,base:30,emoji:'🥈'},
  {sym:'OIL',name:'Crude Oil',cg:null,base:80,emoji:'🛢️'},
  {sym:'BTC',name:'Bitcoin',cg:'bitcoin',base:65000,emoji:'₿'},
  {sym:'ETH',name:'Ethereum',cg:'ethereum',base:3200,emoji:'💎'},
  {sym:'SPX',name:'S&P 500',cg:null,base:5400,emoji:'📈'},
  {sym:'TSLA',name:'Tesla',cg:null,base:250,emoji:'🚗'},
  {sym:'AMZN',name:'Amazon',cg:null,base:185,emoji:'📦'},
  {sym:'RKLB',name:'Rocket Lab',cg:null,base:8,emoji:'🚀'},
  {sym:'AAPL',name:'Apple',cg:null,base:220,emoji:'🍎'},
  {sym:'NVDA',name:'Nvidia',cg:null,base:125,emoji:'🎮'},
  {sym:'GOOG',name:'Google',cg:null,base:180,emoji:'🔍'},
  {sym:'MSFT',name:'Microsoft',cg:null,base:440,emoji:'🪟'},
  {sym:'NFLX',name:'Netflix',cg:null,base:680,emoji:'🍿'},
  {sym:'DIS',name:'Disney',cg:null,base:95,emoji:'🏰'},
  {sym:'MCD',name:'McDonald\u2019s',cg:null,base:290,emoji:'🍔'},
  {sym:'KO',name:'Coca-Cola',cg:null,base:63,emoji:'🥤'},
  {sym:'NKE',name:'Nike',cg:null,base:75,emoji:'👟'}
];
/* price = base * (1 + daily wiggle). Crypto pulled live from CoinGecko (free, no key); rest simulated with a seeded daily drift so it feels real and consistent within a day. */
function marketPrice(m){
  if(m.live)return m.live;
  const daySeed=seedFrom(m.sym+new Date().toDateString());
  const drift=(mulberry(daySeed)()-0.5)*0.12; // ±6% "today"
  return +(m.base*(1+drift)).toFixed(2);
}
async function refreshCrypto(){
  const ids=MARKET.filter(m=>m.cg).map(m=>m.cg).join(',');
  try{const r=await fetch('https://api.coingecko.com/api/v3/simple/price?ids='+ids+'&vs_currencies=usd');
    const d=await r.json();MARKET.forEach(m=>{if(m.cg&&d[m.cg])m.live=d[m.cg].usd;});return true;}catch(_){return false;}
}
function invPortfolio(){progress.invest=progress.invest||{};return progress.invest;}
function invValue(){const p=invPortfolio();return Object.entries(p).reduce((s,[sym,units])=>{const m=MARKET.find(x=>x.sym===sym);return s+(m?units*marketPrice(m):0);},0);}
function openInvest(){
  if(document.querySelector('.inv'))return;
  const o=document.createElement('div');o.className='inv';
  o.innerHTML='<div class="inv-card"><button class="inv-close" type="button">✕</button>'+
    '<div class="inv-head">📈 Buck\u2019s Trading Floor</div>'+
    '<div class="inv-bal">🪙 Chips: <b class="inv-chips">'+(progress.chips||0)+'</b> · Portfolio: <b class="inv-pv">0</b> chips</div>'+
    '<p class="inv-note">Invest chips in REAL markets. Crypto prices are LIVE; others use today\u2019s realistic estimate. Prices change daily — buy low, sell high! <b>This is pretend money for fun.</b></p>'+
    '<div class="inv-status"></div><div class="inv-list"></div></div>';
  document.body.appendChild(o);
  const list=o.querySelector('.inv-list'),status=o.querySelector('.inv-status');
  function paint(){
    o.querySelector('.inv-chips').textContent=(progress.chips||0);
    o.querySelector('.inv-pv').textContent=Math.round(invValue());
    const p=invPortfolio();
    list.innerHTML=MARKET.map(m=>{const price=marketPrice(m);const held=p[m.sym]||0;
      return '<div class="inv-row"><span class="inv-sym">'+m.emoji+' '+m.name+(m.live?' <i class="inv-live">LIVE</i>':'')+'</span>'+
        '<span class="inv-price">'+price.toLocaleString()+' ch</span>'+
        '<span class="inv-held">'+(held?held.toFixed(3)+' units':'—')+'</span>'+
        '<span class="inv-btns"><button class="inv-buy" data-s="'+m.sym+'">Buy 10</button><button class="inv-sell" data-s="'+m.sym+'" '+(held?'':'disabled')+'>Sell all</button></span></div>';
    }).join('');
    list.querySelectorAll('.inv-buy').forEach(b=>b.addEventListener('click',()=>{
      const m=MARKET.find(x=>x.sym===b.dataset.s),price=marketPrice(m),spend=10;
      if((progress.chips||0)<spend){status.textContent='Not enough chips! Win some first.';return;}
      progress.chips-=spend;p[m.sym]=(p[m.sym]||0)+spend/price;saveProgress();updateChips();paint();sfx('coin');status.textContent='Bought '+spend+' chips of '+m.name+'.';}));
    list.querySelectorAll('.inv-sell').forEach(b=>b.addEventListener('click',()=>{
      const m=MARKET.find(x=>x.sym===b.dataset.s),price=marketPrice(m),units=p[m.sym]||0;if(!units)return;
      const got=Math.round(units*price);progress.chips=(progress.chips||0)+got;delete p[m.sym];saveProgress();updateChips();paint();sfx('win');
      status.textContent='Sold '+m.name+' for '+got+' chips!';bearShout(got>0?'Cha-ching! 📈':'Oof, sold at a loss. 📉');}));
  }
  paint();status.textContent='Fetching live crypto prices…';
  refreshCrypto().then(ok=>{status.textContent=ok?'Live crypto prices loaded ✓':'Offline — using today\u2019s estimates.';paint();});
  o.querySelector('.inv-close').addEventListener('click',()=>o.remove());
  o.addEventListener('click',e=>{if(e.target===o)o.remove();});
}
/* make the HUD chip tappable */
document.addEventListener('click',e=>{const c=e.target.closest('.hud-chips');if(c&&!isAdmin()){openInvest();}});

/* ===== CHARACTER + ITEM SHOP + SEASON PASS ===== */
/* Items: id, name, price, category, and how they paint on the avatar. rarity sets the card colour. */
const SHOP_ITEMS=[
  /* skin tone (free base choices) */
  {id:'skin_light',cat:'Body',name:'Light',price:0,rar:'free',skin:'#f1c9a5'},
  {id:'skin_tan',cat:'Body',name:'Tan',price:0,rar:'free',skin:'#e0ac69'},
  {id:'skin_brown',cat:'Body',name:'Brown',price:0,rar:'free',skin:'#a56b46'},
  {id:'skin_deep',cat:'Body',name:'Deep',price:0,rar:'free',skin:'#7a4a2b'},
  /* hair */
  {id:'hair_short_brown',cat:'Hair',name:'Short Brown',price:0,rar:'free',hair:'#5a3a1a',hairstyle:'short'},
  {id:'hair_long_blonde',cat:'Hair',name:'Long Blonde',price:20,rar:'common',hair:'#e6c86a',hairstyle:'long'},
  {id:'hair_long_black',cat:'Hair',name:'Long Black',price:20,rar:'common',hair:'#1c1c22',hairstyle:'long'},
  {id:'hair_pony_red',cat:'Hair',name:'Red Ponytail',price:40,rar:'rare',hair:'#c0431a',hairstyle:'pony'},
  {id:'hair_bun_pink',cat:'Hair',name:'Pink Bun',price:60,rar:'rare',hair:'#e86fae',hairstyle:'bun'},
  {id:'hair_spike_blue',cat:'Hair',name:'Blue Spikes',price:80,rar:'epic',hair:'#3a7bd5',hairstyle:'spike'},
  {id:'hair_curly_purple',cat:'Hair',name:'Purple Curls',price:80,rar:'epic',hair:'#8a4d9e',hairstyle:'curly'},
  /* outfit / shirt */
  {id:'shirt_red',cat:'Outfit',name:'Red Tee',price:0,rar:'free',shirt:'#e0654f'},
  {id:'shirt_teal',cat:'Outfit',name:'Teal Tee',price:15,rar:'common',shirt:'#3aa79a'},
  {id:'shirt_dress_pink',cat:'Outfit',name:'Pink Dress',price:50,rar:'rare',shirt:'#e86fae',dress:true},
  {id:'shirt_dress_purple',cat:'Outfit',name:'Purple Dress',price:50,rar:'rare',shirt:'#8a4d9e',dress:true},
  {id:'shirt_hoodie',cat:'Outfit',name:'Cool Hoodie',price:60,rar:'rare',shirt:'#444a63',hood:true},
  {id:'shirt_denim',cat:'Outfit',name:'Denim Jacket',price:70,rar:'epic',shirt:'#5a7ba8'},
  {id:'shirt_gold',cat:'Outfit',name:'Golden Suit ✨',price:150,rar:'legendary',shirt:'#f0a830',glow:true},
  {id:'shirt_rainbow',cat:'Outfit',name:'Rainbow Tee 🌈',price:120,rar:'legendary',shirt:'rainbow'},
  /* hats */
  {id:'hat_none',cat:'Hat',name:'No Hat',price:0,rar:'free',hat:null},
  {id:'hat_cowboy',cat:'Hat',name:'Cowboy Hat',price:40,rar:'common',hat:'cowboy'},
  {id:'hat_cap',cat:'Hat',name:'Baseball Cap',price:30,rar:'common',hat:'cap'},
  {id:'hat_crown',cat:'Hat',name:'Golden Crown 👑',price:200,rar:'legendary',hat:'crown'},
  {id:'hat_bow',cat:'Hat',name:'Pink Bow',price:35,rar:'common',hat:'bow'},
  {id:'hat_party',cat:'Hat',name:'Party Hat',price:45,rar:'rare',hat:'party'},
  {id:'hat_beanie',cat:'Hat',name:'Beanie',price:35,rar:'common',hat:'beanie'},
  /* face / accessories */
  {id:'acc_none',cat:'Face',name:'None',price:0,rar:'free',acc:null},
  {id:'acc_sun',cat:'Face',name:'Sunglasses 😎',price:40,rar:'rare',acc:'sun'},
  {id:'acc_glasses',cat:'Face',name:'Round Glasses',price:25,rar:'common',acc:'glasses'},
  {id:'acc_star',cat:'Face',name:'Star Face Paint ⭐',price:55,rar:'rare',acc:'star'},
  {id:'acc_moustache',cat:'Face',name:'Silly Moustache',price:30,rar:'common',acc:'tache'},
  /* pets that float beside you */
  {id:'pet_none',cat:'Pet',name:'No Pet',price:0,rar:'free',pet:null},
  {id:'pet_burro',cat:'Pet',name:'Pet Burro 🫏',price:90,rar:'epic',pet:'🫏'},
  {id:'pet_eagle',cat:'Pet',name:'Pet Eagle 🦅',price:90,rar:'epic',pet:'🦅'},
  {id:'pet_lizard',cat:'Pet',name:'Pet Lizard 🦎',price:70,rar:'rare',pet:'🦎'},
  {id:'pet_ufo',cat:'Pet',name:'UFO Buddy 🛸',price:130,rar:'legendary',pet:'🛸'}
];
const SHOP_CATS=['Body','Hair','Outfit','Hat','Face','Pet'];
const RAR_LABEL={free:'FREE',common:'Common',rare:'Rare',epic:'Epic',legendary:'Legendary'};
function char(){progress.char=progress.char||{owned:{skin_light:1,hair_short_brown:1,shirt_red:1,hat_none:1,acc_none:1,pet_none:1},
  equip:{Body:'skin_light',Hair:'hair_short_brown',Outfit:'shirt_red',Hat:'hat_none',Face:'acc_none',Pet:'pet_none'}};return progress.char;}
function equipped(cat){const it=SHOP_ITEMS.find(i=>i.id===char().equip[cat]);return it||SHOP_ITEMS.find(i=>i.cat===cat);}
function avatarSVG(){
  const body=equippedView('Body'),hair=equippedView('Hair'),out=equippedView('Outfit'),hat=equippedView('Hat'),face=equippedView('Face'),pet=equippedView('Pet');
  const skin=body.skin||'#e0ac69';
  const shirtFill=out.shirt==='rainbow'?'url(#rainbowg)':(out.shirt||'#e0654f');
  let hairEl='';
  const hc=hair.hair||'#5a3a1a';
  if(hair.hairstyle==='short')hairEl='<path d="M58 44c0-20 64-20 64 0 0 6-4 8-4 8-2-14-54-14-56 0 0 0-4-2-4-8z" fill="'+hc+'"/>';
  else if(hair.hairstyle==='long')hairEl='<path d="M54 46c0-24 72-24 72 0v40c0 6-10 6-10 0V56c-2-12-50-12-52 0v30c0 6-10 6-10 0z" fill="'+hc+'"/>';
  else if(hair.hairstyle==='pony')hairEl='<path d="M58 44c0-20 64-20 64 0 0 6-4 8-4 8-2-14-54-14-56 0 0 0-4-2-4-8z" fill="'+hc+'"/><path d="M120 50c14 4 18 30 8 54-4-2-8-4-10-8 6-16 4-34-2-40z" fill="'+hc+'"/>';
  else if(hair.hairstyle==='bun')hairEl='<circle cx="90" cy="34" r="12" fill="'+hc+'"/><path d="M58 46c0-20 64-20 64 0 0 6-4 8-4 8-2-14-54-14-56 0z" fill="'+hc+'"/>';
  else if(hair.hairstyle==='spike')hairEl='<path d="M56 48l8-18 8 14 10-18 8 16 10-14 8 18 6-10v10c-2-10-62-10-64 0z" fill="'+hc+'"/>';
  else if(hair.hairstyle==='curly')hairEl='<g fill="'+hc+'"><circle cx="60" cy="44" r="10"/><circle cx="74" cy="36" r="11"/><circle cx="90" cy="33" r="11"/><circle cx="106" cy="36" r="11"/><circle cx="120" cy="44" r="10"/></g>';
  let hatEl='';
  if(hat.hat==='cowboy')hatEl='<g><ellipse cx="90" cy="40" rx="52" ry="10" fill="#8a5a33"/><path d="M66 40c0-22 48-22 48 0z" fill="#a56b3a"/></g>';
  else if(hat.hat==='cap')hatEl='<g><path d="M60 38c0-18 60-18 60 0z" fill="#e0654f"/><ellipse cx="128" cy="40" rx="20" ry="5" fill="#c1440e"/></g>';
  else if(hat.hat==='crown')hatEl='<path d="M62 36l8-18 10 12 10-16 10 16 10-12 8 18z" fill="#f0a830" stroke="#c1440e" stroke-width="2"/><circle cx="90" cy="22" r="4" fill="#e0654f"/>';
  else if(hat.hat==='bow')hatEl='<g fill="#e86fae"><path d="M80 34l-16-8v16z"/><path d="M100 34l16-8v16z"/><circle cx="90" cy="34" r="6"/></g>';
  else if(hat.hat==='party')hatEl='<path d="M90 12l16 30H74z" fill="#8a4d9e"/><circle cx="90" cy="12" r="5" fill="#f0a830"/>';
  else if(hat.hat==='beanie')hatEl='<path d="M60 42c0-24 60-24 60 0z" fill="#3aa79a"/><rect x="58" y="40" width="64" height="8" rx="4" fill="#2a7d72"/>';
  let faceEl='';
  if(face.acc==='sun')faceEl='<g fill="#241a22"><rect x="66" y="66" width="20" height="12" rx="4"/><rect x="94" y="66" width="20" height="12" rx="4"/><rect x="86" y="70" width="8" height="3"/></g>';
  else if(face.acc==='glasses')faceEl='<g fill="none" stroke="#241a22" stroke-width="3"><circle cx="76" cy="72" r="10"/><circle cx="104" cy="72" r="10"/><path d="M86 72h8"/></g>';
  else if(face.acc==='star')faceEl='<text x="72" y="60" font-size="16">⭐</text>';
  else if(face.acc==='tache')faceEl='<path d="M78 88c4-4 8-4 12 0 4-4 8-4 12 0-4 4-8 2-12-1-4 3-8 5-12 1z" fill="#3a2417"/>';
  const dress=out.dress?'<path d="M56 120l34-8 34 8-8 60H64z" fill="'+shirtFill+'"/>':'<rect x="60" y="112" width="60" height="60" rx="10" fill="'+shirtFill+'"/>';
  const glow=out.glow?'<circle cx="90" cy="150" r="70" fill="#f0a830" opacity=".18"/>':'';
  const petEl=pet.pet?'<text x="150" y="150" font-size="34">'+pet.pet+'</text>':'';
  return '<svg viewBox="0 0 200 210" width="100%" height="100%"><defs><linearGradient id="rainbowg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e0654f"/><stop offset=".3" stop-color="#f0a830"/><stop offset=".6" stop-color="#5f8a4a"/><stop offset="1" stop-color="#8a4d9e"/></linearGradient></defs>'+
    glow+petEl+
    dress+
    '<circle cx="90" cy="78" r="34" fill="'+skin+'"/>'+
    '<circle cx="80" cy="76" r="4" fill="#241a22"/><circle cx="100" cy="76" r="4" fill="#241a22"/>'+
    '<path d="M80 92c4 5 16 5 20 0" fill="none" stroke="#241a22" stroke-width="3" stroke-linecap="round"/>'+
    hairEl+faceEl+hatEl+'</svg>';
}
let previewItem=null; /* item being tried on but not owned */
/* 3D stage: idle spin + drag to rotate, Fortnite-locker style */
let charRot=0,charDrag=null,charIdle=null;
function wireCharStage(){
  const box=document.getElementById('charAvatar');if(!box||box.dataset.wired)return;box.dataset.wired='1';
  clearInterval(charIdle);
  charIdle=setInterval(()=>{if(charDrag===null){charRot+=0.35;applyCharRot();}},50);
  box.addEventListener('pointerdown',e=>{e.preventDefault();charDrag=e.clientX;try{box.setPointerCapture(e.pointerId);}catch(_){/**/}});
  box.addEventListener('pointermove',e=>{if(charDrag===null)return;charRot+=(e.clientX-charDrag)*0.6;charDrag=e.clientX;applyCharRot();});
  box.addEventListener('pointerup',()=>charDrag=null);
  box.addEventListener('pointerleave',()=>charDrag=null);
  box.addEventListener('touchmove',e=>e.preventDefault(),{passive:false});
}
function applyCharRot(){
  const box=document.getElementById('charAvatar');if(!box)return;
  const r=((charRot%360)+360)%360;
  const flip=(r>90&&r<270)?-1:1; /* fake 3D: mirror past the side */
  const squash=Math.abs(Math.cos(r*Math.PI/180));
  box.style.transform='perspective(700px) rotateY('+(r>90&&r<270?180-r:r>=270?r-360:r)*0.35+'deg) scaleX('+(0.4+0.6*squash)*flip+')';
}
function equippedView(cat){
  if(previewItem&&previewItem.cat===cat)return previewItem;
  return equipped(cat);
}
function playerTitle(){
  const t=totalEarned();
  return t>=1000?'🌟 66 MASTER':t>=500?'🏜️ Desert Legend':t>=200?'🛣️ Route Runner':'🚗 Rookie Roadtripper';
}
function renderCharacter(){
  const box=document.getElementById('charAvatar');
  if(box){box.innerHTML=avatarSVG();box.classList.toggle('previewing',!!previewItem);}
  const cc=document.getElementById('charChips');if(cc)cc.textContent=session&&session.test?'∞':(progress.chips||0);
  const nm=document.getElementById('charName');if(nm)nm.textContent=(session?session.username:'')+' · '+playerTitle();
  const bar=document.getElementById('charBuyBar');
  if(bar){
    if(previewItem){bar.classList.remove('hidden');
      bar.innerHTML='<span>Trying on: <b>'+previewItem.name+'</b></span>'+
        '<button type="button" class="btn btn-primary char-buy">🪙 Buy for '+previewItem.price+'</button>'+
        '<button type="button" class="btn btn-quiet char-cancel">Cancel</button>';
      bar.querySelector('.char-buy').addEventListener('click',()=>{const it=previewItem;previewItem=null;buyOrWear(it.id);});
      bar.querySelector('.char-cancel').addEventListener('click',()=>{previewItem=null;renderCharacter();renderShop();sfx('click');});
    } else bar.classList.add('hidden');
  }
}
let shopCat='Hair';
function renderShop(){
  const tabs=document.getElementById('shopTabs'),grid=document.getElementById('shopGrid');if(!tabs||!grid)return;
  tabs.innerHTML=SHOP_CATS.map(c=>'<button type="button" class="shop-tab'+(c===shopCat?' on':'')+'" data-c="'+c+'">'+c+'</button>').join('');
  tabs.querySelectorAll('.shop-tab').forEach(b=>b.addEventListener('click',()=>{shopCat=b.dataset.c;renderShop();}));
  const owned=char().owned,equip=char().equip;
  grid.innerHTML=SHOP_ITEMS.filter(i=>i.cat===shopCat).map(i=>{
    const have=owned[i.id],on=equip[i.cat]===i.id,pv=previewItem&&previewItem.id===i.id;
    return '<div class="shop-item rar-'+i.rar+(on?' equipped':'')+(pv?' previewing':'')+'">'+
      '<div class="shop-rar">'+RAR_LABEL[i.rar]+'</div>'+
      '<div class="shop-name">'+i.name+'</div>'+
      '<button type="button" class="shop-act" data-id="'+i.id+'">'+(on?'Wearing ✓':have?'Wear':(i.price>0?('👀 Try · 🪙 '+i.price):'Wear'))+'</button></div>';
  }).join('');
  grid.querySelectorAll('.shop-act').forEach(b=>b.addEventListener('click',()=>tryOrWear(b.dataset.id)));
}
function tryOrWear(id){
  const it=SHOP_ITEMS.find(i=>i.id===id);if(!it)return;const c=char();
  if(c.owned[id]){previewItem=null;c.equip[it.cat]=id;saveProgress();renderCharacter();renderShop();syncPlayer();sfx('click');return;}
  /* not owned: try it on first — SEE it before you buy */
  previewItem=it;renderCharacter();renderShop();sfx('click');
  bearShout('Looking good! Buy it or keep browsing. 🐻');
}
function buyOrWear(id){
  const it=SHOP_ITEMS.find(i=>i.id===id);if(!it)return;const c=char();
  if(!c.owned[id]){
    if(!(session&&session.test)&&(progress.chips||0)<it.price){bearShout('Not enough chips! Go win some. 🐻');previewItem=null;renderCharacter();renderShop();return;}
    if(it.price>0 && !confirm('Spend '+it.price+' chips on '+it.name+'?\n\nRemember: chips can win you REAL money (the £15 shop dash) — spend them on outfits only if you\u2019re sure!')) {previewItem=null;renderCharacter();renderShop();return;}
    if(!(session&&session.test))progress.chips-=it.price;
    c.owned[id]=1;sfx('coin');bearCelebrate('Nice '+it.name+'! Looking good! 🐻');
  }
  c.equip[it.cat]=id;saveProgress();updateChips();renderCharacter();renderShop();syncPlayer();sfx('click');
}
/* ===== SEASON PASS (28) — driven by TOTAL chips ever earned ===== */
const SEASON_REWARDS=[
  [50,'🪙 +10 bonus chips','chips',10],[100,'🎩 Free Beanie','item','hat_beanie'],[150,'🪙 +15 chips','chips',15],
  [200,'😎 Free Sunglasses','item','acc_sun'],[250,'🪙 +20 chips','chips',20],[300,'🤠 Free Cowboy Hat','item','hat_cowboy'],
  [400,'🪙 +25 chips','chips',25],[500,'🦎 Free Pet Lizard','item','pet_lizard'],[650,'🪙 +40 chips','chips',40],
  [800,'🌈 Rainbow Tee','item','shirt_rainbow'],[1000,'👑 Golden Crown','item','hat_crown'],[1500,'✨ Golden Suit','item','shirt_gold']
];
function totalEarned(){return progress.chipsEarned||0;}
function grantEarn(n){progress.chipsEarned=(progress.chipsEarned||0)+n;checkSeason();}
function checkSeason(){
  const t=totalEarned();progress.seasonClaimed=progress.seasonClaimed||[];
  SEASON_REWARDS.forEach((r,idx)=>{
    if(t>=r[0]&&!progress.seasonClaimed.includes(idx)){
      progress.seasonClaimed.push(idx);
      if(r[2]==='chips'){progress.chips=(progress.chips||0)+r[3];}
      else if(r[2]==='item'){char().owned[r[3]]=1;}
      saveProgress();updateChips();setTimeout(()=>bearCelebrate('🎟️ Season tier '+(idx+1)+'! Unlocked: '+r[1]),1500);
    }
  });
}
function renderSeason(){
  const track=document.getElementById('seasonTrack'),lbl=document.getElementById('seasonTierLbl');if(!track)return;
  const t=totalEarned(),claimed=progress.seasonClaimed||[];
  const tier=SEASON_REWARDS.filter(r=>t>=r[0]).length;
  if(lbl)lbl.textContent='Tier '+tier+' / '+SEASON_REWARDS.length+' · '+t+' chips earned';
  track.innerHTML=SEASON_REWARDS.map((r,idx)=>{const done=t>=r[0];
    return '<div class="season-node'+(done?' done':'')+'"><div class="season-req">'+r[0]+'</div><div class="season-rew">'+r[1]+'</div></div>';
  }).join('');
}
/* ============================================================
   ONLINE MULTIPLAYER — room codes, everyone on own device
   Host is authoritative: host owns the questions & scoring,
   others poll and submit answers. Works for Rush + Heist.
   ============================================================ */
function roomCode(){let s='';for(let i=0;i<4;i++)s+='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*31)];return s;}
let mpPoll=null,mpHostLoop=null;
function mpStop(){clearInterval(mpPoll);clearInterval(mpHostLoop);mpPoll=null;mpHostLoop=null;}

/* entry: choose Online or Pass-and-play */
function mpChooser(body,game,localFn){
  mpStop();
  const title=game==='rush'?'⚡ ROUTE RUSH':'🕵️ ROUTE HEIST';
  if(!CONFIG.sheetEndpoint){
    body.innerHTML='<div class="mp-turn">'+title+'</div><p class="hub-earn">🌐 Online play needs the backend connected (ask Ethan). Playing pass-and-play instead!</p>';
    setTimeout(()=>localFn(body),1400);return;
  }
  body.innerHTML='<div class="mp-turn">'+title+'</div>'+
    '<div class="mp-choose">'+
      '<button class="btn btn-primary mp-online" type="button">🌐 Online Room<span>everyone on their own device</span></button>'+
      '<button class="btn btn-secondary mp-local" type="button">📱 Pass & Play<span>share one phone</span></button>'+
    '</div>';
  body.querySelector('.mp-local').addEventListener('click',()=>localFn(body));
  body.querySelector('.mp-online').addEventListener('click',()=>mpLobby(body,game));
}

/* lobby: create or join */
function mpLobby(body,game){
  const me=session.test?'Guest'+Math.floor(Math.random()*99):session.username;
  body.innerHTML='<div class="mp-turn">🌐 Online '+(game==='rush'?'Route Rush':'Route Heist')+'</div>'+
    '<div class="mp-lobby">'+
      '<button class="btn btn-primary mp-host" type="button">➕ Create Room</button>'+
      '<div class="mp-join-row"><input class="mp-code-in" placeholder="CODE" maxlength="4" style="text-transform:uppercase"><button class="btn btn-secondary mp-join" type="button">Join</button></div>'+
    '</div><p class="mp-lobby-msg"></p>';
  const msg=body.querySelector('.mp-lobby-msg');
  body.querySelector('.mp-host').addEventListener('click',async()=>{
    const code=roomCode();msg.textContent='Creating room…';
    const r=await roomCreate(code,game,me);
    if(!r||!r.ok){msg.textContent='Could not reach server. Try pass & play.';return;}
    mpRoom(body,game,code,me,true);
  });
  body.querySelector('.mp-join').addEventListener('click',async()=>{
    const code=(body.querySelector('.mp-code-in').value||'').toUpperCase().trim();
    if(code.length<4){msg.textContent='Enter the 4-letter code.';return;}
    msg.textContent='Joining…';const r=await roomJoin(code,me);
    if(!r||!r.ok||!r.room){msg.textContent='Room not found — check the code.';return;}
    mpRoom(body,game,code,me,false);
  });
}
function roomCreate(code,game,host){return apiPost({action:'roomCreate',code,game,host});}
function roomJoin(code,name){return apiPost({action:'roomJoin',code,name});}
function roomWrite(code,state){return apiPost({action:'roomWrite',code,state});}
function roomAnswer(code,name,answer,round){return apiPost({action:'roomAnswer',code,name,answer,round});}
function roomPoll(code){return apiGet({action:'room',code});}

/* the live room */
function mpRoom(body,game,code,me,isHost){
  mpStop();
  const bank=questionBank();
  let last=0;
  function render(st){
    if(!st)return;
    if(st.phase==='lobby'){
      body.innerHTML='<div class="mp-turn">Room <b class="mp-code">'+code+'</b></div>'+
        '<p class="hub-earn">Share this code! Players join on their own phones.</p>'+
        '<div class="mp-players">'+st.players.map(p=>'<span class="mp-chip">'+escapeHtml(p)+(p===st.host?' 👑':'')+'</span>').join('')+'</div>'+
        (isHost?'<button class="btn btn-primary mp-start" type="button">▶️ Start ('+st.players.length+' in)</button>':'<p class="mp-wait">Waiting for host to start…</p>');
      const sb=body.querySelector('.mp-start');if(sb)sb.addEventListener('click',()=>hostNext(st,true));
    }else if(st.phase==='question'){
      const Q=st.question;const answered=st.answers&&st.answers[me]&&st.answers[me].r===st.round;
      body.innerHTML='<div class="mp-scores">'+st.players.map(p=>escapeHtml(p)+': <b>'+(st.scores[p]||0)+'</b>').join(' · ')+'</div>'+
        '<div class="mp-q">Q'+st.round+': '+escapeHtml(Q.q)+'</div>'+
        (answered?'<p class="mp-wait">✅ Answer locked — waiting for others…</p>':
          '<div class="mp-opts">'+Q.opts.map(o=>'<button type="button" class="btn btn-quiet mp-opt">'+escapeHtml(o)+'</button>').join('')+'</div>');
      body.querySelectorAll('.mp-opt').forEach(b=>b.addEventListener('click',()=>{roomAnswer(code,me,b.textContent,st.round);sfx('click');b.parentNode.innerHTML='<p class="mp-wait">✅ Locked in!</p>';}));
    }else if(st.phase==='reveal'){
      body.innerHTML='<div class="mp-turn">Answer: <b>'+escapeHtml(st.question.a)+'</b></div>'+
        '<div class="mp-scores">'+rankScores(st).map((p,i)=>(i===0?'🥇 ':'')+escapeHtml(p[0])+': <b>'+p[1]+'</b>').join('<br>')+'</div>'+
        (isHost?'<button class="btn btn-primary mp-next" type="button">Next ▶️</button>':'<p class="mp-wait">Next question soon…</p>');
      const nb=body.querySelector('.mp-next');if(nb)nb.addEventListener('click',()=>hostNext(st,false));
    }else if(st.phase==='done'){
      mpStop();const rank=rankScores(st);
      body.innerHTML='<div class="mp-turn">🏆 WINNER: '+escapeHtml(rank[0][0])+'!</div>'+
        '<div class="mp-scores">'+rank.map((p,i)=>['🥇','🥈','🥉'][i]||('#'+(i+1))+' '+escapeHtml(p[0])+': <b>'+p[1]+'</b>').map((s,idx)=>['🥇','🥈','🥉'][idx]?s+' '+escapeHtml(rank[idx][0])+': <b>'+rank[idx][1]+'</b>':s).join('<br>')+'</div>'+
        '<button class="btn btn-primary" type="button" onclick="showView(\'gamesView\')">Back to games</button>';
      sfx('jackpot');bearCelebrate('GG! '+rank[0][0]+' takes it! 🏆');
    }
  }
  function rankScores(st){return st.players.map(p=>[p,st.scores[p]||0]).sort((a,b)=>b[1]-a[1]);}
  /* host advances the game */
  function hostNext(st,first){
    if(first){st.round=0;st.scores={};st.players.forEach(p=>st.scores[p]=0);}
    st.round++;
    if(st.round>Math.max(6,st.players.length*4)){st.phase='done';roomWrite(code,st);return;}
    const Q=bank[(seedFrom(code+st.round))%bank.length];
    st.question={q:Q.q,opts:[...Q.opts].sort(()=>Math.random()-0.5),a:Q.a};
    st.answers={};st.phase='question';st.qStart=Date.now();
    roomWrite(code,st);
  }
  /* host scoring loop */
  if(isHost){
    mpHostLoop=setInterval(async()=>{
      const r=await roomPoll(code);const st=r&&r.room;if(!st)return;
      if(st.phase==='question'){
        const ans=st.answers||{};const inRound=st.players.filter(p=>ans[p]&&ans[p].r===st.round);
        const timeUp=Date.now()-(st.qStart||0)>20000;
        if(inRound.length>=st.players.length||timeUp){
          st.players.forEach(p=>{if(ans[p]&&ans[p].r===st.round&&ans[p].a===st.question.a)st.scores[p]=(st.scores[p]||0)+100;});
          st.phase='reveal';roomWrite(code,st);
        }
      }
    },1800);
  }
  /* everyone polls to render */
  mpPoll=setInterval(async()=>{
    const r=await roomPoll(code);if(r&&r.room){if(r.room.updatedAt!==last){last=r.room.updatedAt;render(r.room);}}
  },1600);
  roomPoll(code).then(r=>render(r&&r.room));
}

/* ---- view switching ---- */
const VIEWS=['homeView','gamesView','musicView','postView','charView'];
function showView(id){
  stopGame();stopHeadsUp();if(typeof mpStop==='function')mpStop();
  document.getElementById('levelView').classList.add('hidden');
  VIEWS.forEach(v=>document.getElementById(v)?.classList.toggle('hidden',v!==id));
  document.querySelectorAll('.vtab').forEach(b=>b.classList.toggle('active',b.dataset.view===id));
  if(id==='gamesView')renderHub();
  if(id==='postView')renderPostcards();
  if(id==='charView'){renderCharacter();renderShop();renderSeason();wireCharStage();}
  if(id==='homeView')renderHome();
  window.scrollTo(0,0);
}
document.querySelectorAll('.vtab').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));

/* ---- play-time points: 5 min in Game Zone = +5 points ---- */
setInterval(()=>{
  if(!session||isAdmin())return;
  const gv=document.getElementById('gamesView');
  if(!gv||gv.classList.contains('hidden')||document.visibilityState!=='visible')return;
  progress.playSecs=(progress.playSecs||0)+1;
  if(progress.playSecs%300===0){progress.playBonus=(progress.playBonus||0)+5;sfx('coin');bearCelebrate('+5 points for playing! Keep going! ⏱️');updateHUDPoints();}
  const pc=document.getElementById('playClock');
  if(pc){const s=progress.playSecs%300;pc.textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0')+' → next +5';}
  if(progress.playSecs%15===0)saveProgress();
},1000);
function updateHUDPoints(){if(els.hudScore&&session&&!isAdmin())els.hudScore.textContent=playerPoints(session.username)+(progress.playBonus||0);}

/* ---- streaks (20) ---- */
function checkStreak(){
  if(!session||isAdmin()||session.test)return;
  const today=new Date().toDateString(),last=progress.lastDay;
  if(last===today)return;
  const yest=new Date(Date.now()-86400000).toDateString();
  progress.streak=(last===yest)?(progress.streak||0)+1:1;
  progress.lastDay=today;
  const bonus=Math.min(25,progress.streak*5);
  progress.chips=(progress.chips||0)+bonus;saveProgress();updateChips();
  setTimeout(()=>bearCelebrate('🔥 Day '+progress.streak+' streak! +'+bonus+' chips!'),2600);
}

/* ---- mystery boxes (22): every 3rd first-win ---- */
function maybeMysteryBox(){
  const wins=Object.keys(progress.chipGrant||{}).length;
  if(wins===0||wins%3!==0)return;
  if(progress.lastBoxAt===wins)return;
  progress.lastBoxAt=wins;saveProgress();
  openMysteryBox();
}
function openMysteryBox(){
  if(document.querySelector('.mbox'))return;
  sfx('jackpot');
  const o=document.createElement('div');o.className='mbox';
  o.innerHTML='<div class="mbox-card"><div class="mbox-title">🎁 MYSTERY BOX TIME!</div><p>Pick ONE box… it could be glorious. Or not.</p><div class="mbox-row">'+
    [0,1,2].map(i=>'<button type="button" class="mbox-box" data-i="'+i+'">🎁</button>').join('')+'</div><p class="mbox-msg"></p></div>';
  document.body.appendChild(o);
  const prizes=[['+25 chips!',25],['+50 CHIPS!! 💎',50],['-10 chips… ouch',-10],['+15 chips',15],['+5 points! 🌟','pts']];
  o.querySelectorAll('.mbox-box').forEach(b=>b.addEventListener('click',()=>{
    if(o.dataset.done)return;o.dataset.done='1';
    const p=prizes[Math.floor(Math.random()*prizes.length)];
    b.textContent='📦';b.classList.add('open');
    o.querySelector('.mbox-msg').textContent=p[0];
    if(p[1]==='pts'){progress.playBonus=(progress.playBonus||0)+5;updateHUDPoints();}
    else{progress.chips=Math.max(0,(progress.chips||0)+p[1]);updateChips();}
    saveProgress();sfx(p[1]==='pts'||p[1]>0?'win':'lose');burst(o.querySelector('.mbox-card'));
    setTimeout(()=>o.remove(),2200);
  }));
}

/* ---- GAME ZONE hub (9,11,13 + Heads Up + multiplayer) ---- */
const HUB_GAMES=[
  {id:'breaker',n:'🧱 Route Breaker',d:'Smash the bricks — classic breaker!'},
  {id:'roadle',n:'🟩 Roadle',d:'Wordle, road-trip edition. 6 guesses!'},
  {id:'ttt',n:'⭕ Tic-Tac-Bear',d:'Beat '+BEAR_NAME+' at noughts & crosses. He talks trash.'},
  {id:'headsup',n:'🙆 Heads Up!',d:'Phone on forehead — family shouts clues! (landscape)'},
  {id:'rush',n:'⚡ Route Rush',d:'MULTIPLAYER quiz battle! 2-4 players, pass the phone.'},
  {id:'heist',n:'🕵️ Route Heist',d:'MULTIPLAYER! Answer, then MINE, HACK or SHIELD.'},
  {id:'story',n:'📖 Story Chain',d:'Pass the phone — build a mad road-trip story together!'},
  {id:'accent',n:'🎭 Accent Roulette',d:'Spin for a silly accent to use for 5 minutes!'},
  {id:'doodle',n:'✏️ Doodle Duel',d:'One draws, the rest guess. Pass-and-play!'},
];
function renderHub(){
  const grid=document.getElementById('hubGrid');if(!grid)return;
  document.getElementById('hubStage').classList.add('hidden');grid.classList.remove('hidden');
  grid.innerHTML=HUB_GAMES.map(g=>'<button type="button" class="hub-card" data-g="'+g.id+'"><span class="hub-name">'+g.n+'</span><span class="hub-desc">'+g.d+'</span></button>').join('');
  grid.querySelectorAll('.hub-card').forEach(b=>b.addEventListener('click',()=>openHubGame(b.dataset.g)));
}
document.getElementById('hubBack')?.addEventListener('click',()=>{stopGame();stopHeadsUp();if(typeof mpStop==='function')mpStop();renderHub();});
function openHubGame(id){
  stopGame();sfx('click');
  document.getElementById('hubGrid').classList.add('hidden');
  const st=document.getElementById('hubStage');st.classList.remove('hidden');
  const body=document.getElementById('hubBody');body.innerHTML='';
  const dispatch={breaker:hubBreaker,roadle:hubRoadle,ttt:hubTTT,headsup:hubHeadsUp,story:hubStory,accent:hubAccent,doodle:hubDoodle,rush:b=>mpChooser(b,'rush',hubRush),heist:b=>mpChooser(b,'heist',hubHeist)};dispatch[id](body);
  window.scrollTo(0,0);
}
/* --- Brick breaker (9) --- */
function hubBreaker(body){
  body.innerHTML='<div class="game-hud"></div>';
  const hud=body.querySelector('.game-hud'),c=makeCanvas(body,340),ctx=c.getContext('2d');
  let raf,run=false,px=300,bx=300,by=300,vx=3.4,vy=-3.4,lives=3,score=0,bricks=[];
  const COLS=['#e8651f','#f0a830','#5b2a6b','#5f8a4a','#a8331a'];
  function deal(){bricks=[];for(let r=0;r<5;r++)for(let col=0;col<8;col++)bricks.push({x:14+col*72,y:30+r*26,w:64,h:20,c:COLS[r],hit:false});}
  function frame(){
    bx+=vx;by+=vy;
    if(bx<8||bx>592)vx=-vx;if(by<8)vy=-vy;
    if(by>310&&Math.abs(bx-px)<52&&vy>0){vy=-Math.abs(vy)*1.02;vx+=(bx-px)/14;sfx('click');}
    if(by>345){lives--;sfx('lose');if(lives<=0)return over();bx=px;by=300;vx=3.4;vy=-3.4;}
    bricks.forEach(k=>{if(!k.hit&&bx>k.x&&bx<k.x+k.w&&by>k.y&&by<k.y+k.h){k.hit=true;vy=-vy;score+=10;sfx('coin');}});
    if(bricks.every(k=>k.hit)){deal();vy*=1.15;score+=50;}
    ctx.clearRect(0,0,600,340);ctx.fillStyle='#241a22';ctx.fillRect(0,0,600,340);
    bricks.forEach(k=>{if(k.hit)return;ctx.fillStyle=k.c;ctx.fillRect(k.x,k.y,k.w,k.h);});
    ctx.fillStyle='#ffc24b';ctx.beginPath();ctx.arc(bx,by,8,0,7);ctx.fill();
    ctx.fillStyle='#fff';ctx.fillRect(px-52,318,104,12);
    hud.innerHTML='Score <b>'+score+'</b> · '+hearts(lives)+' · 📖 Slide to move the paddle, don\u2019t drop the ball!';
    raf=requestAnimationFrame(frame);
  }
  function over(){run=false;cancelAnimationFrame(raf);ctx.fillStyle='rgba(0,0,0,.7)';ctx.fillRect(0,0,600,340);ctx.fillStyle='#ffc24b';ctx.font='bold 30px sans-serif';ctx.textAlign='center';ctx.fillText('Game over! '+score,300,160);ctx.font='bold 16px sans-serif';ctx.fillText('Tap to play again',300,195);}
  c.addEventListener('pointermove',e=>{e.preventDefault();const r=c.getBoundingClientRect();px=(e.clientX-r.left)*600/r.width;});
  c.addEventListener('pointerdown',e=>{e.preventDefault();try{c.setPointerCapture(e.pointerId);}catch(_){/**/}
    const r=c.getBoundingClientRect();px=(e.clientX-r.left)*600/r.width;
    if(!run){deal();lives=3;score=0;bx=px;by=300;vx=3.4;vy=-3.4;run=true;frame();}});
  c.addEventListener('touchmove',e=>e.preventDefault(),{passive:false});
  ctx.fillStyle='#241a22';ctx.fillRect(0,0,600,340);ctx.fillStyle='#ffc24b';ctx.font='bold 24px sans-serif';ctx.textAlign='center';ctx.fillText('Tap to start!',300,170);
  hud.textContent='📖 Slide to move the paddle. 3 lives. Clear the wall — it refills faster!';
  activeGame={stop(){run=false;cancelAnimationFrame(raf);}};
}
/* --- Roadle (11) --- */
const ROADLE_WORDS=['ROUTE','MOTEL','DINER','TRUCK','DRIVE','RIVER','TRAIL','PLANE','VEGAS','MILES','STONE','DUNES','EAGLE','HORSE','BISON','CABIN','LIGHT','PHOTO','QUEST','PRIZE','CHIPS','WHEEL','POKER','SLOTS','HOTEL','SUITE','PALMS','SNAKE','ROCKS','CACTI'];
function hubRoadle(body){
  const word=ROADLE_WORDS[Math.floor(Math.random()*ROADLE_WORDS.length)];
  let row=0,cur='';
  body.innerHTML='<div class="game-hud">📖 Guess the 5-letter road-trip word. 🟩 right spot · 🟨 wrong spot · ⬛ not in word.</div>'+
    '<div class="roadle-grid">'+Array.from({length:30},(_,i)=>'<span class="rl-cell" data-i="'+i+'"></span>').join('')+'</div>'+
    '<div class="roadle-keys">'+['QWERTYUIOP','ASDFGHJKL','⏎ZXCVBNM⌫'].map(r=>'<div class="rl-row">'+[...r].map(k=>'<button type="button" class="rl-key" data-k="'+k+'">'+k+'</button>').join('')+'</div>').join('')+'</div><p class="game-hud rl-msg"></p>';
  const cells=[...body.querySelectorAll('.rl-cell')],msg=body.querySelector('.rl-msg');
  function paint(){for(let i=0;i<5;i++)cells[row*5+i].textContent=cur[i]||'';}
  function submit(){
    if(cur.length!==5){msg.textContent='Need 5 letters!';return;}
    const g=cur,target=[...word];let marks=Array(5).fill('b');
    for(let i=0;i<5;i++)if(g[i]===word[i]){marks[i]='g';target[i]=null;}
    for(let i=0;i<5;i++)if(marks[i]==='b'){const j=target.indexOf(g[i]);if(j>-1){marks[i]='y';target[j]=null;}}
    for(let i=0;i<5;i++){const cell=cells[row*5+i];cell.classList.add(marks[i]==='g'?'rl-g':marks[i]==='y'?'rl-y':'rl-b');
      const key=body.querySelector('.rl-key[data-k="'+g[i]+'"]');if(key&&marks[i]==='g')key.classList.add('rl-g');else if(key&&marks[i]==='y'&&!key.classList.contains('rl-g'))key.classList.add('rl-y');else if(key&&!key.classList.contains('rl-g')&&!key.classList.contains('rl-y'))key.classList.add('rl-b');}
    if(g===word){msg.textContent='🏆 '+word+'! Legend!';sfx('win');burst(body);return done();}
    row++;cur='';
    if(row>=6){msg.textContent='💀 It was '+word+'. Tap ⏎ for a new word.';sfx('lose');done();}
  }
  let finished=false;function done(){finished=true;}
  body.querySelectorAll('.rl-key').forEach(k=>k.addEventListener('click',()=>{
    if(finished){hubRoadle(body);return;}
    const v=k.dataset.k;sfx('click');
    if(v==='⏎')return submit();
    if(v==='⌫'){cur=cur.slice(0,-1);paint();return;}
    if(cur.length<5){cur+=v;paint();}
  }));
  activeGame={stop(){}};
}
/* --- Tic-Tac-Bear (13) --- */
function hubTTT(body){
  const TRASH=['Too easy. 🐻','Is that your best move?!','I\u2019ve seen burros play better.','*yawns*','Bold. Wrong, but bold.','My grandma bear plays faster.','You fell for it!','Delicious. Like honey.'];
  const WIN=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  let cells=Array(9).fill(''),over=false;
  body.innerHTML='<div class="game-hud">📖 You are ❌. Beat '+BEAR_NAME+' the bear (🐻). He WILL trash talk.</div><div class="ttt-grid">'+Array.from({length:9},(_,i)=>'<button type="button" class="ttt-cell" data-i="'+i+'"></button>').join('')+'</div><p class="game-hud ttt-msg">Your move!</p><button type="button" class="btn btn-secondary ttt-reset">New game</button>';
  const msg=body.querySelector('.ttt-msg'),els9=[...body.querySelectorAll('.ttt-cell')];
  function winner(b){for(const[a,c,d]of WIN)if(b[a]&&b[a]===b[c]&&b[c]===b[d])return b[a];return b.every(x=>x)?'tie':null;}
  function bearMove(){
    const empty=cells.map((v,i)=>v?null:i).filter(v=>v!==null);
    let pick=null;
    for(const i of empty){const t=[...cells];t[i]='🐻';if(winner(t)==='🐻'){pick=i;break;}}
    if(pick===null)for(const i of empty){const t=[...cells];t[i]='❌';if(winner(t)==='❌'){pick=i;break;}}
    if(pick===null)pick=empty.includes(4)?4:empty[Math.floor(Math.random()*empty.length)];
    cells[pick]='🐻';els9[pick].textContent='🐻';
    bearShout(TRASH[Math.floor(Math.random()*TRASH.length)]);
  }
  function check(){const w=winner(cells);if(!w)return false;over=true;
    msg.textContent=w==='❌'?'🏆 YOU BEAT THE BEAR!':w==='🐻'?'🐻 '+BEAR_NAME+' wins. Obviously.':'🤝 Tie!';
    if(w==='❌'){sfx('win');burst(body);bearShout('WHAT?! Rematch. NOW.');}else if(w==='🐻'){sfx('lose');bearCelebrate('Told you. 😎');}
    return true;}
  els9.forEach(b=>b.addEventListener('click',()=>{
    const i=+b.dataset.i;if(over||cells[i])return;
    cells[i]='❌';b.textContent='❌';sfx('click');
    if(check())return;bearMove();check();
  }));
  body.querySelector('.ttt-reset').addEventListener('click',()=>hubTTT(body));
  activeGame={stop(){}};
}
/* --- Heads Up (custom) --- */
const HEADSUP_DECKS={
  '🐻 Animals':['Bear','Donkey','Rattlesnake','Eagle','Bison','Coyote','Scorpion','Squirrel','Wolf','Elk','Lizard','Roadrunner','Fox','Deer','Bat','Owl'],
  '🗺️ Our Trip':['Grand Canyon','Las Vegas','Route 66','Monument Valley','Heathrow','The hire car','Antelope Canyon','Horseshoe Bend','Meteor Crater','Bearizona','Hotel breakfast','Forrest Gump','Hollywood','Motel','Cactus','Airport security'],
  '🎬 Act It Out':['Driving a car','Taking a selfie','Cowboy','Sleeping in the car','Airplane taking off','Slot machine','Eating a burger','Sunburn','Packing a suitcase','Riding a donkey','Hiking','Taking a photo','Car sick','Jet lag','Swimming','Karaoke'],
  '🍔 Food':['Burger','Pancakes','Hot dog','Milkshake','Ice cream','Fries','Pizza','Tacos','Donut','BBQ ribs','Root beer','S\u2019mores','Corn dog','Waffles','Bacon','Pretzel'],
};
let headsUpTimer=null;
function stopHeadsUp(){clearInterval(headsUpTimer);headsUpTimer=null;document.querySelector('.hu-full')?.remove();}
function hubHeadsUp(body){
  body.innerHTML='<div class="game-hud">📖 Pick a deck → hold the phone on your FOREHEAD (landscape!). Family describes the word — tap GREEN if you guess it, RED to pass. 90 seconds!</div>'+
    '<div class="hu-decks">'+Object.keys(HEADSUP_DECKS).map(d=>'<button type="button" class="btn btn-primary hu-deck">'+d+'</button>').join('')+'</div>';
  body.querySelectorAll('.hu-deck').forEach(b=>b.addEventListener('click',()=>startHeadsUp(b.textContent)));
  activeGame={stop(){stopHeadsUp();}};
}
function startHeadsUp(deck){
  const words=[...HEADSUP_DECKS[deck]].sort(()=>Math.random()-0.5);
  let i=0,score=0,time=90;
  const o=document.createElement('div');o.className='hu-full';
  o.innerHTML='<div class="hu-top"><span class="hu-time">90</span><span class="hu-score">✓ 0</span></div><div class="hu-word"></div><div class="hu-btns"><button type="button" class="hu-pass">PASS ⏭️</button><button type="button" class="hu-got">GOT IT ✓</button></div>';
  document.body.appendChild(o);
  const wEl=o.querySelector('.hu-word'),tEl=o.querySelector('.hu-time'),sEl=o.querySelector('.hu-score');
  function show(){if(i>=words.length)i=0;wEl.textContent=words[i];}
  headsUpTimer=setInterval(()=>{time--;tEl.textContent=time;if(time<=0)finish();},1000);
  function finish(){clearInterval(headsUpTimer);wEl.textContent='🏁 '+score+' correct!';sfx('win');
    o.querySelector('.hu-btns').innerHTML='<button type="button" class="hu-got">DONE</button>';
    o.querySelector('.hu-got').addEventListener('click',()=>o.remove());}
  o.querySelector('.hu-got').addEventListener('click',()=>{score++;sEl.textContent='✓ '+score;sfx('coin');i++;show();});
  o.querySelector('.hu-pass').addEventListener('click',()=>{sfx('click');i++;show();});
  show();
}
/* --- shared question bank for multiplayer (from every stop) --- */
function questionBank(){
  const bank=[];
  STOPS.forEach(s=>s.quizPool.forEach(q=>{
    const opts=q[2]||['True','False'];
    const ans=q[1]==='true'?'True':q[1]==='false'?'False':q[1];
    bank.push({q:'['+s.title+'] '+q[0],a:ans,opts:opts.map(o=>o==='true'?'True':o==='false'?'False':o)});
  }));
  return bank.sort(()=>Math.random()-0.5);
}
function playerPicker(body,title,cb){
  body.innerHTML='<div class="game-hud">'+title+' — pick 2-4 players, then pass the phone each turn!</div>'+
    '<div class="mp-picks">'+PLAYER_NAMES.map(n=>'<label class="mp-pick"><input type="checkbox" value="'+n+'"> '+n+'</label>').join('')+'</label></div>'+
    '<button type="button" class="btn btn-primary mp-start">Start!</button><p class="game-hud mp-err"></p>';
  body.querySelector('.mp-start').addEventListener('click',()=>{
    const picked=[...body.querySelectorAll('.mp-pick input:checked')].map(i=>i.value);
    if(picked.length<2){body.querySelector('.mp-err').textContent='Pick at least 2 players!';return;}
    cb(picked);
  });
}
/* --- Route Rush (blooket-style quiz race) --- */
function hubRush(body){
  playerPicker(body,'⚡ ROUTE RUSH',players=>{
    const bank=questionBank();let qi=0,turn=0;const scores=Object.fromEntries(players.map(p=>[p,0]));
    const ROUNDS=players.length*6;
    function next(){
      if(qi>=ROUNDS||qi>=bank.length)return finish();
      const p=players[turn%players.length],Q=bank[qi];
      const opts=[...Q.opts].sort(()=>Math.random()-0.5);
      body.innerHTML='<div class="mp-turn">📱 Pass to <b>'+p+'</b>!</div><div class="mp-q">'+escapeHtml(Q.q)+'</div>'+
        '<div class="mp-opts">'+opts.map(o=>'<button type="button" class="btn btn-quiet mp-opt">'+escapeHtml(o)+'</button>').join('')+'</div>'+
        '<div class="mp-scores">'+players.map(x=>x+': <b>'+scores[x]+'</b>').join(' · ')+'</div>';
      body.querySelectorAll('.mp-opt').forEach(b=>b.addEventListener('click',()=>{
        const right=b.textContent===Q.a;qi++;turn++;
        if(right){scores[p]+=100;sfx('win');
          body.innerHTML='<div class="mp-turn">✅ Correct, '+p+'! +100 — now PICK A BOX!</div><div class="mbox-row">'+[0,1,2].map(i=>'<button type="button" class="mbox-box">🎁</button>').join('')+'</div>';
          const boxes=[['+50 rush points!',50],['+100 RUSH POINTS!',100],['-30 points 😈',-30],['Steal 50 from the leader!','steal']];
          body.querySelectorAll('.mbox-box').forEach(bx=>bx.addEventListener('click',()=>{
            const prize=boxes[Math.floor(Math.random()*boxes.length)];
            if(prize[1]==='steal'){const leader=players.reduce((a,b2)=>scores[a]>=scores[b2]?a:b2);if(leader!==p){scores[leader]-=50;scores[p]+=50;}}
            else scores[p]=Math.max(0,scores[p]+prize[1]);
            sfx(prize[1]==='steal'||prize[1]>0?'coin':'lose');
            body.innerHTML='<div class="mp-turn">'+prize[0]+'</div>';setTimeout(next,1300);
          }));
        }else{sfx('lose');body.innerHTML='<div class="mp-turn">❌ Nope! It was <b>'+escapeHtml(Q.a)+'</b></div>';setTimeout(next,1400);}
      }));
    }
    function finish(){
      const rows=players.map(p=>[p,scores[p]]).sort((a,b)=>b[1]-a[1]);
      body.innerHTML='<div class="mp-turn">🏆 '+rows[0][0]+' WINS ROUTE RUSH!</div><div class="mp-scores big">'+rows.map((r,i)=>(i+1)+'. '+r[0]+' — '+r[1]).join('<br>')+'</div><button type="button" class="btn btn-primary mp-start">Play again</button>';
      sfx('jackpot');burst(body);bearCelebrate(rows[0][0]+' is the Rush champ! ⚡');
      body.querySelector('.mp-start').addEventListener('click',()=>hubRush(body));
    }
    next();
  });
  activeGame={stop(){}};
}
/* --- Route Heist (crypto-hack style) --- */
function hubHeist(body){
  playerPicker(body,'🕵️ ROUTE HEIST',players=>{
    const bank=questionBank();let qi=0,turn=0;
    const gold=Object.fromEntries(players.map(p=>[p,50]));const shield={};
    const ROUNDS=players.length*6;
    function next(){
      if(qi>=ROUNDS||qi>=bank.length)return finish();
      const p=players[turn%players.length],Q=bank[qi];
      const opts=[...Q.opts].sort(()=>Math.random()-0.5);
      body.innerHTML='<div class="mp-turn">📱 Pass to <b>'+p+'</b>'+(shield[p]?' 🛡️':'')+'</div><div class="mp-q">'+escapeHtml(Q.q)+'</div>'+
        '<div class="mp-opts">'+opts.map(o=>'<button type="button" class="btn btn-quiet mp-opt">'+escapeHtml(o)+'</button>').join('')+'</div>'+
        '<div class="mp-scores">'+players.map(x=>x+': <b>'+gold[x]+'</b>🪙'+(shield[x]?'🛡️':'')).join(' · ')+'</div>';
      body.querySelectorAll('.mp-opt').forEach(b=>b.addEventListener('click',()=>{
        const right=b.textContent===Q.a;qi++;turn++;
        if(!right){sfx('lose');body.innerHTML='<div class="mp-turn">❌ Wrong! It was <b>'+escapeHtml(Q.a)+'</b>. No action for you.</div>';setTimeout(next,1400);return;}
        sfx('win');
        body.innerHTML='<div class="mp-turn">✅ Correct, '+p+'! Choose your move:</div><div class="mp-opts">'+
          '<button type="button" class="btn btn-primary h-mine">⛏️ MINE (+20 safe)</button>'+
          '<button type="button" class="btn btn-danger h-hack">💻 HACK the leader (55%: steal 30 / fail: -10)</button>'+
          '<button type="button" class="btn btn-secondary h-shield">🛡️ SHIELD (block next hack on you)</button></div>';
        body.querySelector('.h-mine').addEventListener('click',()=>{gold[p]+=20;sfx('coin');step('⛏️ '+p+' mined +20 gold.');});
        body.querySelector('.h-shield').addEventListener('click',()=>{shield[p]=true;sfx('click');step('🛡️ '+p+' raised a shield.');});
        body.querySelector('.h-hack').addEventListener('click',()=>{
          const others=players.filter(x=>x!==p);const leader=others.reduce((a,b2)=>gold[a]>=gold[b2]?a:b2);
          if(shield[leader]){shield[leader]=false;sfx('lose');step('🛡️ '+leader+' BLOCKED the hack!');return;}
          if(Math.random()<0.55){const take=Math.min(30,gold[leader]);gold[leader]-=take;gold[p]+=take;sfx('jackpot');step('💻 '+p+' hacked '+leader+' for '+take+' gold!!');}
          else{gold[p]=Math.max(0,gold[p]-10);sfx('lose');step('🚨 Hack FAILED! '+p+' loses 10.');}
        });
        function step(msg){body.innerHTML='<div class="mp-turn">'+msg+'</div>';setTimeout(next,1500);}
      }));
    }
    function finish(){
      const rows=players.map(p=>[p,gold[p]]).sort((a,b)=>b[1]-a[1]);
      body.innerHTML='<div class="mp-turn">🏆 '+rows[0][0]+' pulls off the HEIST!</div><div class="mp-scores big">'+rows.map((r,i)=>(i+1)+'. '+r[0]+' — '+r[1]+'🪙').join('<br>')+'</div><button type="button" class="btn btn-primary mp-start">Play again</button>';
      sfx('jackpot');burst(body);bearCelebrate(rows[0][0]+' is a master thief! 🕵️');
      body.querySelector('.mp-start').addEventListener('click',()=>hubHeist(body));
    }
    next();
  });
  activeGame={stop(){}};
}

/* ---- MUSIC: in-app player. iTunes preview (no key) or full YouTube (with free key) ---- */
async function playSong(q){
  q=(q||'').trim();if(!q)return;
  const wrap=document.getElementById('musicPlayerBox');if(!wrap)return;
  wrap.innerHTML='<p class="music-note">🔎 Finding "'+escapeHtml(q)+'"…</p>';
  if(CONFIG.youtubeKey){
    try{
      const r=await fetch('https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q='+encodeURIComponent(q+' lyrics')+'&key='+CONFIG.youtubeKey);
      const d=await r.json();const vid=d.items&&d.items[0]&&d.items[0].id.videoId;
      if(vid){wrap.innerHTML='<iframe class="music-frame" src="https://www.youtube.com/embed/'+vid+'?autoplay=1&rel=0" allow="autoplay; encrypted-media" allowfullscreen frameborder="0"></iframe>';return;}
    }catch(_){/* fall through */}
  }
  try{
    const r=await fetch('https://itunes.apple.com/search?media=music&limit=1&term='+encodeURIComponent(q));
    const d=await r.json();const t=d.results&&d.results[0];
    if(t&&t.previewUrl){
      wrap.innerHTML='<div class="music-card"><img class="music-art" src="'+t.artworkUrl100.replace('100x100','300x300')+'" alt="">'+
        '<div class="music-meta"><b>'+escapeHtml(t.trackName)+'</b><span>'+escapeHtml(t.artistName)+'</span>'+
        '<audio controls autoplay src="'+t.previewUrl+'"></audio>'+
        '<span class="music-small">30-sec preview · <a href="https://www.youtube.com/results?search_query='+encodeURIComponent(q+' lyrics')+'" target="_blank" rel="noopener">full song on YouTube ↗</a></span></div></div>';
      return;
    }
  }catch(_){/**/}
  wrap.innerHTML='<p class="music-note">Couldn\u2019t find that one — check spelling or <a href="https://www.youtube.com/results?search_query='+encodeURIComponent(q)+'" target="_blank" rel="noopener">search YouTube ↗</a></p>';
}
document.getElementById('musicBtn')?.addEventListener('click',()=>playSong(document.getElementById('musicInput').value));
document.getElementById('musicInput')?.addEventListener('keydown',e=>{if(e.key==='Enter')playSong(e.target.value);});
document.querySelectorAll('.mq').forEach(s=>s.addEventListener('click',()=>{const inp=document.getElementById('musicInput');inp.value=s.textContent;playSong(s.textContent);}));

/* ---- JOURNEY BAR with GPS (36) ---- */
function haversine(a,b){const R=6371,toR=x=>x*Math.PI/180;const dLat=toR(b[0]-a[0]),dLon=toR(b[1]-a[1]);const h=Math.sin(dLat/2)**2+Math.cos(toR(a[0]))*Math.cos(toR(b[0]))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(h));}
document.getElementById('journeyBtn')?.addEventListener('click',()=>{
  const txt=document.getElementById('journeyText');txt.textContent='📡 Finding you…';
  if(!navigator.geolocation){txt.textContent='Location not available on this device.';return;}
  navigator.geolocation.getCurrentPosition(pos=>{
    const me=[pos.coords.latitude,pos.coords.longitude];
    const route=STOPS.filter(s=>typeof s.lat==='number');
    let best=0,bestD=1e9;route.forEach((s,i)=>{const d=haversine(me,[s.lat,s.lng]);if(d<bestD){bestD=d;best=i;}});
    const pct=Math.round(best/(route.length-1)*100);
    const next=route[Math.min(best+1,route.length-1)];
    const dNext=haversine(me,[next.lat,next.lng]);
    document.getElementById('journeyFill').style.width=pct+'%';
    document.getElementById('journeyBear').style.left='calc('+pct+'% - 12px)';
    txt.textContent='📍 Nearest: '+route[best].title+' · '+pct+'% of the route · '+(best<route.length-1?Math.round(dNext)+' km to '+next.title:'FINAL STOP! 🏁');
    sfx('coin');
  },()=>{txt.textContent='Location denied — allow it in Settings to see route progress.';},{enableHighAccuracy:false,timeout:12000,maximumAge:120000});
});

/* ---- POSTCARDS (37) ---- */
function renderPostcards(){
  const grid=document.getElementById('postGrid');if(!grid)return;
  const withPhotos=STOPS.filter(s=>progress.photos[s.id]?.dataUrl);
  if(!withPhotos.length){grid.innerHTML='<p class="empty">No arrival photos yet — complete a stop and your postcards appear here! 📮</p>';return;}
  grid.innerHTML='';
  withPhotos.forEach(s=>{
    const cap=(progress.captions||{})[s.id]||'';
    const card=document.createElement('div');card.className='post-card';
    card.innerHTML='<img alt="'+escapeHtml(s.title)+'"><div class="post-meta"><b>'+escapeHtml(s.title)+'</b><span>'+escapeHtml(s.day)+'</span></div>'+
      '<input class="post-cap" placeholder="Write a caption…" maxlength="60"><button type="button" class="btn btn-quiet post-dl">💾 Download postcard</button>';
    card.querySelector('img').src=progress.photos[s.id].dataUrl;
    const inp=card.querySelector('.post-cap');inp.value=cap;
    inp.addEventListener('change',()=>{progress.captions=progress.captions||{};progress.captions[s.id]=inp.value;saveProgress();});
    card.querySelector('.post-dl').addEventListener('click',()=>downloadPostcard(s,inp.value));
    grid.appendChild(card);
  });
}
function downloadPostcard(s,caption){
  const img=new Image();img.onload=()=>{
    const c=document.createElement('canvas');c.width=900;c.height=700;const x=c.getContext('2d');
    x.fillStyle='#f4e4c8';x.fillRect(0,0,900,700);
    const sc=Math.max(820/img.width,480/img.height);const w=img.width*sc,h=img.height*sc;
    x.save();x.beginPath();x.rect(40,40,820,480);x.clip();x.drawImage(img,40+(820-w)/2,40+(480-h)/2,w,h);x.restore();
    x.strokeStyle='#241a22';x.lineWidth=8;x.strokeRect(40,40,820,480);
    x.fillStyle='#a8331a';x.font='bold 44px Trebuchet MS';x.fillText(s.title.toUpperCase(),48,590);
    x.fillStyle='#8a6b52';x.font='bold 26px Trebuchet MS';x.fillText(s.day+' · America 2026',48,628);
    x.fillStyle='#3a2417';x.font='italic 30px Georgia';x.fillText(caption||'Wish you were here!',48,672);
    x.fillStyle='#e8651f';x.font='bold 60px Georgia';x.textAlign='right';x.fillText('66',860,660);x.textAlign='left';
    const a=document.createElement('a');a.href=c.toDataURL('image/jpeg',0.85);a.download='postcard-'+s.id+'.jpg';a.click();sfx('coin');
  };img.src=progress.photos[s.id].dataUrl;
}

/* ---- BEAR MOODS (32) + name + den reactions (33) ---- */
function bearMood(){
  const h=new Date().getHours();
  if(h>=21||h<7)return {acc:'💤',lines:['*yaaaawn* five more miles…','Wake me at the next motel. 😴','Night driving? Brave.','Zzz… huh? Oh. Hi.']};
  if(statusForStop&&stopById('vegas')&&statusForStop('vegas')!=='ready'&&today()>=dateObj('2026-08-18'))return {acc:'🕶️',lines:['VEGAS BABY! 😎','The den never closes in Vegas!','High rollers only!','I look GOOD in shades.']};
  if(h>=11&&h<=16)return {acc:'🥵',lines:['It\u2019s HOT. Bears hate hot.','Anyone got a cold drink? 🥤','Desert mode: activated.','I\u2019m basically a rug out here.']};
  return null;
}
const _origBearSay=bearSay;
bearSay=function(){
  const mood=bearMood();
  const b=document.getElementById('bearBubble');if(!b)return;
  let line;
  if(mood&&Math.random()<0.35)line=mood.lines[Math.floor(Math.random()*mood.lines.length)];
  else{let i;do{i=Math.floor(Math.random()*BEAR_LINES.length);}while(i===bearIdx);bearIdx=i;line=BEAR_LINES[i];}
  if(Math.random()<0.25)line+=' — '+BEAR_NAME;
  b.textContent=line;b.classList.add('show');setTimeout(()=>b.classList.remove('show'),4600);
  const acc=document.getElementById('bearAcc');if(acc)acc.textContent=mood?mood.acc:'';
};
/* den streak reactions */
const _origSettleHook=true;
function denReact(win){
  progress.denW=win?(progress.denW||0)+1:0;
  progress.denL=win?0:(progress.denL||0)+1;saveProgress();
  if(progress.denL===3)setTimeout(()=>bearShout('Three losses?! Want insurance? I don\u2019t sell it. 😈'),1500);
  if(progress.denL>=5)setTimeout(()=>bearShout('Maybe… stop? Says the casino owner. 😅'),1500);
  if(progress.denW===3)setTimeout(()=>bearShout('Three in a row?! I\u2019m watching you… 👀'),1500);
  if(progress.denW>=5)setTimeout(()=>bearShout('CHEATER! Nobody beats '+BEAR_NAME+' five times! 🚨'),1500);
}

/* ---- FINAL AWARDS CEREMONY (40) ---- */
document.getElementById('ceremonyBtn')?.addEventListener('click',startCeremony);
function startCeremony(){
  const chips=chipStandings();
  const pts=new Map();PLAYER_NAMES.forEach(n=>pts.set(n,0));
  shared.submissions.forEach(i=>{if(i.status==='approved')pts.set(i.username,(pts.get(i.username)||0)+scoreWithBonus(i));});
  const rows=[...pts.entries()].sort((a,b)=>b[1]-a[1]);
  const chipRows=[...chips.entries()].sort((a,b)=>b[1]-a[1]);
  const steps=[
    '<div class="cer-big">🏆 AMERICA 2026</div><div class="cer-sub">THE FINAL AWARDS CEREMONY</div><div class="cer-tap">tap to begin…</div>',
    '<div class="cer-sub">🪙 CHIP CHAMPION</div><div class="cer-big">'+escapeHtml(chipRows[0]?.[0]||'—')+'</div><div class="cer-sub">'+(chipRows[0]?.[1]||0)+' chips — wins the EXTRA $15 SHOP DASH! 🏃💨</div><div class="cer-tap">tap…</div>',
    '<div class="cer-sub">🥉 THIRD PLACE</div><div class="cer-big">'+escapeHtml(rows[2]?.[0]||'—')+'</div><div class="cer-sub">'+(rows[2]?.[1]||0)+' points</div><div class="cer-tap">tap…</div>',
    '<div class="cer-sub">🥈 SECOND PLACE</div><div class="cer-big">'+escapeHtml(rows[1]?.[0]||'—')+'</div><div class="cer-sub">'+(rows[1]?.[1]||0)+' points</div><div class="cer-tap">tap…</div>',
    '<div class="cer-sub">👑 ROAD TRIP CHAMPION 👑</div><div class="cer-big gold">'+escapeHtml(rows[0]?.[0]||'—')+'</div><div class="cer-sub">'+(rows[0]?.[1]||0)+' points — $15 CHAMPION! 💰</div><div class="cer-tap">tap to finish</div>'
  ];
  let i=0;
  const o=document.createElement('div');o.className='ceremony';
  document.body.appendChild(o);
  function show(){o.innerHTML='<div class="cer-inner">'+steps[i]+'</div>';sfx(i===steps.length-1?'jackpot':'win');burst(o);if(i===steps.length-1)bearCelebrate('WHAT A TRIP! 🎉');}
  o.addEventListener('click',()=>{i++;if(i>=steps.length){o.remove();return;}show();});
  show();
}

/* ---- hooks: settle→denReact + mystery box after grants ---- */
