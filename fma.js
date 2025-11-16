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

// ---- Auth & Greeting ----
auth.onAuthStateChanged(async user => {
  if (!user) {
    window.location.href = '/';
  } else {
    showGreeting(user);
    await computeStats(); // MUST preload stats
  }
});

function showGreeting(user) {
  const name = user.displayName || user.email.split('@')[0];
  document.getElementById('greeting').textContent = `Welcome back, ${name}!`;
}

// ---- Exam order & meta ----
const examOrder = [
  '2007','2008','2009','2010','2011','2012','2013','2014',
  '2015','2016','2017','2018A','2018B','2019A','2019B',
  '2020A','2020B','2021','2022A','2022B','2023','2024'
];
const problemCount = 38;

// Log into Firestore
function logHistory(data) {
  const u = auth.currentUser;
  if (!u) return;
  db.collection('users').doc(u.uid)
    .collection('history')
    .add({ ...data, timestamp: firebase.firestore.FieldValue.serverTimestamp() })
    .catch(console.error);
}

let statsCache = null;

// Compute & display stats
async function computeStats() {
  const u = auth.currentUser;
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

  document.getElementById('total-correct').textContent   = tot.correct;
  document.getElementById('total-overtime').textContent  = tot.overtime;
  document.getElementById('total-incorrect').textContent = tot.incorrect;

  statsCache = stats;
  return stats;
}

// practice list
let practiceList = [];
async function loadPracticeList() {
  try {
    const res = await fetch('/static/practice.txt');
    const txt = await res.text();
    practiceList = txt.split(/[\s,]+/).filter(s=>s);
  } catch {}
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

// ---- New intelligent random policy ----
// Uniform random from all problems with score <= 0
function getRandomProblem() {
  // if practice override is checked
  if (document.getElementById('practice-toggle').checked && practiceList.length) {
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
    alert("🎉 All problems solved at green level! No more weak problems left.");
    const e = config.exams[Math.floor(Math.random()*config.exams.length)];
    const n = Math.floor(Math.random()*config.maxProblems[e]) + 1;
    return [e,n];
  }

  return candidates[Math.floor(Math.random()*candidates.length)];
}

async function fetchImageParts(exam,num) {
  const base = `/static/images/fma/${exam}/${num}`, ext = '.webp', parts = [];
  for (let s of ['a','b','']) {
    try { if ((await fetch(base+s+ext,{method:'HEAD'})).ok) parts.push(base+s+ext); }
    catch {}
  }
  return parts;
}

function displayTimer(el,time) {
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
  document.getElementById('zen-btn').onclick = startZen;
  document.getElementById('test-btn').onclick = startTestMode;
  document.getElementById('speed-btn').onclick = startSpeedMode;
  document.getElementById('restart-btn').onclick = () => location.reload();
  document.getElementById('begin-test-btn').onclick = setupTest;
  document.getElementById('submit-test-btn').onclick = () => { clearInterval(testTimerInterval); gradeTest(); };
  document.getElementById('begin-speed-btn').onclick = initSpeed;
  document.getElementById('submit-speed-btn').onclick = handleSpeedSubmission;
});

// ---- Zen Mode ----
let zenCount=0, zenCorrect=0, zenOvertime=0, zenIncorrect=0;
let currentExam, currentNum, keyAnswers = [];
let zenTimer, zenTimeLeft, showPrev = false;

async function startZen() {
  hideHeaderAndMenu();
  await computeStats();
  practiceEl.classList.remove('hidden');
  document.getElementById('end-practice-btn').onclick = showZenSummary;
  loadZenProblem();
}

async function loadZenProblem() {
  showPrev = false;
  document.getElementById('previous-wrapper').classList.add('hidden');
  document.getElementById('previous-wrapper').innerHTML = '';

  zenCount++; updateZenDisplay();

  [currentExam, currentNum] = getRandomProblem();
  document.getElementById('exam-label').textContent = `Exam ${currentExam} #${currentNum}`;

  const imgs = await fetchImageParts(currentExam, currentNum);
  const imgBox = document.getElementById('image-wrapper');
  imgBox.innerHTML = '';
  imgs.forEach(src => {
    const img = new Image();
    img.src = src;
    img.className = 'problem-image';
    imgBox.appendChild(img);
  });

  try {
    keyAnswers = (await (await fetch(`/static/images/fma/${currentExam}/key.txt`)).text())
      .split(/\r?\n/).map(l=>l.trim().toUpperCase());
  } catch {
    keyAnswers = [];
  }

  zenTimeLeft = 240;
  clearInterval(zenTimer);
  zenTimer = setInterval(()=>{
    zenTimeLeft--;
    displayTimer(document.getElementById('timer'), zenTimeLeft);
    if (zenTimeLeft<=0) clearInterval(zenTimer);
  },1000);
  displayTimer(document.getElementById('timer'), zenTimeLeft);

  document.getElementById('answer').value = '';
  document.getElementById('feedback').textContent = '';
  document.getElementById('submit-btn').textContent = 'Submit';
  document.getElementById('submit-btn').onclick = handleZenSubmission;
}

function handleZenSubmission() {
  clearInterval(zenTimer);
  const ans = document.getElementById('answer').value.toUpperCase().trim();
  const corr = keyAnswers[currentNum-1]?.split('').filter(c=>/[A-E]/.test(c))||[];
  const fb   = document.getElementById('feedback');
  let  res;

  if (!/^[A-E]$/.test(ans)) {
    fb.textContent = 'Enter A–E';
    fb.style.color = 'darkorange';
    return;
  }

  if (corr.includes(ans)) {
    if (zenTimeLeft>0)  { zenCorrect++; fb.textContent='✅ CORRECT'; fb.style.color='green'; res='correct';  }
    else                { zenOvertime++;fb.textContent='⏰ OVERTIME';fb.style.color='orange';res='overtime'; }
  } else {
    zenIncorrect++;
    fb.textContent = `❌ INCORRECT (Answer: ${corr.join(' & ')})`;
    fb.style.color = 'red';
    res='incorrect';
  }

  logHistory({mode:'zen',exam:currentExam,num:currentNum,result:res});
  updateZenDisplay();
  document.getElementById('submit-btn').textContent = 'Next';
  document.getElementById('submit-btn').onclick = loadZenProblem;
}

function updateZenDisplay() {
  document.getElementById('problem-counter').textContent =
    `Problems: ${zenCount}`;
  document.getElementById('accuracy-summary').textContent =
    `CORRECT: ${zenCorrect} | OVERTIME: ${zenOvertime} | INCORRECT: ${zenIncorrect}`;
}

function showZenSummary() {
  practiceEl.classList.add('hidden');
  summaryEl.classList.remove('hidden');
  document.getElementById('final-summary').innerHTML =
    `Total: ${zenCount}<br>` +
    `Correct (fast): ${zenCorrect}<br>` +
    `Correct (overtime): ${zenOvertime}<br>` +
    `Incorrect: ${zenIncorrect}<br>`;
}

// ---- test mode ----
let currentTestProblems = [], testTimeLeft, testTimerInterval;

async function startTestMode() {
  hideHeaderAndMenu();
  await computeStats();
  testMode.classList.remove('hidden');
}

async function setupTest() {
  const mins = parseInt(document.getElementById('test-time-input').value, 10);
  const cnt  = parseInt(document.getElementById('test-count-input').value, 10);
  if (isNaN(mins) || isNaN(cnt) || mins <= 0 || cnt <= 0) return;

  document.getElementById('test-settings').classList.add('hidden');
  document.getElementById('test-questions-form').classList.remove('hidden');

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
    const ans = document.getElementById(`ans-${i}`).value.toUpperCase().trim();
    const corr = keyMap[`${p.exam}.${p.num}`][p.num-1].split('').filter(c=>/[A-E]/.test(c));
    const res = document.createElement('div');
    res.className = 'result-text';
    let result;

    if (corr.includes(ans)) {
      correct++;
      res.textContent = '✅';
      result = 'correct';
    } else {
      res.textContent = `❌ (Answer: ${corr.join(',')})`;
      result = 'incorrect';
    }
    wrappers[i].appendChild(res);
    logHistory({mode:'test',exam:p.exam,num:p.num,result});
  });

  document.getElementById('test-questions')
    .insertAdjacentHTML('beforeend', `<h3>Score: ${correct}/${currentTestProblems.length}</h3>`);
  document.getElementById('submit-test-btn').disabled = true;
}

// ---- Speed Mode ----
let speedTime, speedTimerInterval, speedCount = 0;
async function startSpeedMode() {
  hideHeaderAndMenu();
  await computeStats();
  speedMode.classList.remove('hidden');
}

function initSpeed() {
  const mins = parseInt(document.getElementById('speed-time-input').value, 10);
  if (isNaN(mins) || mins <= 0) return;
  speedTime = mins * 60;
  speedCount = 0;

  document.getElementById('speed-settings').classList.add('hidden');
  document.getElementById('speed-problem-area').classList.remove('hidden');

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
  document.getElementById('speed-counter').textContent = `Solved: ${speedCount-1}`;

  const [ex, num] = getRandomProblem();
  currentExam = ex; currentNum = num;
  document.getElementById('exam-label-speed').textContent = `Exam ${ex} #${num}`;

  document.getElementById('previous-wrapper-speed').classList.add('hidden');
  document.getElementById('previous-wrapper-speed').innerHTML = '';

  const imgW = document.getElementById('image-wrapper-speed');
  imgW.innerHTML = '';
  (await fetchImageParts(ex, num)).forEach(src => {
    const img = new Image();
    img.src = src;
    img.className = 'problem-image';
    imgW.appendChild(img);
  });

  try {
    keyAnswers = (await (await fetch(`/static/images/fma/${ex}/key.txt`)).text())
      .split(/\r?\n/).map(l=>l.trim().toUpperCase());
  } catch { keyAnswers = []; }

  document.getElementById('answer-speed').value = '';
  document.getElementById('feedback-speed').textContent = '';
}

function handleSpeedSubmission() {
  const ans = document.getElementById('answer-speed').value.toUpperCase().trim();
  const corr = keyAnswers[currentNum-1]?.split('').filter(c=>/[A-E]/.test(c)) || [];
  const fb   = document.getElementById('feedback-speed');

  if (corr.includes(ans)) {
    fb.textContent = '✅';
    logHistory({mode:'speed',exam:currentExam,num:currentNum,result:'correct'});
  } else {
    fb.textContent = `❌ (Answer: ${corr.join('/')})`;
    logHistory({mode:'speed',exam:currentExam,num:currentNum,result:'incorrect'});
  }

  loadSpeedProblem();
}

function finishSpeed() {
  clearInterval(speedTimerInterval);
  speedMode.classList.add('hidden');
  summaryEl.classList.remove('hidden');
  document.getElementById('final-summary').textContent = `Problems Solved: ${speedCount-1}`;
}

// ---- Utility ----
function hideHeaderAndMenu() {
  document.getElementById('stats-container').classList.add('hidden');
  welcomeEl.classList.add('hidden');
}
