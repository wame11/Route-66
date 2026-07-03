/* ===== Route 66 Family Challenge — ARCADE EDITION ===== */
const ACCOUNTS={
  Jacob:{role:'player',hash:'03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'},
  Lily:{role:'player',hash:'fe2592b42a727e977f055947385b709cc82b16b9a87f88c6abf3900d65d0cdc3'},
  Hannah:{role:'player',hash:'9975baa75e1603273cbd3d94746a0442e22d5dc0268750dd45229f343f53fe19'},
  Ethan:{role:'player',hash:'08f61ac43fc9a9d5bd3d41f6dc2976ad27d8d5d8422e2ac87c12b98364a331fe'},
  admin:{role:'admin',hash:'7f3d56bb44da1a1f5239ac9db712488db90f135d999290ed9104eba8691096e2'}
};
/* Paste your Google Apps Script /exec URL into sheetEndpoint to sync across devices. */
const CONFIG={sheetEndpoint:'',sheetUrl:''};
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
function freshShared(){return {submissions:[],updatedAt:null};}
function readJson(k,f=null){try{const v=localStorage.getItem(k);return v?JSON.parse(v):f;}catch{return f;}}
function writeJson(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true;}catch{return false;}}
function progressKey(){return STORAGE.progressPrefix+(session?.username||'guest');}
function loadProgress(){progress=mergeProgress(readJson(progressKey(),null));}
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
    els.hudScore.textContent=playerPoints(session.username);updateChips();
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
  if(won&&!progress.chipGrant[gk]){progress.chipGrant[gk]=true;progress.chips=(progress.chips||0)+10;updateChips();bearShout('+10 chips! Come gamble them with me! 🐻🪙');}
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
    proofName:photo.name||'',proofImage:photo.dataUrl||'',activity:arcadeSummary(stop),chips:Number(progress.chips||0),suggestBonus:suggestedBonus(stop)};
  const i=shared.submissions.findIndex(x=>x.username===sub.username&&x.stopId===sub.stopId&&x.status==='pending');
  if(i>=0)shared.submissions[i]=sub;else shared.submissions.push(sub);
  saveShared();
  progress.submitted[stop.id]={id:sub.id,status:'pending'};saveProgress();
  cs.textContent='Mission sent to the boss! 🎉';burst(root);bearCelebrate('MISSION COMPLETE! Legend! 🏆');
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
  [...shared.submissions].sort((a,b)=>timestamp(a.updatedAt)-timestamp(b.updatedAt)).forEach(i=>{if(i.username)latest.set(i.username,Number(i.chips||0));});
  if(session&&!isAdmin()&&!session.test)latest.set(session.username,Number(progress.chips||0));
  return latest;
}
function renderChipChamp(){
  const el=document.getElementById('chipChamp');if(!el)return;
  const m=chipStandings();
  if(!m.size){el.textContent='🪙 Chip Champion: no chip counts reported yet.';return;}
  const rows=[...m.entries()].sort((a,b)=>b[1]-a[1]);
  const [name,chips]=rows[0];
  el.innerHTML='🪙 <b>Chip Champion: '+escapeHtml(name)+' ('+chips+' chips)</b> — wins the 30-SECOND SHOP DASH: grab anything in an American shop, up to £15! ('+rows.map(r=>escapeHtml(r[0])+': '+r[1]).join(' · ')+')';
}
function renderLeaderboard(){
  const chips=chipStandings();
  const m=new Map();PLAYER_NAMES.forEach(n=>m.set(n,{username:n,points:0,stops:0}));
  shared.submissions.forEach(i=>{if(i.status!=='approved')return;const r=m.get(i.username)||{username:i.username,points:0,stops:0};r.points+=scoreWithBonus(i);r.stops+=1;m.set(i.username,r);});
  const rows=[...m.values()].sort((a,b)=>b.points-a.points||a.username.localeCompare(b.username));
  els.leaderboardRows.innerHTML='';
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
  applySharedToProgress();renderHome();
}
async function postRemote(payload){
  if(!CONFIG.sheetEndpoint)return null;
  try{const r=await fetch(CONFIG.sheetEndpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)});
    const data=await r.json();if(data?.submissions){shared=normaliseShared(data);saveShared();}return data;}catch{return null;}
}
function normaliseShared(data){
  const c=freshShared();c.updatedAt=data?.updatedAt||null;
  c.submissions=Array.isArray(data?.submissions)?data.submissions.map(i=>({
    id:String(i.id||i.ID||''),username:String(i.username||i.Username||''),stopId:String(i.stopId||i.StopID||''),
    stopTitle:String(i.stopTitle||i.StopTitle||''),day:String(i.day||i.Day||''),hotel:String(i.hotel||i.Hotel||''),
    score:Number(i.score||i.Score||SCORE_PER_STOP),bonus:Number(i.bonus||i.Bonus||0),status:String(i.status||i.Status||'pending').toLowerCase(),
    submittedAt:String(i.submittedAt||i.SubmittedAt||''),updatedAt:String(i.updatedAt||i.UpdatedAt||''),approvedAt:String(i.approvedAt||i.ApprovedAt||''),
    approvedBy:String(i.approvedBy||i.ApprovedBy||''),suggestBonus:Number(i.suggestBonus||i.SuggestBonus||0),chips:Number(i.chips||i.Chips||0),proofName:String(i.proofName||i.ProofName||''),proofImage:String(i.proofImage||i.ProofImage||''),activity:String(i.activity||i.Activity||'')
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
  setTimeout(()=>bearCelebrate(isAdmin()?'The boss has arrived! 👑':'WELCOME BACK, CHAMPION! 🎉'),700);
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
  document.body.appendChild(o);
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
function updateChips(){const el=document.getElementById('hudChips');if(el)el.textContent=(progress.chips||0);const d=document.querySelector('.den-balance b');if(d)d.textContent=(progress.chips||0);}
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
    m.addEventListener('click',e=>{e.preventDefault();openDen();});}}
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
    '<p class="den-instr">📖 HOW IT WORKS: choose your bet at the top, then tap a game. Win = your bet multiplied. Lose = bet gone. Ties give your bet back. Most chips at the end of the trip = 30-SECOND SHOP DASH (anything up to £15)!</p>'+
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
    progress.chips=(progress.chips||0)-w+(win?w*mult:0);saveProgress();updateChips();
    msg.textContent=win?('\ud83c\udf89 '+label+' You win '+(w*mult-w)+' chips!'):('\ud83d\udc80 '+label+' Lost '+w+' chips.');
    burst(o.querySelector('.den-card'));if(!win)o.querySelector('.den-card').classList.add('shake'),setTimeout(()=>o.querySelector('.den-card').classList.remove('shake'),400);
    if(win)bearCelebrate('NOO! My chips! 😭');else bearShout('The house thanks you. 😏');}
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
