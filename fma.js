// fma.js

// ---- Initialize Firebase ----
const firebaseConfig = {
  apiKey: "AIzaSyBCVNoQO6IZtvfHBEl9UkSAYNHqlvJWA9s",
  authDomain: "olympustrain-2fdbb.firebaseapp.com",
  projectId: "olympustrain-2fdbb",
  storageBucket: "olympustrain-2fdbb.firebasestorage.app",
  messagingSenderId: "45269833079",
  appId: "1:45269833079:web:09559f64361350cf8c7d72"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

async function ensureExcelJS() {
  if (typeof ExcelJS === 'undefined') {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/exceljs/dist/exceljs.min.js';
      script.onload  = () => resolve();
      script.onerror = () => reject(new Error('Failed to load ExcelJS'));
      document.head.appendChild(script);
    });
  }
}

// ---- Global session/log state ----
let statsCache = null;
let sessionStarted = false;
let username = null;

// ---- Auth & Greeting ----
auth.onAuthStateChanged(async user => {
  if (!user) {
    window.location.href = '/';
  } else {
    showGreeting(user);
    username = user.displayName || user.email.split('@')[0];

    // Live log listener
    try {
      db.collection('users').doc(user.uid).collection('logs')
        .orderBy('time', 'asc')
        .onSnapshot(snap => {
          const box = document.getElementById('session-log');
          if (!box) return;
          box.innerHTML = "";
          snap.forEach(doc => {
            const d = doc.data();
            let ts = d.time;
            let dateObj;
            if (ts && typeof ts.toDate === 'function') {
              dateObj = ts.toDate();
            } else {
              // fallback if timestamp missing
              dateObj = new Date();
            }
            const hh = String(dateObj.getHours()).padStart(2, '0');
            const mm = String(dateObj.getMinutes()).padStart(2, '0');
            const ss = String(dateObj.getSeconds()).padStart(2, '0');

            const lineDiv = document.createElement('div');
            const timeSpan = document.createElement('span');
            timeSpan.textContent = `[${hh}:${mm}:${ss}] `;
            lineDiv.appendChild(timeSpan);

            const boldUser = document.createElement('strong');
            boldUser.textContent = d.username || 'user';
            lineDiv.appendChild(boldUser);

            const msgText = document.createTextNode(' ' + (d.message || ''));
            lineDiv.appendChild(msgText);

            box.appendChild(lineDiv);
          });
          box.scrollTop = box.scrollHeight;
        });
    } catch (e) {
      console.error('Log listener error', e);
    }

    await computeStats(); // preload stats for intelligent selection
  }
});

function showGreeting(user) {
  const name = user.displayName || user.email.split('@')[0];
  const greetEl = document.getElementById('greeting');
  if (greetEl) greetEl.textContent = `Welcome back, ${name}!`;
}

// ---- Exam order & meta ----
const examOrder = [
  '2007','2008','2009','2010','2011','2012','2013','2014',
  '2015','2016','2017','2018A','2018B','2019A','2019B',
  '2020A','2020B','2021','2022A','2022B','2023','2024'
];
const problemCount = 38;

// Log history of answers (per-problem stats) into Firestore
function logHistory(data) {
  const u = auth.currentUser;
  if (!u) return;
  db.collection('users').doc(u.uid)
    .collection('history')
    .add({ ...data, timestamp: firebase.firestore.FieldValue.serverTimestamp() })
    .catch(console.error);
}

// Session log events (for left log box)
function logSessionEvent(message) {
  const u = auth.currentUser;
  if (!u || !username) return;
  db.collection('users').doc(u.uid)
    .collection('logs')
    .add({
      time: firebase.firestore.FieldValue.serverTimestamp(),
      username,
      message
    })
    .catch(console.error);
}

// Compute & display stats
async function computeStats() {
  const u = auth.currentUser;
  if (!u) return;
  const stats = examOrder.map(() =>
    Array.from({length:problemCount}, () => ({correct:0,overtime:0,incorrect:0}))
  );
  const snap = await db.collection('users').doc(u.uid).collection('history').get();
  snap.forEach(doc => {
    const { exam, num, result } = doc.data();
    const r = examOrder.indexOf(exam), c = num - 1;
    if (r>=0 && c>=0 && c<problemCount && stats[r][c][result]!==undefined) {
      stats[r][c][result]++;
    }
  });

  const tot = {correct:0,overtime:0,incorrect:0};
  stats.flat().forEach(cell => {
    tot.correct   += cell.correct;
    tot.overtime  += cell.overtime;
    tot.incorrect += cell.incorrect;
  });

  const tc = document.getElementById('total-correct');
  const to = document.getElementById('total-overtime');
  const ti = document.getElementById('total-incorrect');
  if (tc) tc.textContent = tot.correct;
  if (to) to.textContent = tot.overtime;
  if (ti) ti.textContent = tot.incorrect;

  statsCache = stats;
  return stats;
}

// ---- Practice list ----
let practiceList = [];
async function loadPracticeList() {
  try {
    const res = await fetch('/static/practice.txt');
    const txt = await res.text();
    practiceList = txt.split(/[\s,]+/).filter(s=>s);
  } catch (e) {
    console.warn('Failed to load practice list', e);
  }
}

const config = {
  exams: examOrder,
  maxProblems: {
    '2007':38,'2008':25,'2009':25,'2010':25,'2011':25,'2012':25,
    '2013':25,'2014':25,'2015':25,'2016':25,'2017':25,'2018A':25,
    '2018B':25,'2019A':25,'2019B':25,'2020A':25,'2020B':25,
    '2021':25,'2022A':25,'2022B':25,'2023':25,'2024':25
  }
};

// ---- Intelligent problem selector ----
// Uniform random from all problems with score <= 0 (never done / yellow / red)
// Skip problems whose weighted score is > 0 ("green")
function getRandomProblem() {
  const practiceToggle = document.getElementById('practice-toggle');
  if (practiceToggle && practiceToggle.checked && practiceList.length) {
    const [e,n] = practiceList[Math.floor(Math.random()*practiceList.length)].split('.');
    return [e, Number(n)];
  }

  if (!statsCache) {
    const e = config.exams[Math.floor(Math.random()*config.exams.length)];
    const n = Math.floor(Math.random()*config.maxProblems[e]) + 1;
    return [e,n];
  }

  const candidates = [];
  statsCache.forEach((row, rIdx) => {
    row.forEach((cell, cIdx) => {
      const score = cell.correct - 0.5*cell.overtime - 2*cell.incorrect;
      if (score <= 0) {
        const exam = examOrder[rIdx];
        const num  = cIdx + 1;
        if (num <= config.maxProblems[exam]) {
          candidates.push([exam, num]);
        }
      }
    });
  });

  if (candidates.length === 0) {
    alert("🎉 All problems are green! No weak problems left.");
    const e = config.exams[Math.floor(Math.random()*config.exams.length)];
    const n = Math.floor(Math.random()*config.maxProblems[e]) + 1;
    return [e,n];
  }

  return candidates[Math.floor(Math.random()*candidates.length)];
}

async function fetchImageParts(exam,num) {
  const base = `/static/images/fma/${exam}/${num}`, ext = '.webp', parts = [];
  for (let s of ['a','b','']) {
    try {
      const resp = await fetch(base+s+ext,{method:'HEAD'});
      if (resp.ok) parts.push(base+s+ext);
    } catch {}
  }
  return parts;
}

function displayTimer(el,time) {
  if (!el) return;
  if (time<=0) { el.textContent='OVERTIME'; el.style.color='red'; }
  else {
    const m=String(Math.floor(time/60)).padStart(2,'0'),
          s=String(time%60).padStart(2,'0');
    el.textContent=`${m}:${s}`; el.style.color='#333';
  }
}

// ---- DOM init ----
const welcomeEl   = document.getElementById('welcome-page');
const practiceEl  = document.getElementById('practice-container');
const testEl      = document.getElementById('test-container');
const speedEl     = document.getElementById('speed-container');
const summaryEl   = document.getElementById('summary-container');

window.addEventListener('DOMContentLoaded', async () => {
  await loadPracticeList();
  const zenBtn   = document.getElementById('zen-btn');
  const testBtn  = document.getElementById('test-btn');
  const speedBtn = document.getElementById('speed-btn');
  const restart  = document.getElementById('restart-btn');
  const beginTest = document.getElementById('begin-test-btn');
  const submitTest = document.getElementById('submit-test-btn');
  const beginSpeed = document.getElementById('begin-speed-btn');
  const submitSpeed = document.getElementById('submit-speed-btn');

  if (zenBtn)   zenBtn.onclick   = startZen;
  if (testBtn)  testBtn.onclick  = startTestMode;
  if (speedBtn) speedBtn.onclick = startSpeedMode;
  if (restart)  restart.onclick  = () => location.reload();
  if (beginTest)  beginTest.onclick  = setupTest;
  if (submitTest) submitTest.onclick = () => { clearInterval(testTimerInterval); gradeTest(); };
  if (beginSpeed) beginSpeed.onclick  = initSpeed;
  if (submitSpeed)submitSpeed.onclick = handleSpeedSubmission;
});

// ---- Zen Mode ----
let zenCount=0, zenCorrect=0, zenOvertime=0, zenIncorrect=0;
let currentExam, currentNum, keyAnswers = [];
let zenTimer, zenTimeLeft;

async function startZen() {
  hideHeaderAndMenu();
  await computeStats();
  if (!sessionStarted) {
    logSessionEvent('started a new session');
    sessionStarted = true;
  }
  if (practiceEl) practiceEl.classList.remove('hidden');
  const endBtn = document.getElementById('end-practice-btn');
  if (endBtn) endBtn.onclick = showZenSummary;
  loadZenProblem();
}

async function loadZenProblem() {
  const prevWrap = document.getElementById('previous-wrapper');
  const prevBtn  = document.getElementById('toggle-previous-btn');
  if (prevWrap) {
    prevWrap.classList.add('hidden');
    prevWrap.innerHTML = '';
  }
  if (prevBtn) prevBtn.textContent = 'Show Previous Problems';

  zenCount++; updateZenDisplay();

  [currentExam, currentNum] = getRandomProblem();
  const examLabel = document.getElementById('exam-label');
  if (examLabel) examLabel.textContent = `Exam ${currentExam} #${currentNum}`;

  const imgs = await fetchImageParts(currentExam, currentNum);
  const imgBox = document.getElementById('image-wrapper');
  if (imgBox) {
    imgBox.innerHTML = '';
    imgs.forEach(src => {
      const img = new Image();
      img.src = src;
      img.className = 'problem-image';
      imgBox.appendChild(img);
    });
  }

  try {
    keyAnswers = (await (await fetch(`/static/images/fma/${currentExam}/key.txt`)).text())
      .split(/\r?\n/).map(l=>l.trim().toUpperCase());
  } catch {
    keyAnswers = [];
  }

  // Attach "Show Previous Problems" handler (two previous in same exam)
  if (prevBtn && prevWrap) {
    prevBtn.onclick = async () => {
      const showing = !prevWrap.classList.contains('hidden');
      if (!showing) {
        prevBtn.textContent = 'Hide Previous Problems';
        prevWrap.classList.remove('hidden');
        prevWrap.innerHTML = '';
        for (let i = 1; i <= 2; i++) {
          const pn = currentNum - i;
          if (pn >= 1 && pn <= config.maxProblems[currentExam]) {
            (await fetchImageParts(currentExam, pn)).forEach(src => {
              const img = new Image();
              img.src = src;
              img.className = 'problem-image';
              prevWrap.appendChild(img);
            });
          }
        }
        if (!prevWrap.hasChildNodes()) {
          prevWrap.classList.add('hidden');
          prevBtn.textContent = 'Show Previous Problems';
        }
      } else {
        prevBtn.textContent = 'Show Previous Problems';
        prevWrap.classList.add('hidden');
        prevWrap.innerHTML = '';
      }
    };
  }

  zenTimeLeft = 240;
  clearInterval(zenTimer);
  zenTimer = setInterval(()=>{
    zenTimeLeft--;
    displayTimer(document.getElementById('timer'), zenTimeLeft);
    if (zenTimeLeft<=0) clearInterval(zenTimer);
  },1000);
  displayTimer(document.getElementById('timer'), zenTimeLeft);

  const ansInput = document.getElementById('answer');
  const fb = document.getElementById('feedback');
  const submitBtn = document.getElementById('submit-btn');
  const skipBtn = document.getElementById('skip-btn');

  if (ansInput) ansInput.value = '';
  if (fb) fb.textContent = '';
  if (submitBtn) {
    submitBtn.textContent = 'Submit';
    submitBtn.onclick = handleZenSubmission;
  }
  if (skipBtn) {
    skipBtn.onclick = () => {
      logSessionEvent(`gave up ${currentExam}.${currentNum} ❌`);
      loadZenProblem();
    };
  }
}

function handleZenSubmission() {
  clearInterval(zenTimer);
  const ansInput = document.getElementById('answer');
  const fb = document.getElementById('feedback');
  if (!ansInput || !fb) return;

  const ans = ansInput.value.toUpperCase().trim();
  const corr = keyAnswers[currentNum-1]?.split('').filter(c=>/[A-E]/.test(c))||[];
  let  res;

  if (!/^[A-E]$/.test(ans)) {
    fb.textContent = 'Enter A–E';
    fb.style.color = 'darkorange';
    return;
  }

  if (corr.includes(ans)) {
    if (zenTimeLeft>0)  {
      zenCorrect++;
      fb.textContent='✅ CORRECT';
      fb.style.color='green';
      res='correct';
      logSessionEvent(`solved ${currentExam}.${currentNum} ✅`);
    } else {
      zenOvertime++;
      fb.textContent='⏰ OVERTIME';
      fb.style.color='orange';
      res='overtime';
      logSessionEvent(`solved ${currentExam}.${currentNum} ⌛`);
    }
  } else {
    zenIncorrect++;
    fb.textContent = `❌ INCORRECT (Answer: ${corr.join(' & ')})`;
    fb.style.color = 'red';
    res='incorrect';
    logSessionEvent(`missed ${currentExam}.${currentNum} ❌`);
  }

  logHistory({mode:'zen',exam:currentExam,num:currentNum,result:res});
  updateZenDisplay();

  const submitBtn = document.getElementById('submit-btn');
  if (submitBtn) {
    submitBtn.textContent = 'Next';
    submitBtn.onclick = loadZenProblem;
  }
}

function updateZenDisplay() {
  const pc = document.getElementById('problem-counter');
  const as = document.getElementById('accuracy-summary');
  if (pc) pc.textContent = `Problems: ${zenCount}`;
  if (as) as.textContent =
    `CORRECT: ${zenCorrect} | OVERTIME: ${zenOvertime} | INCORRECT: ${zenIncorrect}`;
}

function showZenSummary() {
  if (practiceEl) practiceEl.classList.add('hidden');
  if (summaryEl) summaryEl.classList.remove('hidden');
  const fs = document.getElementById('final-summary');
  if (fs) {
    fs.innerHTML =
      `Total: ${zenCount}<br>` +
      `Correct (fast): ${zenCorrect}<br>` +
      `Correct (overtime): ${zenOvertime}<br>` +
      `Incorrect: ${zenIncorrect}<br>`;
  }
  logSessionEvent('ended the session');
  sessionStarted = false;
}

// ---- Test mode ----
let currentTestProblems = [], testTimeLeft, testTimerInterval;

async function startTestMode() {
  hideHeaderAndMenu();
  await computeStats();
  if (!sessionStarted) {
    logSessionEvent('started a new session');
    sessionStarted = true;
  }
  if (testEl) testEl.classList.remove('hidden');
}

async function setupTest() {
  const mins = parseInt(document.getElementById('test-time-input').value, 10);
  const cnt  = parseInt(document.getElementById('test-count-input').value, 10);
  if (isNaN(mins) || isNaN(cnt) || mins <= 0 || cnt <= 0) return;

  const settings = document.getElementById('test-settings');
  const form     = document.getElementById('test-questions-form');
  if (settings) settings.classList.add('hidden');
  if (form)     form.classList.remove('hidden');

  testTimeLeft = mins * 60;
  displayTimer(document.getElementById('test-timer-display'), testTimeLeft);
  clearInterval(testTimerInterval);
  testTimerInterval = setInterval(() => {
    testTimeLeft--;
    displayTimer(document.getElementById('test-timer-display'), testTimeLeft);
    if (testTimeLeft <= 0) clearInterval(testTimerInterval);
  }, 1000);

  currentTestProblems = [];
  const container = document.getElementById('test-questions');
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < cnt; i++) {
    const [ex, num] = getRandomProblem();
    currentTestProblems.push({ exam: ex, num });

    const w = document.createElement('div');
    w.className = 'problem-wrapper';

    const h = document.createElement('h4');
    h.textContent = `${i+1}. Exam ${ex} #${num}`;
    w.appendChild(h);

    const imgDiv = document.createElement('div');
    imgDiv.id = `test-img-${i}`;
    imgDiv.innerHTML = '<div class="loader"></div>';
    w.appendChild(imgDiv);

    const ansBox = document.createElement('div');
    ansBox.className = 'answer-box';
    ansBox.innerHTML = `<input type="text" id="ans-${i}" maxlength="1" placeholder="A–E"/>`;
    w.appendChild(ansBox);

    container.appendChild(w);

    (async () => {
      const parts = await fetchImageParts(ex, num);
      imgDiv.innerHTML = '';
      parts.forEach(src => {
        const img = new Image();
        img.src = src;
        img.className = 'problem-image';
        imgDiv.appendChild(img);
      });
    })();
  }
}

async function gradeTest() {
  clearInterval(testTimerInterval);
  let correct = 0;
  const keyMap = {};

  for (const p of currentTestProblems) {
    const txt = await (await fetch(`/static/images/fma/${p.exam}/key.txt`)).text();
    keyMap[`${p.exam}.${p.num}`] = txt.split(/\r?\n/).map(l=>l.trim().toUpperCase());
  }

  const wrappers = document.querySelectorAll('#test-questions .problem-wrapper');
  currentTestProblems.forEach((p, i) => {
    const ansEl = document.getElementById(`ans-${i}`);
    const ans = ansEl ? ansEl.value.toUpperCase().trim() : '';
    const corr = keyMap[`${p.exam}.${p.num}`][p.num-1].split('').filter(c=>/[A-E]/.test(c));
    const res = document.createElement('div');
    res.className = 'result-text';
    let result;

    if (corr.includes(ans)) {
      correct++;
      res.textContent = '✅';
      result = 'correct';
      logSessionEvent(`solved ${p.exam}.${p.num} ✅`);
    } else {
      res.textContent = `❌ (Answer: ${corr.join(',')})`;
      result = 'incorrect';
      logSessionEvent(`missed ${p.exam}.${p.num} ❌`);
    }
    wrappers[i].appendChild(res);
    logHistory({mode:'test',exam:p.exam,num:p.num,result});
  });

  const tq = document.getElementById('test-questions');
  if (tq) {
    tq.insertAdjacentHTML('beforeend', `<h3>Score: ${correct}/${currentTestProblems.length}</h3>`);
  }
  const submitBtn = document.getElementById('submit-test-btn');
  if (submitBtn) submitBtn.disabled = true;

  logSessionEvent('ended the session');
  sessionStarted = false;
}

// ---- Speed Mode ----
let speedTime, speedTimerInterval, speedCount = 0;
async function startSpeedMode() {
  hideHeaderAndMenu();
  await computeStats();
  if (!sessionStarted) {
    logSessionEvent('started a new session');
    sessionStarted = true;
  }
  if (speedEl) speedEl.classList.remove('hidden');
}

function initSpeed() {
  const mins = parseInt(document.getElementById('speed-time-input').value, 10);
  if (isNaN(mins) || mins <= 0) return;
  speedTime = mins * 60;
  speedCount = 0;

  const settings = document.getElementById('speed-settings');
  const area     = document.getElementById('speed-problem-area');
  if (settings) settings.classList.add('hidden');
  if (area)     area.classList.remove('hidden');

  loadSpeedProblem();
  clearInterval(speedTimerInterval);
  speedTimerInterval = setInterval(() => {
    speedTime--;
    displayTimer(document.getElementById('speed-timer-display'), speedTime);
    if (speedTime <= 0) finishSpeed();
  }, 1000);
}

async function loadSpeedProblem() {
  speedCount++;
  const sc = document.getElementById('speed-counter');
  if (sc) sc.textContent = `Solved: ${speedCount-1}`;

  const [ex, num] = getRandomProblem();
  currentExam = ex; currentNum = num;

  const label = document.getElementById('exam-label-speed');
  if (label) label.textContent = `Exam ${ex} #${num}`;

  const prevWrap = document.getElementById('previous-wrapper-speed');
  const prevBtn  = document.getElementById('toggle-previous-speed-btn');
  if (prevWrap) {
    prevWrap.classList.add('hidden');
    prevWrap.innerHTML = '';
  }
  if (prevBtn) prevBtn.textContent = 'Show Previous Problems';

  const imgW = document.getElementById('image-wrapper-speed');
  if (imgW) {
    imgW.innerHTML = '';
    (await fetchImageParts(ex, num)).forEach(src => {
      const img = new Image();
      img.src = src;
      img.className = 'problem-image';
      imgW.appendChild(img);
    });
  }

  try {
    keyAnswers = (await (await fetch(`/static/images/fma/${ex}/key.txt`)).text())
      .split(/\r?\n/).map(l=>l.trim().toUpperCase());
  } catch { keyAnswers = []; }

  // Attach previous toggle (two previous in same exam)
  if (prevBtn && prevWrap) {
    prevBtn.onclick = async () => {
      const showing = !prevWrap.classList.contains('hidden');
      if (!showing) {
        prevBtn.textContent = 'Hide Previous Problems';
        prevWrap.classList.remove('hidden');
        prevWrap.innerHTML = '';
        for (let i = 1; i <= 2; i++) {
          const pn = currentNum - i;
          if (pn>=1 && pn <= config.maxProblems[ex]) {
            (await fetchImageParts(ex,pn)).forEach(src => {
              const img = new Image();
              img.src = src;
              img.className = 'problem-image';
              prevWrap.appendChild(img);
            });
          }
        }
        if (!prevWrap.hasChildNodes()) {
          prevWrap.classList.add('hidden');
          prevBtn.textContent = 'Show Previous Problems';
        }
      } else {
        prevBtn.textContent = 'Show Previous Problems';
        prevWrap.classList.add('hidden');
        prevWrap.innerHTML = '';
      }
    };
  }

  const ansInput = document.getElementById('answer-speed');
  const fb = document.getElementById('feedback-speed');
  if (ansInput) ansInput.value = '';
  if (fb) fb.textContent = '';
}

function handleSpeedSubmission() {
  const ansInput = document.getElementById('answer-speed');
  const fb = document.getElementById('feedback-speed');
  if (!ansInput || !fb) return;

  const ans = ansInput.value.toUpperCase().trim();
  const corr = keyAnswers[currentNum-1]?.split('').filter(c=>/[A-E]/.test(c)) || [];

  if (corr.includes(ans)) {
    fb.textContent = '✅';
    logHistory({mode:'speed',exam:currentExam,num:currentNum,result:'correct'});
    logSessionEvent(`solved ${currentExam}.${currentNum} ✅`);
  } else {
    fb.textContent = `❌ (Answer: ${corr.join('/')})`;
    logHistory({mode:'speed',exam:currentExam,num:currentNum,result:'incorrect'});
    logSessionEvent(`missed ${currentExam}.${currentNum} ❌`);
  }

  loadSpeedProblem();
}

function finishSpeed() {
  clearInterval(speedTimerInterval);
  if (speedEl) speedEl.classList.add('hidden');
  if (summaryEl) summaryEl.classList.remove('hidden');
  const fs = document.getElementById('final-summary');
  if (fs) fs.textContent = `Problems Solved: ${speedCount-1}`;
  logSessionEvent('ended the session');
  sessionStarted = false;
}

// ---- Utility ----
function hideHeaderAndMenu() {
  const sc = document.getElementById('stats-container');
  if (sc) sc.classList.add('hidden');
  if (welcomeEl) welcomeEl.classList.add('hidden');
}

// Log session end on browser close/refresh (best effort)
window.addEventListener('beforeunload', () => {
  if (sessionStarted) {
    logSessionEvent('ended the session');
    sessionStarted = false;
  }
});
