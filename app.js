const ACCOUNTS={
  Jacob:{role:'player',hash:'03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'},
  Lily:{role:'player',hash:'fe2592b42a727e977f055947385b709cc82b16b9a87f88c6abf3900d65d0cdc3'},
  Hannah:{role:'player',hash:'9975baa75e1603273cbd3d94746a0442e22d5dc0268750dd45229f343f53fe19'},
  Ethan:{role:'player',hash:'08f61ac43fc9a9d5bd3d41f6dc2976ad27d8d5d8422e2ac87c12b98364a331fe'},
  admin:{role:'admin',hash:'7f3d56bb44da1a1f5239ac9db712488db90f135d999290ed9104eba8691096e2'}
};
const CONFIG={
  sheetEndpoint:'https://script.google.com/macros/s/AKfycbx_qOmtVWPm7BuClVf1Yj-w4pV7OyWgEzxntc89hgxNeQ9FB-acd6j5NcC0rO7wgkGy/exec',
  sheetUrl:'https://docs.google.com/spreadsheets/d/17vA0P0tY8GM2QudlaGCQ3F7T1Dxxr9MRuxWHZ3E4p8U/edit?gid=0#gid=0'
};

const SCORE_PER_STOP=100;
const PLAYER_NAMES=Object.keys(ACCOUNTS).filter(name=>ACCOUNTS[name].role==='player');
const STORAGE={
  session:'route66-session-v2',
  shared:'route66-shared-v2',
  progressPrefix:'route66-progress-v2-',
  legacyPrefix:'route66-progress-'
};

let session=null;
let progress=freshProgress();
let shared=freshShared();
let observer=null;

const $=selector=>document.querySelector(selector);
const els={
  login:$('#login'),
  site:$('#site'),
  loginForm:$('#loginForm'),
  username:$('#username'),
  password:$('#password'),
  loginError:$('#loginError'),
  who:$('#who'),
  syncStatus:$('#syncStatus'),
  sheetStatus:$('#sheetStatus'),
  sheetLink:$('#sheetLink'),
  doneCount:$('#doneCount'),
  doneLabel:$('#doneLabel'),
  pointsCount:$('#pointsCount'),
  pendingCount:$('#pendingCount'),
  routeNav:$('#routeNav'),
  roadmap:$('#roadmap'),
  leaderboard:$('#leaderboard'),
  progressFill:$('#progressFill'),
  progressCaption:$('#progressCaption'),
  stops:$('#stops'),
  stopTemplate:$('#stopTemplate'),
  leaderboardRows:$('#leaderboardRows'),
  leaderboardEmpty:$('#leaderboardEmpty'),
  adminPanel:$('#adminPanel'),
  adminRows:$('#adminRows'),
  adminEmpty:$('#adminEmpty'),
  amazonBtn:$('#amazonBtn'),
  reward:$('#reward'),
  rewardText:$('#rewardText'),
  voucher:$('#voucher'),
  syncBtn:$('#syncBtn'),
  printBtn:$('#printBtn'),
  resetBtn:$('#resetBtn'),
  logoutBtn:$('#logoutBtn'),
  exportCsvBtn:$('#exportCsvBtn'),
  adminRefreshBtn:$('#adminRefreshBtn')
};

function freshProgress(){
  return {completed:{},submitted:{},photos:{},hunt:{},huntPhotos:{},quick:{},sketch:{},dot:{},quiz:{},points:{}};
}

function freshShared(){
  return {submissions:[],updatedAt:null};
}

function readJson(key,fallback=null){
  try{
    const value=localStorage.getItem(key);
    return value?JSON.parse(value):fallback;
  }catch{
    return fallback;
  }
}

function writeJson(key,value){
  localStorage.setItem(key,JSON.stringify(value));
}

function progressKey(username=session?.username||'guest'){
  return STORAGE.progressPrefix+username;
}

function mergeProgress(saved){
  const merged=freshProgress();
  if(!saved||typeof saved!=='object')return merged;
  Object.keys(merged).forEach(key=>{
    merged[key]=saved[key]&&typeof saved[key]==='object'?saved[key]:merged[key];
  });
  if(saved.completed){
    merged.completed={...saved.completed};
    Object.keys(saved.completed).forEach(stopId=>{
      if(saved.completed[stopId]&&!merged.points[stopId])merged.points[stopId]=SCORE_PER_STOP;
    });
  }
  return merged;
}

function loadProgress(){
  const saved=readJson(progressKey(),null)??readJson(STORAGE.legacyPrefix+(session?.username||'guest'),null);
  progress=mergeProgress(saved);
}

function saveProgress(){
  if(session?.role!=='admin')writeJson(progressKey(),progress);
}

function loadShared(){
  shared=normaliseShared(readJson(STORAGE.shared,freshShared()));
}

function saveShared(){
  shared.updatedAt=new Date().toISOString();
  writeJson(STORAGE.shared,shared);
}

async function sha256(text){
  const bytes=new TextEncoder().encode(text);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

function normalName(name){
  const clean=name.trim().toLowerCase();
  return Object.keys(ACCOUNTS).find(account=>account.toLowerCase()===clean);
}

function isAdmin(){
  return session?.role==='admin';
}

function today(){
  const date=new Date();
  return new Date(date.getFullYear(),date.getMonth(),date.getDate());
}

function dateObj(value){
  const [year,month,day]=value.split('-').map(Number);
  return new Date(year,month-1,day);
}

function stopById(stopId){
  return STOPS.find(stop=>stop.id===stopId);
}

function latestSubmission(username,stopId){
  return shared.submissions
    .filter(item=>item.username===username&&item.stopId===stopId)
    .sort((a,b)=>timestamp(b.updatedAt||b.submittedAt)-timestamp(a.updatedAt||a.submittedAt))[0]||null;
}

function timestamp(value){
  const time=Date.parse(value||'');
  return Number.isFinite(time)?time:0;
}

function statusForStop(stopId){
  if(session?.test)return 'approved';
  if(isAdmin())return 'admin';
  const latest=latestSubmission(session?.username,stopId);
  if(latest?.status==='approved'||progress.completed[stopId])return 'approved';
  if(latest?.status==='pending'||progress.submitted[stopId]?.status==='pending')return 'pending';
  if(latest?.status==='rejected'||progress.submitted[stopId]?.status==='rejected')return 'rejected';
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
  if(index>0){
    const previous=STOPS[index-1];
    const status=statusForStop(previous.id);
    if(status==='pending')return previous.title+' is waiting for admin approval.';
    if(status==='rejected')return previous.title+' needs to be resubmitted.';
    return 'Get admin approval for '+previous.title+' first.';
  }
  return '';
}

function applySharedToProgress(){
  if(!session||session.test||isAdmin())return;
  STOPS.forEach(stop=>{
    const latest=latestSubmission(session.username,stop.id);
    if(!latest)return;
    progress.submitted[stop.id]={
      id:latest.id,
      status:latest.status,
      score:scoreWithBonus(latest),
      submittedAt:latest.submittedAt,
      updatedAt:latest.updatedAt
    };
    if(latest.status==='approved'){
      progress.completed[stop.id]=true;
      progress.points[stop.id]=scoreWithBonus(latest);
    }
    if(latest.status==='rejected'){
      delete progress.completed[stop.id];
      delete progress.points[stop.id];
    }
  });
  saveProgress();
}

function renderApp(){
  if(!session)return;
  applySharedToProgress();
  document.body.dataset.role=session.role;
  els.who.textContent=session.test?'test mode':isAdmin()?'admin':' '+session.username;
  els.adminPanel.classList.toggle('hidden',!isAdmin());
  els.leaderboard.classList.toggle('hidden',!isAdmin());
  renderStats();
  renderProgress();
  renderSheetStatus();
  renderRouteNav();
  renderLeaderboard();
  renderAdminPanel();
  renderStops();
  renderReward();
  revealOnScroll();
}

function renderProgress(){
  const total=STOPS.length;
  const approved=isAdmin()
    ? 0
    : STOPS.filter(stop=>statusForStop(stop.id)==='approved').length;
  const pct=isAdmin()?0:Math.round((approved/total)*100);
  if(els.progressFill)els.progressFill.style.width=(isAdmin()?100:pct)+'%';
  if(els.progressCaption){
    els.progressCaption.textContent=isAdmin()
      ? 'Admin view — approve the photos below.'
      : approved>=total
        ? 'Whole route unlocked! Amazing work! 🏆'
        : approved+' of '+total+' stops unlocked ('+pct+'%)';
  }
}

function renderStats(){
  if(isAdmin()){
    const pending=shared.submissions.filter(item=>item.status==='pending').length;
    const approved=shared.submissions.filter(item=>item.status==='approved').length;
    els.doneCount.textContent=approved;
    els.doneLabel.textContent='approved';
    els.pointsCount.textContent=buildLeaderboard().reduce((total,row)=>total+row.points,0);
    els.pendingCount.textContent=pending;
    return;
  }
  const approvedStops=STOPS.filter(stop=>statusForStop(stop.id)==='approved').length;
  const pendingStops=STOPS.filter(stop=>statusForStop(stop.id)==='pending').length;
  els.doneCount.textContent=approvedStops;
  els.doneLabel.textContent='unlocked';
  els.pointsCount.textContent=playerPoints(session.username);
  els.pendingCount.textContent=pendingStops;
}

function renderSheetStatus(){
  const connected=Boolean(CONFIG.sheetEndpoint);
  const label=connected?'Sheet sync connected.':'Local scoreboard mode.';
  els.syncStatus.textContent=label;
  if(els.sheetStatus)els.sheetStatus.textContent=label;
  if(els.sheetLink){
    els.sheetLink.classList.toggle('hidden',!CONFIG.sheetUrl);
    els.sheetLink.href=CONFIG.sheetUrl||'#';
  }
}

function renderRouteNav(){
  const road=els.roadmap;
  if(!road)return;
  road.innerHTML='';
  // find the next playable stop (first unlocked, not yet approved)
  let nextIndex=-1;
  for(let i=0;i<STOPS.length;i++){
    if(unlocked(i)&&statusForStop(STOPS[i].id)!=='approved'&&statusForStop(STOPS[i].id)!=='admin'){nextIndex=i;break;}
  }
  STOPS.forEach((stop,index)=>{
    const status=statusForStop(stop.id);
    const isLocked=!unlocked(index);
    const side=index%2===0?'left':'right';
    const row=document.createElement('div');
    row.className='road-stop '+side+' '+status;
    if(isLocked)row.classList.add('is-locked');
    if(index===nextIndex&&!isLocked)row.classList.add('is-next');

    const pin=document.createElement(isLocked?'div':'a');
    pin.className='road-pin';
    if(!isLocked){pin.href='#'+stop.id;}
    pin.innerHTML='<span class="pin-num">'+(index+1)+'</span><span class="pin-emoji">'+stop.emoji+'</span>';

    const label=document.createElement('div');
    label.className='road-label';
    const sub=isLocked?'🔒 '+stop.day:status==='approved'?'★ Done!':status==='pending'?'Waiting…':'Tap to play';
    label.innerHTML='<b></b><small></small>';
    label.querySelector('b').textContent=stop.title;
    label.querySelector('small').textContent=sub;

    row.append(pin,label);
    road.appendChild(row);
  });
}

function renderLeaderboard(){
  const rows=buildLeaderboard();
  els.leaderboardRows.innerHTML='';
  rows.forEach((row,index)=>{
    const tr=document.createElement('tr');
    tr.innerHTML='<td></td><td></td><td></td><td></td><td></td>';
    tr.children[0].textContent=String(index+1);
    tr.children[1].textContent=row.username;
    tr.children[2].textContent=String(row.points);
    tr.children[3].textContent=String(row.stops);
    tr.children[4].textContent=row.lastApproved?formatDate(row.lastApproved):'-';
    els.leaderboardRows.appendChild(tr);
  });
  els.leaderboardEmpty.classList.toggle('hidden',rows.some(row=>row.points>0));
}

function buildLeaderboard(){
  const scores=new Map();
  PLAYER_NAMES.forEach(name=>scores.set(name,{username:name,points:0,stops:0,lastApproved:''}));
  shared.submissions.forEach(item=>{
    if(item.status!=='approved')return;
    const row=scores.get(item.username)||{username:item.username,points:0,stops:0,lastApproved:''};
    row.points+=scoreWithBonus(item);
    row.stops+=1;
    if(timestamp(item.approvedAt||item.updatedAt)>timestamp(row.lastApproved))row.lastApproved=item.approvedAt||item.updatedAt;
    scores.set(item.username,row);
  });
  return [...scores.values()].sort((a,b)=>b.points-a.points||b.stops-a.stops||a.username.localeCompare(b.username));
}

function playerPoints(username){
  const sharedTotal=shared.submissions
    .filter(item=>item.username===username&&item.status==='approved')
    .reduce((total,item)=>total+scoreWithBonus(item),0);
  if(sharedTotal)return sharedTotal;
  return Object.values(progress.points).reduce((total,value)=>total+Number(value||0),0);
}

function renderAdminPanel(){
  if(!isAdmin())return;
  const pending=shared.submissions.filter(item=>item.status==='pending');
  els.adminRows.innerHTML='';
  pending.forEach(item=>{
    const stop=stopById(item.stopId);
    const row=document.createElement('article');
    row.className='admin-row';
    row.innerHTML=[
      '<div class="admin-main">',
      '<div><strong class="admin-title"></strong><span class="admin-meta"></span></div>',
      '<p class="admin-proof"></p>',
      '<div class="admin-photo"></div>',
      '</div>',
      '<div class="admin-controls">',
      '<label>Bonus <input class="bonus-input" type="number" min="0" max="25" step="5" value="0"></label>',
      '<button class="btn btn-primary approve-btn" type="button">Approve</button>',
      '<button class="btn btn-danger reject-btn" type="button">Reject</button>',
      '</div>'
    ].join('');
    row.querySelector('.admin-title').textContent=item.username+' - '+(stop?.title||item.stopTitle||item.stopId);
    row.querySelector('.admin-meta').textContent='Submitted '+formatDate(item.submittedAt)+' - '+SCORE_PER_STOP+' base points';
    row.querySelector('.admin-proof').textContent=item.proofName?'Photo: '+item.proofName:'No photo name recorded';
    const photo=row.querySelector('.admin-photo');
    if(item.proofImage){
      const img=document.createElement('img');
      img.src=item.proofImage;
      img.alt=item.username+' proof for '+(stop?.title||item.stopTitle||item.stopId);
      photo.appendChild(img);
    }
    row.querySelector('.approve-btn').addEventListener('click',()=>approveSubmission(item.id,row.querySelector('.bonus-input').value));
    row.querySelector('.reject-btn').addEventListener('click',()=>rejectSubmission(item.id));
    els.adminRows.appendChild(row);
  });
  els.adminEmpty.classList.toggle('hidden',pending.length>0);
}

function renderStops(){
  els.stops.innerHTML='';
  STOPS.forEach((stop,index)=>els.stops.appendChild(stopCard(stop,index)));
}

function stopCard(stop,index){
  const node=els.stopTemplate.content.cloneNode(true);
  const article=node.querySelector('.stop-card');
  const locked=!unlocked(index);
  const status=statusForStop(stop.id);
  article.id=stop.id;
  article.classList.toggle('locked-card',locked);
  article.classList.toggle('admin-reference',isAdmin());
  node.querySelector('.kicker').textContent=stop.day+' / stop '+(index+1)+' of '+STOPS.length;
  node.querySelector('h2').textContent=stop.title;
  node.querySelector('.subtitle').textContent=stop.loc;
  node.querySelector('.chips').innerHTML='<span>'+escapeHtml(stop.hotel)+'</span><span>'+escapeHtml(stop.loc)+'</span><span>'+escapeHtml(stop.day)+'</span>';
  node.querySelector('.facts').innerHTML=stop.facts.map(fact=>'<li>'+escapeHtml(fact)+'</li>').join('');
  node.querySelector('.credit').textContent=stop.credit;
  renderStatus(node,stop,index,status,locked);
  renderStopImage(node,stop);
  renderProof(node,stop);
  renderHunt(node,stop);
  renderActivity(node,stop);
  renderQuiz(node,stop);
  const submit=node.querySelector('.submit-stop');
  submit.addEventListener('click',()=>submitStop(stop,index));
  if(isAdmin()){
    submit.classList.add('hidden');
    disableStopInputs(node);
  }
  return node;
}

function renderStatus(node,stop,index,status,locked){
  const pill=node.querySelector('.status-pill');
  const approval=node.querySelector('.approval-box');
  const title=node.querySelector('.approval-title');
  const copy=node.querySelector('.approval-copy');
  const button=node.querySelector('.submit-stop');
  const complete=node.querySelector('.completeStatus');
  const lock=node.querySelector('.lock-overlay span');
  const labels={
    approved:['Approved','Next stop unlocked.'],
    pending:['Waiting for admin','This stop is in the approval queue.'],
    rejected:['Needs resubmission','Check the proof and send it again.'],
    ready:['Ready','Worth '+SCORE_PER_STOP+' points when approved.'],
    admin:['Reference','Admin approval is handled above.']
  };
  const [label,description]=labels[status]||labels.ready;
  pill.textContent=locked?'Locked':label;
  pill.className='status-pill '+(locked?'locked':status);
  title.textContent=locked?'Locked':label;
  copy.textContent=locked?lockReason(index):description;
  lock.textContent=lockReason(index);
  approval.className='approval-box '+(locked?'locked':status);
  complete.textContent=status==='approved'?'Approved for '+SCORE_PER_STOP+' points.':status==='pending'?'Submitted.':status==='rejected'?'Rejected. Resubmit when ready.':'';
  button.disabled=locked||status==='approved'||status==='pending';
  button.textContent=session?.test?'Complete in test mode':status==='rejected'?'Resubmit for approval':'Submit for approval';
}

function hueFromId(id){
  let h=0;
  for(let i=0;i<id.length;i++)h=(h*31+id.charCodeAt(i))%360;
  return h;
}

function renderStopImage(node,stop){
  const pane=node.querySelector('.image-pane');
  const img=node.querySelector('.stop-img');
  const fallback=node.querySelector('.image-fallback');
  // give every stop its own sunset-desert gradient
  const base=20+(hueFromId(stop.id)%40);   /* warm orange band 20-60 */
  const dusk=270+(hueFromId(stop.id)%60);   /* purple band 270-330 */
  pane.style.setProperty('--h1',base);
  pane.style.setProperty('--h2',dusk);
  fallback.querySelector('.fb-emoji').textContent=stop.emoji;
  fallback.querySelector('.fb-title').textContent=stop.title;
  img.alt=stop.title;
  img.referrerPolicy='no-referrer';
  const url=imageForStop(stop);
  if(!url){
    img.classList.add('hidden');
    fallback.classList.add('show');
    return;
  }
  img.addEventListener('error',()=>{
    img.classList.add('hidden');
    fallback.classList.add('show');
  });
  img.addEventListener('load',()=>{img.classList.remove('hidden');fallback.classList.remove('show');});
  img.src=url;
}

function imageForStop(stop){
  return stop.img||'';
}

function renderProof(node,stop){
  const input=node.querySelector('.photo');
  const status=node.querySelector('.proofStatus');
  const preview=node.querySelector('.proof-preview');
  const saved=progress.photos[stop.id];
  if(saved?.dataUrl){
    preview.src=saved.dataUrl;
    preview.classList.remove('hidden');
  }
  status.textContent=saved?'Saved photo: '+saved.name:'';
  input.addEventListener('change',async event=>{
    const file=event.target.files[0];
    if(!file)return;
    status.textContent='Saving photo preview...';
    try{
      const dataUrl=await imageToThumb(file);
      progress.photos[stop.id]={name:file.name,type:file.type,size:file.size,time:new Date().toISOString(),dataUrl};
      preview.src=dataUrl;
      preview.classList.remove('hidden');
      status.textContent='Saved photo: '+file.name;
      saveProgress();
    }catch{
      status.textContent='Could not read that image.';
    }
  });
}

function renderHunt(node,stop){
  const root=node.querySelector('.hunt');
  const savedPhotos=progress.huntPhotos[stop.id]||{};
  stop.hunt.forEach((item,index)=>{
    const wrap=document.createElement('div');
    wrap.className='hunt-item'+(savedPhotos[index]?.dataUrl?' done':'');

    const head=document.createElement('div');
    head.className='hunt-item-head';
    head.innerHTML='<span class="hunt-check">'+(savedPhotos[index]?.dataUrl?'✓':'')+'</span><span class="hunt-text"></span>';
    head.querySelector('.hunt-text').textContent=item;

    const thumb=document.createElement('img');
    thumb.className='hunt-thumb'+(savedPhotos[index]?.dataUrl?' show':'');
    if(savedPhotos[index]?.dataUrl)thumb.src=savedPhotos[index].dataUrl;

    const input=document.createElement('input');
    input.type='file';
    input.accept='image/*';
    input.capture='environment';
    input.addEventListener('change',async event=>{
      const file=event.target.files[0];
      if(!file)return;
      try{
        const dataUrl=await imageToThumb(file);
        progress.huntPhotos[stop.id]={...(progress.huntPhotos[stop.id]||{}),[index]:{name:file.name,dataUrl}};
        progress.hunt[stop.id]={...(progress.hunt[stop.id]||{}),[index]:true};
        thumb.src=dataUrl;
        thumb.classList.add('show');
        wrap.classList.add('done');
        wrap.querySelector('.hunt-check').textContent='✓';
        saveProgress();
      }catch{
        wrap.querySelector('.hunt-check').textContent='!';
      }
    });

    wrap.append(head,input,thumb);
    root.appendChild(wrap);
  });
}

function renderActivity(node,stop){
  node.querySelector('.activity-block h3').textContent=stop.activity.title;
  node.querySelector('.activity-block p').textContent=stop.activity.prompt;
  const slot=node.querySelector('.activitySlot');
  if(stop.activity.type==='quick'){
    const textarea=document.createElement('textarea');
    textarea.placeholder='Write your answer here...';
    textarea.value=progress.quick[stop.id]||'';
    textarea.addEventListener('input',()=>{
      progress.quick[stop.id]=textarea.value;
      saveProgress();
    });
    slot.appendChild(textarea);
  }
  if(stop.activity.type==='sketch'){
    const wrap=document.createElement('div');
    wrap.className='sketch-wrap';
    wrap.innerHTML='<canvas class="sketch" width="900" height="520"></canvas><button class="btn btn-secondary" type="button">Clear sketch</button>';
    slot.appendChild(wrap);
    setupSketch(wrap.querySelector('canvas'),wrap.querySelector('button'),stop.id);
  }
  if(stop.activity.type==='dot'){
    const wrap=document.createElement('div');
    wrap.className='sketch-wrap';
    wrap.innerHTML='<canvas class="dot" width="900" height="520"></canvas><p class="proofStatus"></p>';
    slot.appendChild(wrap);
    setupDot(wrap.querySelector('canvas'),wrap.querySelector('p'),stop.id);
  }
}

function renderQuiz(node,stop){
  const root=node.querySelector('.quiz');
  const result=node.querySelector('.quizResult');
  const saved=progress.quiz[stop.id]||{answers:{},checked:false,correct:false};
  stop.quiz.forEach((question,index)=>{
    const block=document.createElement('div');
    block.className='question';
    const prompt=document.createElement('p');
    prompt.textContent=(index+1)+'. '+question[0];
    const options=document.createElement('div');
    options.className='options';
    (question[2]||['true','false']).forEach(value=>{
      const label=document.createElement('label');
      const input=document.createElement('input');
      const span=document.createElement('span');
      input.type='radio';
      input.name=stop.id+'-'+index;
      input.value=value;
      input.checked=saved.answers[index]===value;
      span.textContent=value==='true'?'True':value==='false'?'False':value;
      input.addEventListener('change',()=>{
        progress.quiz[stop.id]=progress.quiz[stop.id]||{answers:{},checked:false,correct:false};
        progress.quiz[stop.id].answers[index]=value;
        progress.quiz[stop.id].checked=false;
        progress.quiz[stop.id].correct=false;
        saveProgress();
      });
      label.append(input,span);
      options.appendChild(label);
    });
    block.append(prompt,options);
    root.appendChild(block);
  });
  if(saved.checked)result.textContent=saved.correct?'Quiz correct.':'Not correct yet.';
  node.querySelector('.check').addEventListener('click',()=>checkQuiz(stop,result,true));
}

function checkQuiz(stop,result,punish){
  const current=progress.quiz[stop.id]||{answers:{}};
  if(stop.quiz.some((_,index)=>current.answers[index]===undefined)){
    result.textContent='Answer every question first.';
    return false;
  }
  const correct=stop.quiz.every((question,index)=>current.answers[index]===question[1]);
  progress.quiz[stop.id]={answers:current.answers,checked:true,correct};
  saveProgress();
  if(correct){
    result.textContent='Quiz correct.';
    return true;
  }
  if(session.test||!punish){
    result.textContent='Not quite. Try again.';
    return false;
  }
  result.textContent='Wrong answer. Back to the beginning...';
  setTimeout(()=>resetProgress('Wrong answer - back to the start.'),450);
  return false;
}

function validateStop(stop,index){
  if(!unlocked(index))return lockReason(index);
  if(!session.test&&!progress.photos[stop.id])return 'Add your arrival photo first.';
  const huntPhotos=progress.huntPhotos[stop.id]||{};
  if(!session.test&&!stop.hunt.every((_,huntIndex)=>huntPhotos[huntIndex]?.dataUrl))return 'Add a photo for every scavenger hunt item first.';
  if(stop.activity.type==='quick'&&!(progress.quick[stop.id]||'').trim())return 'Fill in the activity first.';
  if(stop.activity.type==='sketch'&&!progress.sketch[stop.id])return 'Do the sketch first.';
  if(stop.activity.type==='dot'&&!progress.dot[stop.id]?.complete)return 'Finish the dot-to-dot first.';
  if(!progress.quiz[stop.id]?.checked)return 'Check the quiz answers first.';
  if(!progress.quiz[stop.id]?.correct)return 'Quiz must be correct first.';
  return '';
}

async function submitStop(stop,index){
  if(session.test){
    progress.completed[stop.id]=true;
    progress.points[stop.id]=SCORE_PER_STOP;
    saveProgress();
    renderApp();
    scrollToNext(index);
    return;
  }
  const article=document.getElementById(stop.id);
  const result=article.querySelector('.quizResult');
  const status=article.querySelector('.completeStatus');
  if(!progress.quiz[stop.id]?.checked)checkQuiz(stop,result,true);
  const problem=validateStop(stop,index);
  if(problem){
    status.textContent=problem;
    return;
  }
  const submission=buildSubmission(stop);
  upsertSubmission(submission);
  progress.submitted[stop.id]={id:submission.id,status:'pending',score:SCORE_PER_STOP,submittedAt:submission.submittedAt};
  saveProgress();
  renderApp();
  await postRemote({action:'submit',submission});
}

function buildSubmission(stop){
  const photo=progress.photos[stop.id]||{};
  return {
    id:session.username+'-'+stop.id+'-'+Date.now(),
    username:session.username,
    stopId:stop.id,
    stopTitle:stop.title,
    day:stop.day,
    hotel:stop.hotel,
    score:SCORE_PER_STOP,
    bonus:0,
    status:'pending',
    submittedAt:new Date().toISOString(),
    updatedAt:new Date().toISOString(),
    proofName:photo.name||'',
    proofImage:photo.dataUrl||'',
    activity:activitySummary(stop)
  };
}

function activitySummary(stop){
  if(stop.activity.type==='quick')return (progress.quick[stop.id]||'').trim();
  if(stop.activity.type==='sketch')return 'Sketch completed';
  if(stop.activity.type==='dot')return 'Dot-to-dot completed';
  return '';
}

function upsertSubmission(submission){
  const existing=shared.submissions.findIndex(item=>item.username===submission.username&&item.stopId===submission.stopId&&item.status==='pending');
  if(existing>=0)shared.submissions[existing]=submission;
  else shared.submissions.push(submission);
  saveShared();
}

async function approveSubmission(id,bonusValue){
  const bonus=Math.max(0,Math.min(25,Number(bonusValue)||0));
  updateSubmission(id,{status:'approved',bonus,approvedAt:new Date().toISOString(),approvedBy:session.username,updatedAt:new Date().toISOString()});
  renderApp();
  await postRemote({action:'approve',id,bonus,approvedBy:session.username,adminKey:session.adminKey});
}

async function rejectSubmission(id){
  updateSubmission(id,{status:'rejected',rejectedAt:new Date().toISOString(),approvedBy:session.username,updatedAt:new Date().toISOString()});
  renderApp();
  await postRemote({action:'reject',id,approvedBy:session.username,adminKey:session.adminKey});
}

function updateSubmission(id,updates){
  const index=shared.submissions.findIndex(item=>item.id===id);
  if(index<0)return;
  shared.submissions[index]={...shared.submissions[index],...updates};
  saveShared();
}

async function syncShared(){
  if(!CONFIG.sheetEndpoint){
    loadShared();
    applySharedToProgress();
    renderApp();
    return;
  }
  els.syncStatus.textContent='Syncing...';
  try{
    const url=new URL(CONFIG.sheetEndpoint);
    url.searchParams.set('action','state');
    url.searchParams.set('t',Date.now().toString());
    const response=await fetch(url.toString());
    const data=await response.json();
    shared=normaliseShared(data);
    saveShared();
    els.syncStatus.textContent='Synced with sheet.';
  }catch{
    els.syncStatus.textContent='Sheet sync failed. Using local data.';
    loadShared();
  }
  applySharedToProgress();
  renderApp();
}

async function postRemote(payload){
  if(!CONFIG.sheetEndpoint)return null;
  try{
    const response=await fetch(CONFIG.sheetEndpoint,{
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify(payload)
    });
    const data=await response.json();
    if(data?.submissions){
      shared=normaliseShared(data);
      saveShared();
      renderApp();
    }
    return data;
  }catch{
    els.syncStatus.textContent='Saved locally. Sheet sync is not reachable.';
    return null;
  }
}

function normaliseShared(data){
  const clean=freshShared();
  clean.updatedAt=data?.updatedAt||null;
  clean.submissions=Array.isArray(data?.submissions)?data.submissions.map(item=>({
    id:String(item.id||item.ID||''),
    username:String(item.username||item.Username||''),
    stopId:String(item.stopId||item.StopID||''),
    stopTitle:String(item.stopTitle||item.StopTitle||''),
    day:String(item.day||item.Day||''),
    hotel:String(item.hotel||item.Hotel||''),
    score:Number(item.score||item.Score||SCORE_PER_STOP),
    bonus:Number(item.bonus||item.Bonus||0),
    status:String(item.status||item.Status||'pending').toLowerCase(),
    submittedAt:String(item.submittedAt||item.SubmittedAt||''),
    updatedAt:String(item.updatedAt||item.UpdatedAt||''),
    approvedAt:String(item.approvedAt||item.ApprovedAt||''),
    approvedBy:String(item.approvedBy||item.ApprovedBy||''),
    proofName:String(item.proofName||item.ProofName||''),
    proofImage:String(item.proofImage||item.ProofImage||item.photoUrl||item.PhotoUrl||''),
    activity:String(item.activity||item.Activity||'')
  })).filter(item=>item.id&&item.username&&item.stopId):[];
  return clean;
}

function scoreWithBonus(item){
  return Number(item.score||SCORE_PER_STOP)+Number(item.bonus||0);
}

function renderReward(){
  const done=STOPS.every(stop=>statusForStop(stop.id)==='approved');
  els.amazonBtn.disabled=!done;
  els.reward.classList.toggle('locked',!done);
  els.rewardText.textContent=done?'The route is complete. Open the vault.':'Complete every stop and get admin approval to unlock the final message.';
}

function scrollToNext(index){
  const next=STOPS[index+1];
  setTimeout(()=>$(next?'#'+next.id:'#reward')?.scrollIntoView({behavior:'smooth',block:'start'}),150);
}

function resetProgress(message='Progress reset.'){
  progress=freshProgress();
  saveProgress();
  renderApp();
  alert(message);
  $('.app-header')?.scrollIntoView({behavior:'smooth'});
}

function setupSketch(canvas,clear,id){
  const ctx=canvas.getContext('2d');
  let drawing=false;
  function background(){
    ctx.fillStyle='#fffaf0';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle='rgba(30,40,52,.14)';
    ctx.lineWidth=2;
    for(let x=40;x<canvas.width;x+=40){
      ctx.beginPath();
      ctx.moveTo(x,0);
      ctx.lineTo(x,canvas.height);
      ctx.stroke();
    }
    for(let y=40;y<canvas.height;y+=40){
      ctx.beginPath();
      ctx.moveTo(0,y);
      ctx.lineTo(canvas.width,y);
      ctx.stroke();
    }
  }
  function loadSketch(){
    if(progress.sketch[id]){
      const image=new Image();
      image.onload=()=>ctx.drawImage(image,0,0);
      image.src=progress.sketch[id];
    }else{
      background();
    }
  }
  function pos(event){
    const rect=canvas.getBoundingClientRect();
    return {x:(event.clientX-rect.left)*canvas.width/rect.width,y:(event.clientY-rect.top)*canvas.height/rect.height};
  }
  function start(event){
    event.preventDefault();
    drawing=true;
    const point=pos(event);
    ctx.beginPath();
    ctx.moveTo(point.x,point.y);
  }
  function move(event){
    if(!drawing)return;
    event.preventDefault();
    const point=pos(event);
    ctx.lineWidth=7;
    ctx.lineCap='round';
    ctx.strokeStyle='#20252d';
    ctx.lineTo(point.x,point.y);
    ctx.stroke();
    progress.sketch[id]=canvas.toDataURL('image/png');
    saveProgress();
  }
  canvas.addEventListener('pointerdown',start);
  canvas.addEventListener('pointermove',move);
  window.addEventListener('pointerup',()=>{drawing=false});
  clear.addEventListener('click',()=>{
    delete progress.sketch[id];
    saveProgress();
    background();
  });
  loadSketch();
}

function setupDot(canvas,status,id){
  const ctx=canvas.getContext('2d');
  const points=[[180,330],[250,240],[340,205],[430,238],[520,180],[610,245],[720,270],[625,310],[540,300],[470,375],[400,300],[310,310]];
  let current=progress.dot[id]?.current||0;
  let complete=Boolean(progress.dot[id]?.complete);
  function draw(){
    ctx.clearRect(0,0,900,520);
    ctx.fillStyle='#fffaf0';
    ctx.fillRect(0,0,900,520);
    ctx.fillStyle='rgba(217,63,49,.14)';
    ctx.beginPath();
    ctx.moveTo(0,420);
    ctx.bezierCurveTo(210,360,290,470,470,405);
    ctx.bezierCurveTo(640,335,760,410,900,330);
    ctx.lineTo(900,520);
    ctx.lineTo(0,520);
    ctx.fill();
    ctx.lineWidth=5;
    ctx.strokeStyle='#d93f31';
    ctx.beginPath();
    for(let index=0;index<current;index++){
      const [x,y]=points[index];
      if(index===0)ctx.moveTo(x,y);
      else ctx.lineTo(x,y);
    }
    if(complete)ctx.closePath();
    ctx.stroke();
    points.forEach(([x,y],index)=>{
      ctx.beginPath();
      ctx.fillStyle=index<current?'#1d8a62':'#20252d';
      ctx.arc(x,y,17,0,Math.PI*2);
      ctx.fill();
      ctx.fillStyle='#fff';
      ctx.font='bold 18px system-ui';
      ctx.textAlign='center';
      ctx.textBaseline='middle';
      ctx.fillText(String(index+1),x,y+1);
    });
    status.textContent=complete?'Dot-to-dot completed.':'Next dot: '+(current+1);
  }
  canvas.addEventListener('click',event=>{
    if(complete)return;
    const rect=canvas.getBoundingClientRect();
    const x=(event.clientX-rect.left)*900/rect.width;
    const y=(event.clientY-rect.top)*520/rect.height;
    const [px,py]=points[current];
    if(Math.hypot(x-px,y-py)<38){
      current++;
      complete=current>=points.length;
      progress.dot[id]={current,complete};
      saveProgress();
      draw();
    }else{
      status.textContent='Wrong dot. Look for number '+(current+1)+'.';
    }
  });
  draw();
}

function imageToThumb(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>{
      const image=new Image();
      image.onload=()=>{
        const max=520;
        const scale=Math.min(1,max/Math.max(image.width,image.height));
        const canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(image.width*scale));
        canvas.height=Math.max(1,Math.round(image.height*scale));
        const ctx=canvas.getContext('2d');
        ctx.drawImage(image,0,0,canvas.width,canvas.height);
        resolve(canvas.toDataURL('image/jpeg',0.68));
      };
      image.onerror=reject;
      image.src=reader.result;
    };
    reader.onerror=reject;
    reader.readAsDataURL(file);
  });
}

function disableStopInputs(node){
  node.querySelectorAll('input,textarea,button').forEach(control=>control.disabled=true);
}

function revealOnScroll(){
  if(observer)observer.disconnect();
  if(!('IntersectionObserver'in window)){
    document.querySelectorAll('.reveal').forEach(item=>item.classList.add('show'));
    return;
  }
  observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
    if(entry.isIntersecting)entry.target.classList.add('show');
  }),{threshold:.12});
  document.querySelectorAll('.reveal').forEach(item=>observer.observe(item));
}

function formatDate(value){
  if(!value)return '-';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '-';
  return date.toLocaleString([], {dateStyle:'medium',timeStyle:'short'});
}

function escapeHtml(value){
  return String(value).replace(/[&<>"']/g,char=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[char]));
}

function exportCsv(){
  const rows=[['ID','Username','Stop ID','Stop','Status','Score','Bonus','Submitted','Approved','Approved By','Proof Name','Proof Image']];
  shared.submissions.forEach(item=>rows.push([
    item.id,item.username,item.stopId,item.stopTitle,item.status,item.score,item.bonus,item.submittedAt,item.approvedAt,item.approvedBy,item.proofName,item.proofImage
  ]));
  const csv=rows.map(row=>row.map(value=>'"'+String(value??'').replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const link=document.createElement('a');
  link.href=URL.createObjectURL(blob);
  link.download='route66-leaderboard.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

async function doLogin(name,password){
  if(name.trim().toLowerCase()==='test'){
    session={username:'test',role:'player',test:true};
    sessionStorage.setItem(STORAGE.session,JSON.stringify(session));
    await openSite();
    return true;
  }
  const accountName=normalName(name);
  if(!accountName)return false;
  const account=ACCOUNTS[accountName];
  const hashed=await sha256(password);
  if(hashed!==account.hash)return false;
  session={username:accountName,role:account.role,test:false};
  if(account.role==='admin')session.adminKey=password;
  sessionStorage.setItem(STORAGE.session,JSON.stringify(session));
  await openSite();
  return true;
}

async function openSite(){
  loadProgress();
  loadShared();
  els.login.classList.add('hidden');
  els.site.classList.remove('hidden');
  renderApp();
  await syncShared();
}

function bindEvents(){
  els.loginForm.addEventListener('submit',async event=>{
    event.preventDefault();
    els.loginError.textContent='';
    const ok=await doLogin(els.username.value,els.password.value);
    if(!ok)els.loginError.textContent='Wrong username or password.';
  });
  els.logoutBtn.addEventListener('click',()=>{
    sessionStorage.removeItem(STORAGE.session);
    session=null;
    els.site.classList.add('hidden');
    els.login.classList.remove('hidden');
  });
  els.resetBtn.addEventListener('click',()=>{
    if(confirm('Reset local progress for this user?'))resetProgress('Progress reset.');
  });
  els.printBtn.addEventListener('click',()=>window.print());
  els.syncBtn.addEventListener('click',syncShared);
  els.exportCsvBtn.addEventListener('click',exportCsv);
  els.adminRefreshBtn.addEventListener('click',syncShared);
  els.amazonBtn.addEventListener('click',()=>{
    if(!els.amazonBtn.disabled)els.voucher.classList.remove('hidden');
  });
}

bindEvents();
const previewParams=new URLSearchParams(location.search);
if(previewParams.get('preview')==='test'){
  session={username:'test',role:'player',test:true};
  sessionStorage.setItem(STORAGE.session,JSON.stringify(session));
  openSite();
}else{
  try{
    const saved=JSON.parse(sessionStorage.getItem(STORAGE.session)||'null');
    if(saved?.username){
      session=saved;
      openSite();
    }
  }catch{}
}
