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
function freshProgress(){return {completed:{},submitted:{},photos:{},hunt:{},huntPhotos:{},game:{},quiz:{},points:{}};}
function freshShared(){return {submissions:[],updatedAt:null};}
function readJson(k,f=null){try{const v=localStorage.getItem(k);return v?JSON.parse(v):f;}catch{return f;}}
function writeJson(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true;}catch{return false;}}
function progressKey(){return STORAGE.progressPrefix+(session?.username||'guest');}
function loadProgress(){progress=mergeProgress(readJson(progressKey(),null));}
function saveProgress(){if(session?.role!=='admin'&&!writeJson(progressKey(),progress)){alert('Phone storage is full — oldest photos may not save. Ask Ethan to sync!');}}
function mergeProgress(s){const m=freshProgress();if(!s||typeof s!=='object')return m;Object.keys(m).forEach(k=>{m[k]=s[k]&&typeof s[k]==='object'?s[k]:m[k];});return m;}
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
    els.hudScore.textContent=playerPoints(session.username);
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
  root.querySelector('.game-name').textContent=stop.game.title;
  root.querySelector('.game-prompt').textContent=stop.game.prompt;
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
   ARCADE — six mini-game engines
   ============================================================ */
function gameDone(root,stop,score){
  const cur=progress.game[stop.id]||{best:0};
  progress.game[stop.id]={best:Math.max(cur.best||0,score),complete:true};
  saveProgress();refreshTaskTags(root,stop);
}
function renderArcade(root,stop){
  const host=root.querySelector('.arcade');
  const g=stop.game;
  const best=progress.game[stop.id]?.best||0;
  const won=progress.game[stop.id]?.complete;
  host.innerHTML='<div class="arcade-top"><span class="arcade-best">Best: <b>'+best+'</b></span><span class="arcade-goal">'+
    (g.type==='memory'?'Goal: match all pairs':g.type==='timing'?'Goal: '+g.hits+' perfect hits':g.type==='reels'?'Goal: line up a match':'Goal: score '+g.target)+
    '</span></div><div class="arcade-stage"></div>'+(won?'<p class="arcade-won">🏆 Beaten! Play again for a new best.</p>':'');
  const stage=host.querySelector('.arcade-stage');
  const engines={runner:gameRunner,catch:gameCatch,whack:gameWhack,memory:gameMemory,timing:gameTiming,reels:gameReels};
  activeGame=engines[g.type](stage,g,score=>{
    host.querySelector('.arcade-best b').textContent=Math.max(score,progress.game[stop.id]?.best||0);
    gameDone(root,stop,score);
    if(!host.querySelector('.arcade-won')){const p=document.createElement('p');p.className='arcade-won';p.textContent='🏆 Beaten! Play again for a new best.';host.appendChild(p);}
    burst(host);
  });
}
/* shared canvas helper */
function makeCanvas(stage,h){const c=document.createElement('canvas');c.width=600;c.height=h||300;c.className='game-canvas';stage.appendChild(c);return c;}
function overlayBtn(stage,text,fn){const b=document.createElement('button');b.className='btn btn-primary game-start';b.textContent=text;b.addEventListener('click',fn);stage.appendChild(b);return b;}

/* 1) RUNNER — tap to jump obstacles */
function gameRunner(stage,g,onWin){
  const c=makeCanvas(stage),ctx=c.getContext('2d');
  let raf=null,run=false,y=0,vy=0,obs=[],score=0,speed=4.4,t=0;
  const groundY=240;
  function reset(){y=0;vy=0;obs=[];score=0;speed=4.4;t=0;}
  function jump(){if(!run)return;if(y===0)vy=-13.5;}
  function frame(){
    t++;score++;if(t%80===0)speed+=0.12;
    if(t%Math.max(50,90-Math.floor(speed*6))===0)obs.push({x:620});
    vy+=0.7;y=Math.min(0,y+vy);if(y===0)vy=0;
    obs.forEach(o=>o.x-=speed);obs=obs.filter(o=>o.x>-40);
    const px=90,py=groundY+y;
    for(const o of obs){if(Math.abs(o.x-px)<32&&y>-34){end();return;}}
    ctx.clearRect(0,0,600,300);
    ctx.fillStyle='#f6b85f';ctx.fillRect(0,0,600,300);
    ctx.fillStyle='#241a22';ctx.fillRect(0,groundY+26,600,50);
    ctx.strokeStyle='#ffc24b';ctx.lineWidth=4;ctx.setLineDash([18,14]);ctx.beginPath();ctx.moveTo(0,groundY+50);ctx.lineTo(600,groundY+50);ctx.stroke();ctx.setLineDash([]);
    ctx.font='34px serif';ctx.textAlign='center';
    ctx.fillText(g.player,px,py+18);
    obs.forEach(o=>ctx.fillText(g.obstacle,o.x,groundY+18));
    ctx.fillStyle='#3a2417';ctx.font='bold 20px sans-serif';ctx.textAlign='left';
    ctx.fillText('Score '+score+' / '+g.target,14,30);
    if(score>=g.target){win();return;}
    raf=requestAnimationFrame(frame);
  }
  function end(){run=false;cancelAnimationFrame(raf);ctx.fillStyle='rgba(36,26,34,.75)';ctx.fillRect(0,0,600,300);ctx.fillStyle='#ffc24b';ctx.font='bold 30px sans-serif';ctx.textAlign='center';ctx.fillText('Ouch! Score '+score,300,140);ctx.font='bold 18px sans-serif';ctx.fillText('Tap to try again',300,175);}
  function win(){run=false;cancelAnimationFrame(raf);ctx.fillStyle='rgba(59,26,71,.8)';ctx.fillRect(0,0,600,300);ctx.fillStyle='#ffc24b';ctx.font='bold 32px sans-serif';ctx.textAlign='center';ctx.fillText('🏁 You made it!',300,155);onWin(score);}
  c.addEventListener('pointerdown',()=>{if(run){jump();}else{reset();run=true;frame();}});
  end.toString();ctx.fillStyle='#f6b85f';ctx.fillRect(0,0,600,300);ctx.fillStyle='#3a2417';ctx.font='bold 24px sans-serif';ctx.textAlign='center';ctx.fillText('Tap to start — tap to jump!',300,150);
  return {stop(){run=false;cancelAnimationFrame(raf);}};
}

/* 2) CATCH — drag to catch good, avoid bad */
function gameCatch(stage,g,onWin){
  const c=makeCanvas(stage),ctx=c.getContext('2d');
  let raf=null,run=false,items=[],caught=0,miss=0,bx=300,t=0;
  function spawn(){const bad=Math.random()<0.28;items.push({x:40+Math.random()*520,y:-20,v:2.2+Math.random()*2,e:bad?g.bad[Math.floor(Math.random()*g.bad.length)]:g.good[Math.floor(Math.random()*g.good.length)],bad});}
  function frame(){
    t++;if(t%38===0)spawn();
    items.forEach(i=>i.y+=i.v);
    items=items.filter(i=>{
      if(i.y>232&&Math.abs(i.x-bx)<44){if(i.bad){caught=Math.max(0,caught-2);}else caught++;return false;}
      return i.y<310;
    });
    ctx.clearRect(0,0,600,300);
    ctx.fillStyle='#f6b85f';ctx.fillRect(0,0,600,300);
    ctx.fillStyle='#241a22';ctx.fillRect(0,272,600,28);
    ctx.font='30px serif';ctx.textAlign='center';
    items.forEach(i=>ctx.fillText(i.e,i.x,i.y));
    ctx.font='40px serif';ctx.fillText(g.catcher,bx,266);
    ctx.fillStyle='#3a2417';ctx.font='bold 20px sans-serif';ctx.textAlign='left';
    ctx.fillText('Caught '+caught+' / '+g.target,14,30);
    if(caught>=g.target){win();return;}
    raf=requestAnimationFrame(frame);
  }
  function win(){run=false;cancelAnimationFrame(raf);ctx.fillStyle='rgba(59,26,71,.8)';ctx.fillRect(0,0,600,300);ctx.fillStyle='#ffc24b';ctx.font='bold 32px sans-serif';ctx.textAlign='center';ctx.fillText('🧺 All caught!',300,155);onWin(caught);}
  c.addEventListener('pointermove',e=>{const r=c.getBoundingClientRect();bx=(e.clientX-r.left)*600/r.width;});
  c.addEventListener('pointerdown',e=>{const r=c.getBoundingClientRect();bx=(e.clientX-r.left)*600/r.width;if(!run){run=true;items=[];caught=0;t=0;frame();}});
  ctx.fillStyle='#f6b85f';ctx.fillRect(0,0,600,300);ctx.fillStyle='#3a2417';ctx.font='bold 24px sans-serif';ctx.textAlign='center';ctx.fillText('Tap to start — slide to catch!',300,150);
  return {stop(){run=false;cancelAnimationFrame(raf);}};
}

/* 3) WHACK — tap the right emoji in a 3x3 grid */
function gameWhack(stage,g,onWin){
  stage.innerHTML='<div class="whack-top"><span class="whack-score">Hits: 0 / '+g.target+'</span><span class="whack-time">'+g.time+'s</span></div><div class="whack-grid"></div>';
  const grid=stage.querySelector('.whack-grid'),scoreEl=stage.querySelector('.whack-score'),timeEl=stage.querySelector('.whack-time');
  const cells=[];for(let i=0;i<9;i++){const b=document.createElement('button');b.className='whack-cell';b.type='button';grid.appendChild(b);cells.push(b);}
  let score=0,timeLeft=g.time,timer=null,popper=null,running=false;
  function pop(){
    cells.forEach(x=>{x.textContent='';x.dataset.kind='';});
    const i=Math.floor(Math.random()*9);
    const isMole=Math.random()<0.72;
    cells[i].textContent=isMole?g.mole:g.decoy;
    cells[i].dataset.kind=isMole?'mole':'decoy';
  }
  function start(){
    running=true;score=0;timeLeft=g.time;scoreEl.textContent='Hits: 0 / '+g.target;timeEl.textContent=timeLeft+'s';
    popper=setInterval(pop,750);
    timer=setInterval(()=>{timeLeft--;timeEl.textContent=timeLeft+'s';if(timeLeft<=0)finish();},1000);
    pop();
  }
  function finish(){
    clearInterval(timer);clearInterval(popper);running=false;
    cells.forEach(x=>x.textContent='');
    if(score>=g.target){timeEl.textContent='🏆 WIN!';onWin(score);}
    else timeEl.textContent='Try again!';
  }
  cells.forEach(b=>b.addEventListener('pointerdown',()=>{
    if(!running){start();return;}
    if(b.dataset.kind==='mole'){score++;b.classList.add('hit');setTimeout(()=>b.classList.remove('hit'),150);pop();}
    else if(b.dataset.kind==='decoy'){score=Math.max(0,score-1);}
    scoreEl.textContent='Hits: '+score+' / '+g.target;
    if(score>=g.target)finish();
  }));
  timeEl.textContent='Tap to start!';
  return {stop(){clearInterval(timer);clearInterval(popper);}};
}

/* 4) MEMORY — match the pairs (3D flip) */
function gameMemory(stage,g,onWin){
  const icons=[...g.icons,...g.icons].sort(()=>Math.random()-0.5);
  stage.innerHTML='<div class="mem-top">Moves: <b class="mem-moves">0</b></div><div class="mem-grid"></div>';
  const grid=stage.querySelector('.mem-grid'),movesEl=stage.querySelector('.mem-moves');
  let open=[],lockMem=false,matched=0,moves=0;
  icons.forEach(icon=>{
    const card=document.createElement('button');card.type='button';card.className='mem-card';
    card.innerHTML='<span class="mem-inner"><span class="mem-front">❓</span><span class="mem-back">'+icon+'</span></span>';
    card.dataset.icon=icon;
    card.addEventListener('click',()=>{
      if(lockMem||card.classList.contains('flip')||card.classList.contains('matched'))return;
      card.classList.add('flip');open.push(card);
      if(open.length===2){
        moves++;movesEl.textContent=moves;lockMem=true;
        const [a,b]=open;
        setTimeout(()=>{
          if(a.dataset.icon===b.dataset.icon){a.classList.add('matched');b.classList.add('matched');matched+=2;
            if(matched===icons.length)onWin(Math.max(10,60-moves));}
          else{a.classList.remove('flip');b.classList.remove('flip');}
          open=[];lockMem=false;
        },650);
      }
    });
    grid.appendChild(card);
  });
  return {stop(){}};
}

/* 5) TIMING — tap when the marker is in the golden zone */
function gameTiming(stage,g,onWin){
  stage.innerHTML='<div class="time-top">Perfect hits: <b class="time-hits">0</b> / '+g.hits+'</div>'+
    '<div class="time-bar"><div class="time-zone"></div><div class="time-marker"></div></div>'+
    '<button class="btn btn-primary time-btn" type="button">📸 SNAP!</button><p class="time-msg"></p>';
  const marker=stage.querySelector('.time-marker'),zone=stage.querySelector('.time-zone'),hitsEl=stage.querySelector('.time-hits'),msg=stage.querySelector('.time-msg'),btn=stage.querySelector('.time-btn');
  let pos=0,dir=1,hits=0,speed=1.7,raf=null,running=true;
  let zoneStart=35,zoneWidth=18;
  function placeZone(){zoneStart=15+Math.random()*55;zone.style.left=zoneStart+'%';zone.style.width=zoneWidth+'%';}
  function frame(){if(!running)return;pos+=dir*speed;if(pos>=100){pos=100;dir=-1;}if(pos<=0){pos=0;dir=1;}marker.style.left=pos+'%';raf=requestAnimationFrame(frame);}
  btn.addEventListener('click',()=>{
    if(pos>=zoneStart&&pos<=zoneStart+zoneWidth){hits++;hitsEl.textContent=hits;msg.textContent='✨ Perfect shot!';speed+=0.5;placeZone();
      if(hits>=g.hits){running=false;cancelAnimationFrame(raf);msg.textContent='🏆 Photographer of the year!';onWin(hits*10);}}
    else msg.textContent='Missed the light — try again!';
  });
  placeZone();frame();
  return {stop(){running=false;cancelAnimationFrame(raf);}};
}

/* 6) REELS — stop the three reels, match 2+ */
function gameReels(stage,g,onWin){
  stage.innerHTML='<div class="reels"></div><p class="reel-msg">Tap each reel to stop it!</p>';
  const wrap=stage.querySelector('.reels'),msg=stage.querySelector('.reel-msg');
  const reels=[];let stopped=0;
  for(let r=0;r<3;r++){
    const el=document.createElement('button');el.type='button';el.className='reel';el.textContent=g.icons[0];
    const state={el,timer:null,icon:g.icons[0],stopped:false};
    state.timer=setInterval(()=>{state.icon=g.icons[Math.floor(Math.random()*g.icons.length)];el.textContent=state.icon;},110+r*20);
    el.addEventListener('click',()=>{
      if(state.stopped)return;
      clearInterval(state.timer);state.stopped=true;el.classList.add('stopped');stopped++;
      if(stopped===3){
        const [a,b,c]=reels.map(x=>x.icon);
        if(a===b||b===c||a===c){msg.textContent=(a===b&&b===c)?'💎 JACKPOT! Triple match!':'🏆 Match! You win!';onWin(a===b&&b===c?30:15);}
        else{msg.textContent='No match — spinning again!';
          setTimeout(()=>{stopped=0;reels.forEach(s=>{s.stopped=false;s.el.classList.remove('stopped');s.timer=setInterval(()=>{s.icon=g.icons[Math.floor(Math.random()*g.icons.length)];s.el.textContent=s.icon;},110);});},900);}
      }
    });
    wrap.appendChild(el);reels.push(state);
  }
  return {stop(){reels.forEach(s=>clearInterval(s.timer));}};
}

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
  if(!progress.game[stop.id]?.complete)return '🕹️ Beat the arcade game first!';
  if(!progress.quiz[stop.id]?.checked)return 'Check the quiz answers first.';
  if(!progress.quiz[stop.id]?.correct)return 'Beat the boss quiz first.';
  return '';
}
async function submitStop(stop,index,cs,root){
  if(session.test){progress.completed[stop.id]=true;progress.points[stop.id]=SCORE_PER_STOP;saveProgress();burst(root);setTimeout(showHome,900);return;}
  const problem=validateStop(stop,index);
  if(problem){cs.textContent=problem;return;}
  const photo=progress.photos[stop.id]||{};
  const sub={id:session.username+'-'+stop.id+'-'+Date.now(),username:session.username,stopId:stop.id,stopTitle:stop.title,day:stop.day,hotel:stop.hotel,
    score:SCORE_PER_STOP,bonus:0,status:'pending',submittedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
    proofName:photo.name||'',proofImage:photo.dataUrl||'',activity:'Arcade best: '+(progress.game[stop.id]?.best||0)};
  const i=shared.submissions.findIndex(x=>x.username===sub.username&&x.stopId===sub.stopId&&x.status==='pending');
  if(i>=0)shared.submissions[i]=sub;else shared.submissions.push(sub);
  saveShared();
  progress.submitted[stop.id]={id:sub.id,status:'pending'};saveProgress();
  cs.textContent='Mission sent to the boss! 🎉';burst(root);
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
    row.querySelector('.admin-meta').textContent=(item.activity||'')+(item.proofImage?'':' · (no photo)');
    if(item.proofImage){const img=document.createElement('img');img.src=item.proofImage;img.alt='proof';row.querySelector('.admin-photo').appendChild(img);}
    row.querySelector('.approve').addEventListener('click',()=>approveSubmission(item.id,row.querySelector('.bonus').value));
    row.querySelector('.reject').addEventListener('click',()=>rejectSubmission(item.id));
    els.adminRows.appendChild(row);
  });
  els.adminEmpty.classList.toggle('hidden',pending.length>0);
}
function renderLeaderboard(){
  const m=new Map();PLAYER_NAMES.forEach(n=>m.set(n,{username:n,points:0,stops:0}));
  shared.submissions.forEach(i=>{if(i.status!=='approved')return;const r=m.get(i.username)||{username:i.username,points:0,stops:0};r.points+=scoreWithBonus(i);r.stops+=1;m.set(i.username,r);});
  const rows=[...m.values()].sort((a,b)=>b.points-a.points||a.username.localeCompare(b.username));
  els.leaderboardRows.innerHTML='';
  rows.forEach((r,i)=>{const tr=document.createElement('tr');tr.innerHTML='<td></td><td></td><td></td><td></td>';
    tr.children[0].textContent=i+1;tr.children[1].textContent=r.username;tr.children[2].textContent=r.points;tr.children[3].textContent=r.stops;
    els.leaderboardRows.appendChild(tr);});
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
  els.rewardText.textContent=done?'You finished the whole road trip! Open the vault! 🏆':'Clear every stop to unlock the final prize!';
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
    approvedBy:String(i.approvedBy||i.ApprovedBy||''),proofName:String(i.proofName||i.ProofName||''),proofImage:String(i.proofImage||i.ProofImage||''),activity:String(i.activity||i.Activity||'')
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
  els.login.classList.add('hidden');els.site.classList.remove('hidden');
  showHome();
  if(countdownTimer)clearInterval(countdownTimer);
  countdownTimer=setInterval(renderCountdown,30000);
  await syncShared();
}
els.loginForm.addEventListener('submit',async e=>{e.preventDefault();els.loginError.textContent='';if(!await doLogin(els.username.value,els.password.value))els.loginError.textContent='Wrong name or password.';});
els.logoutBtn.addEventListener('click',()=>{sessionStorage.removeItem(STORAGE.session);session=null;stopGame();els.site.classList.add('hidden');els.login.classList.remove('hidden');});
els.backBtn.addEventListener('click',showHome);
els.syncBtn.addEventListener('click',syncShared);
els.adminRefreshBtn.addEventListener('click',syncShared);
els.exportCsvBtn.addEventListener('click',exportCsv);
els.amazonBtn.addEventListener('click',()=>{if(!els.amazonBtn.disabled)els.voucher.classList.remove('hidden');});
const pp=new URLSearchParams(location.search);
if(pp.get('preview')==='test'){session={username:'test',role:'player',test:true};sessionStorage.setItem(STORAGE.session,JSON.stringify(session));openSite();}
else{try{const s=JSON.parse(sessionStorage.getItem(STORAGE.session)||'null');if(s?.username){session=s;openSite();}}catch{}}
