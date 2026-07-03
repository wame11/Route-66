/* ===== GAMES PAGE: Off-the-road bonus 5-minute arcade + music + quiz battles ===== */

/* GAME 9: BRICK BREAKER — Route 66 signs */
function egBrickBreaker(stage, g, report) {
  const c = makeCanvas(stage, 380);
  const ctx = c.getContext('2d');
  let raf, run = false, paddleX = 280, ballX = 300, ballY = 350, ballVX = 3.5, ballVY = -5;
  let bricks = [], score = 0, won = false;
  
  function initBricks() {
    bricks = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 6; col++) {
        bricks.push({ x: col * 95 + 8, y: row * 30 + 15, w: 85, h: 25, hit: false });
      }
    }
  }
  
  function frame() {
    ballX += ballVX;
    ballY += ballVY;
    if (ballX <= 10 || ballX >= 590) ballVX *= -1;
    if (ballY <= 10) ballVY *= -1;
    if (ballY >= 370 && ballX >= paddleX && ballX <= paddleX + 80) ballVY *= -1;
    if (ballY > 380) return over();
    
    bricks.forEach(b => {
      if (!b.hit && ballX > b.x && ballX < b.x + b.w && ballY > b.y && ballY < b.y + b.h) {
        b.hit = true;
        ballVY *= -1;
        score += 10;
        if (!won && score >= g.target) { won = true; report(score, true); }
      }
    });
    
    ctx.clearRect(0, 0, 600, 380);
    ctx.fillStyle = '#f6b85f';
    ctx.fillRect(0, 0, 600, 380);
    
    ctx.fillStyle = '#241a22';
    bricks.forEach(b => {
      if (!b.hit) {
        ctx.fillStyle = score > 40 ? '#e8651f' : '#5f8a4a';
        ctx.fillRect(b.x, b.y, b.w, b.h);
      }
    });
    
    ctx.fillStyle = '#ffc24b';
    ctx.beginPath();
    ctx.arc(ballX, ballY, 6, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#8a6b52';
    ctx.fillRect(paddleX, 365, 80, 10);
    
    ctx.fillStyle = '#3a2417';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Score: ' + score, 10, 30);
    
    raf = requestAnimationFrame(frame);
  }
  
  function over() {
    run = false;
    cancelAnimationFrame(raf);
    report(score, won);
    ctx.fillStyle = 'rgba(36,26,34,.78)';
    ctx.fillRect(0, 0, 600, 380);
    ctx.fillStyle = '#ffc24b';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over! Score: ' + score, 300, 190);
  }
  
  c.addEventListener('pointermove', e => {
    const r = c.getBoundingClientRect();
    paddleX = Math.max(0, Math.min(520, (e.clientX - r.left) * 600 / r.width - 40));
  });
  c.addEventListener('pointerdown', () => {
    if (!run) {
      initBricks();
      score = 0;
      won = false;
      ballX = 300;
      ballY = 350;
      ballVX = 3.5;
      ballVY = -5;
      run = true;
      frame();
    }
  });
  
  ctx.fillStyle = '#f6b85f';
  ctx.fillRect(0, 0, 600, 380);
  ctx.fillStyle = '#3a2417';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Tap to start · Slide to aim', 300, 190);
  initBricks();
  hudLine(stage).innerHTML = 'Smash Route 66 signs — endless bricks!';
  
  return { stop() { run = false; cancelAnimationFrame(raf); } };
}

/* GAME 11: WORDLE CLONE — Route 66 daily word */
function egWordle(stage, g, report) {
  const words = ['ROUTE', 'DRIVE', 'VISTA', 'VEGAS', 'COAST', 'NEON', 'MOTEL', 'DUSTY', 'SPEED'];
  const dailyIdx = Math.floor(Date.now() / 86400000) % words.length;
  const target = words[dailyIdx];
  
  stage.innerHTML = '<div class="game-hud"></div><div class="wordle-board"></div><div class="wordle-keys"></div>';
  const hud = stage.querySelector('.game-hud');
  const board = stage.querySelector('.wordle-board');
  const keys = stage.querySelector('.wordle-keys');
  
  let guesses = [];
  let won = false;
  
  for (let i = 0; i < 6; i++) {
    const row = document.createElement('div');
    row.className = 'wordle-row';
    for (let j = 0; j < 5; j++) {
      const cell = document.createElement('div');
      cell.className = 'wordle-cell';
      row.appendChild(cell);
    }
    board.appendChild(row);
  }
  
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  alphabet.split('').forEach(letter => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wordle-key';
    btn.textContent = letter;
    btn.addEventListener('click', () => guessLetter(letter, btn));
    keys.appendChild(btn);
  });
  
  function guessLetter(letter, btn) {
    if (won || guesses.length === 6) return;
    if (!guesses[guesses.length]) guesses[guesses.length] = [];
    const guess = guesses[guesses.length - 1];
    if (guess.length < 5) {
      guess.push(letter);
      updateDisplay();
    }
  }
  
  function updateDisplay() {
    board.querySelectorAll('.wordle-cell').forEach((cell, idx) => {
      const guessIdx = Math.floor(idx / 5);
      const posIdx = idx % 5;
      if (guesses[guessIdx] && guesses[guessIdx][posIdx]) {
        cell.textContent = guesses[guessIdx][posIdx];
        const correct = guesses[guessIdx][posIdx] === target[posIdx];
        const inWord = !correct && target.includes(guesses[guessIdx][posIdx]);
        cell.className = 'wordle-cell ' + (correct ? 'correct' : inWord ? 'present' : 'absent');
      }
    });
    hud.innerHTML = 'Guess ' + (guesses.length) + ' / 6';
  }
  
  return { stop() {} };
}

/* GAME 13 VARIANT: HEAD-TO-HEAD IMAGE GUESS (landscape, hold to head) */
function egHeadGuess(stage, g, report) {
  const images = ['🦖', '🌵', '🚗', '⛽', '🏜️', '🎰', '🏨', '⭐'];
  let score = 0, won = false, rounds = 0, maxRounds = 8;
  const hud = hudLine(stage);
  
  function runRound() {
    if (rounds >= maxRounds) {
      report(score, true);
      hud.innerHTML = '🏆 Game over! Score: ' + score;
      return;
    }
    
    const img = images[Math.floor(Math.random() * images.length)];
    hud.innerHTML = '<span style="font-size:2.4rem;display:block;margin:20px">' + img + '</span><p>Hold phone to your head (landscape) — other player guesses!</p><button type="button" class="btn btn-primary" style="margin-top:20px">Got it right? (+1)</button>';
    
    stage.querySelector('button').addEventListener('click', () => {
      score++;
      rounds++;
      runRound();
    });
  }
  
  hud.innerHTML = '👥 <b>2+ players:</b> One person holds the phone to their head in landscape. Other player(s) see the emoji/image and shout it out. Tap when right!<br><button type="button" class="btn btn-primary" style="margin-top:14px">Ready to play!</button>';
  stage.querySelector('button').addEventListener('click', runRound);
  
  return { stop() {} };
}

/* MUSIC SEARCH — integrates YouTube Music search */
function openMusicPlayer() {
  if (document.querySelector('.music-modal')) return;
  
  const modal = document.createElement('div');
  modal.className = 'music-modal';
  modal.innerHTML = `
    <div class="music-card">
      <button type="button" class="den-close">✕</button>
      <div class="music-head">🎵 Family Jukebox</div>
      <input type="text" class="music-search" placeholder="Type a song name... (adds 'lyrics' automatically)" />
      <button type="button" class="btn btn-primary music-btn">Search on YouTube Music</button>
      <div class="music-results"></div>
      <p class="music-hint">🎵 Enter any song and we'll search YouTube Music. First player to type each day gets +5 chips!</p>
    </div>
  `;
  document.body.appendChild(modal);
  
  const input = modal.querySelector('.music-search');
  const btn = modal.querySelector('.music-btn');
  const results = modal.querySelector('.music-results');
  
  btn.addEventListener('click', () => {
    const query = input.value.trim();
    if (!query) return;
    
    // Add 'lyrics' to the query for better YouTube Music results
    const searchQuery = encodeURIComponent(query + ' lyrics');
    const ytMusicUrl = `https://music.youtube.com/search?q=${searchQuery}`;
    
    // Show confirmation and open in new tab
    results.innerHTML = `
      <div class="music-result">
        <p><strong>Opening YouTube Music...</strong></p>
        <p><a href="${ytMusicUrl}" target="_blank">🎵 Search: "${query}" on YouTube Music</a></p>
        <p style="font-size:0.8rem;color:var(--muted);margin-top:10px;">📝 Come back when you've played your song!</p>
      </div>
    `;
    
    window.open(ytMusicUrl, '_blank');
    
    // Award chips for music search (once per day per player)
    const today = new Date().toDateString();
    const musicKey = 'music-play-' + session.username + '-' + today;
    if (!localStorage.getItem(musicKey)) {
      progress.chips = (progress.chips || 0) + 5;
      localStorage.setItem(musicKey, 'true');
      saveProgress();
      updateChips();
      bearShout('🎵 +5 chips for bringing the hits! 🎶');
    }
  });
  
  modal.querySelector('.den-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

/* BONUS GAME: ROUTE 66 QUIZ BATTLE — multiplayer (2+) Blooket-style */
function openQuizBattle() {
  if (document.querySelector('.quiz-battle')) return;
  
  const ROUTE66_QUESTIONS = [
    { q: 'Which desert runs alongside Route 66 in Arizona?', a: 'Mojave', opts: ['Mojave', 'Sahara', 'Atacama'] },
    { q: 'What year did Route 66 officially become a highway?', a: '1926', opts: ['1926', '1950', '1902'] },
    { q: 'Which city is famous for the EL RANCHO HOTEL?', a: 'Gallup', opts: ['Gallup', 'Kingman', 'Seligman'] },
    { q: 'What animal wanders the streets of Oatman, AZ?', a: 'Burros', opts: ['Burros', 'Coyotes', 'Bighorn sheep'] },
    { q: 'Monument Valley sits on the border of which two states?', a: 'Arizona & Utah', opts: ['Arizona & Utah', 'Nevada & California', 'New Mexico & Colorado'] },
    { q: 'How many miles is Route 66 roughly?', a: '2,448', opts: ['2,448', '1,500', '3,200'] },
    { q: 'Which diner was saved by Angel Delgadillo?', a: 'Seligman Barber Shop & Route 66', opts: ['Seligman Barber Shop & Route 66', 'Williams Cafe', 'Kingman Diner'] },
  ];
  
  const modal = document.createElement('div');
  modal.className = 'quiz-battle';
  modal.innerHTML = `
    <div class="qb-card">
      <button type="button" class="den-close">✕</button>
      <div class="qb-head">🎯 Route 66 Quiz Battle</div>
      <p class="qb-rule">Answer questions correctly to earn mystery boxes. Gamble boxes to win/lose chips!</p>
      <div class="qb-setup">
        <label>How many players? <input type="number" class="qb-players" value="2" min="2" max="4" /></label>
        <button type="button" class="btn btn-primary qb-start">Start Battle</button>
      </div>
      <div class="qb-content hidden"></div>
    </div>
  `;
  document.body.appendChild(modal);
  
  let players = [];
  let currentQ = 0;
  let scores = {};
  
  modal.querySelector('.qb-start').addEventListener('click', () => {
    const count = parseInt(modal.querySelector('.qb-players').value);
    if (count < 2 || count > 4) return;
    
    for (let i = 0; i < count; i++) {
      players.push({ name: 'Player ' + (i + 1), score: 0, boxes: 0 });
      scores['Player ' + (i + 1)] = 0;
    }
    
    modal.querySelector('.qb-setup').classList.add('hidden');
    modal.querySelector('.qb-content').classList.remove('hidden');
    runQuestion();
  });
  
  function runQuestion() {
    if (currentQ >= ROUTE66_QUESTIONS.length) return endBattle();
    
    const q = ROUTE66_QUESTIONS[currentQ];
    const content = modal.querySelector('.qb-content');
    
    content.innerHTML = `
      <div class="qb-progress">Q${currentQ + 1}/${ROUTE66_QUESTIONS.length}</div>
      <div class="qb-question">${q.q}</div>
      <div class="qb-options">
        ${q.opts.map((opt, i) => `<button type="button" class="qb-opt" data-correct="${opt === q.a}">${opt}</button>`).join('')}
      </div>
      <div class="qb-scores">
        ${players.map(p => `<div>${p.name}: ${p.score} pts · 📦 ${p.boxes}</div>`).join('')}
      </div>
    `;
    
    content.querySelectorAll('.qb-opt').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        const correct = btn.dataset.correct === 'true';
        if (correct) {
          players[currentQ % players.length].score++;
          players[currentQ % players.length].boxes++;
          content.innerHTML += '<p style="color:green;font-weight:bold;">✓ Correct! +1 box</p>';
        } else {
          content.innerHTML += '<p style="color:red;font-weight:bold;">✗ Wrong!</p>';
        }
        
        setTimeout(() => {
          currentQ++;
          runQuestion();
        }, 1200);
      });
    });
  }
  
  function endBattle() {
    const winner = players.reduce((a, b) => a.score > b.score ? a : b);
    const content = modal.querySelector('.qb-content');
    content.innerHTML = `
      <div style="text-align:center;padding:20px">
        <p style="font-size:1.8rem;font-weight:bold">🏆 Winner: ${winner.name}</p>
        <p>${winner.score} correct answers!</p>
        ${players.map(p => `<p>${p.name}: ${p.score} pts · ${p.boxes} mystery boxes</p>`).join('')}
        <button type="button" class="btn btn-primary" style="margin-top:14px;width:100%">Play Again</button>
      </div>
    `;
    
    content.querySelector('button').addEventListener('click', () => modal.remove());
  }
  
  modal.querySelector('.den-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

/* BONUS: CRYPTO HACK STYLE HACKING GAME */
function egCryptoHack(stage, g, report) {
  stage.innerHTML = '<div class="game-hud"></div><div class="hack-grid"></div>';
  const hud = stage.querySelector('.game-hud');
  const grid = stage.querySelector('.hack-grid');
  
  const tiles = ['🔓', '🔒', '🔒', '⚡', '💰', '🛡️', '❌', '🔑', '⚡', '🔒'];
  let score = 0, moves = 0, won = false, locked = false;
  
  const shuffled = tiles.sort(() => Math.random() - 0.5);
  
  shuffled.forEach((icon, i) => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'hack-tile';
    tile.textContent = '?';
    tile.dataset.icon = icon;
    tile.addEventListener('click', () => {
      if (locked || tile.classList.contains('found')) return;
      tile.textContent = icon;
      tile.classList.add('revealed');
      moves++;
      
      if (icon === '💰') { score += 10; tile.classList.add('found'); tile.textContent = '💰'; }
      if (icon === '❌') { score = Math.max(0, score - 5); }
      if (icon === '⚡') { score += 5; }
      
      hud.innerHTML = 'Score <b>' + score + '</b> · Moves ' + moves + (won ? ' · 🏆' : '');
      
      if (!won && score >= g.target) { won = true; report(score, true); }
      
      setTimeout(() => {
        if (!tile.classList.contains('found')) {
          tile.textContent = '?';
          tile.classList.remove('revealed');
        }
      }, 800);
    });
    grid.appendChild(tile);
  });
  
  hud.innerHTML = 'Find the 💰 and avoid ❌ to reach ' + g.target;
  return { stop() {} };
}
