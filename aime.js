// aime.js

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
auth.onAuthStateChanged(user => {
  if (!user) {
    window.location.href = '/';
  } else {
    showGreeting(user);
    computeStats();
  }
});

function showGreeting(user) {
  const name = user.displayName || user.email.split('@')[0];
  document.getElementById('greeting').textContent = `Welcome back, ${name}!`;
}

// ---- Stats & CSV Download ----
const examOrder = [
  '2000I', '2000II',
  '2001I', '2001II',
  '2002I', '2002II',
  '2003I', '2003II',
  '2004I', '2004II',
  '2005I', '2005II',
  '2006I', '2006II',
  '2007I', '2007II',
  '2008I', '2008II',
  '2009I', '2009II',
  '2010I', '2010II',
  '2011I', '2011II',
  '2012I', '2012II',
  '2013I', '2013II',
  '2014I', '2014II',
  '2015I', '2015II',
  '2016I', '2016II',
  '2017I', '2017II',
  '2018I', '2018II',
  '2019I', '2019II',
  '2020I', '2020II',
  '2021I', '2021II',
  '2022I', '2022II',
  '2023I', '2023II',
  '2024I', '2024II',
  '2025I', '2025II'
];
const problemCount = 15;

// Log into Firestore
function logHistory(data) {
  const u = auth.currentUser;
  if (!u) return;
  db.collection('users').doc(u.uid)
    .collection('history')
    .add({ ...data, timestamp: firebase.firestore.FieldValue.serverTimestamp() })
    .catch(console.error);
}

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
  document.getElementById('total-correct').textContent = tot.correct;
  document.getElementById('total-overtime').textContent = tot.overtime;
  document.getElementById('total-incorrect').textContent = tot.incorrect;
  return stats;
}

// ---- Build & download CSV matching your template (transposed) ----
window.addEventListener('load', () => {
  document
    .getElementById('download-stats-btn')
    .addEventListener('click', async () => {
      try {
        const stats = await computeStats();  // stats[examIdx][problemIdx]

        const workbook = new ExcelJS.Workbook();
        const ws = workbook.addWorksheet('AIME Stats');

        // 1) Header row: first cell = 'Problem', then all exam codes
        ws.addRow([
          'Problem',
          ...examOrder
        ]);

        // 2) One row per problem number
        for (let prob = 1; prob <= problemCount; prob++) {
          const row = [ prob ];
          // for each exam, grab that problem's counts
          examOrder.forEach((examCode, examIdx) => {
            const cell = stats[examIdx][prob - 1];
            row.push(`${cell.correct}/${cell.overtime}/${cell.incorrect}`);
          });
          ws.addRow(row);
        }

        // 3) Apply coloring exactly as before, but skip col 1 (the Problem-# column)
        ws.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return;       // skip header
          row.eachCell((cell, colNumber) => {
            if (colNumber === 1) return;     // skip problem-number label
            const [correct, overtime, wrong] = cell.value
              .split('/')
              .map(Number);
            // leave blank if all zero
            if (correct === 0 && overtime === 0 && wrong === 0) return;

            const score = correct - 0.5 * overtime - 2 * wrong;
            let fillColor;
            if (score > 0) fillColor = 'FF8BC34A';      // green
            else if (score >= -0.5) fillColor = 'FFFFEB3B'; // yellow
            else fillColor = 'FFF44336';               // red

            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: fillColor },
            };
          });
        });

        // 4) Trigger download
        const buffer = await workbook.xlsx.writeBuffer();
        const blob   = new Blob([buffer], { type: 'application/octet-stream' });
        const url    = URL.createObjectURL(blob);
        const a      = document.createElement('a');
        a.href       = url;
        a.download   = 'aime-stats.xlsx';
        a.click();
        URL.revokeObjectURL(url);

      } catch (e) {
        console.error('Download error', e);
      }
    });
});



// ---- Problem Loader & Helpers ----
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

function getRandomProblem() {
  if (document.getElementById('practice-toggle').checked && practiceList.length) {
    const [e,n] = practiceList[Math.floor(Math.random()*practiceList.length)].split('.');
    return [e, Number(n)];
  }
  const e = config.exams[Math.floor(Math.random()*config.exams.length)];
  const n = Math.floor(Math.random()*config.maxProblems[e]) + 1;
  return [e,n];
}

async function fetchImageParts(exam,num) {
  const base = `/static/images/aime/${exam}/${num}`, ext = '.png', parts = [];
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

// ---- Mode Elements & Wiring ----
const welcomeEl   = document.getElementById('welcome-page');
const practiceEl  = document.getElementById('practice-container');
const testEl      = document.getElementById('test-container');
const speedEl     = document.getElementById('speed-container');
const summaryEl   = document.getElementById('summary-container');

window.addEventListener('DOMContentLoaded', async () => {
  await loadPracticeList();
  document.getElementById('zen-btn').onclick   = startZen;
  document.getElementById('test-btn').onclick  = startTestMode;
  document.getElementById('speed-btn').onclick = startSpeedMode;
  document.getElementById('restart-btn').onclick = () => location.reload();
  document.getElementById('begin-test-btn').onclick  = setupTest;
  document.getElementById('submit-test-btn').onclick = () => { clearInterval(testTimerInterval); gradeTest(); };
  document.getElementById('begin-speed-btn').onclick  = initSpeed;
  document.getElementById('submit-speed-btn').onclick = handleSpeedSubmission;
});

// ---- Zen Mode ----
let zenCount=0, zenCorrect=0, zenOvertime=0, zenIncorrect=0;
let currentExam, currentNum, keyAnswers = [];
let zenTimer, zenTimeLeft, showPrev = false;

function startZen() {
  hideHeaderAndMenu();
  practiceEl.classList.remove('hidden');
  document.getElementById('end-practice-btn').onclick = showZenSummary;
  loadZenProblem();
}

async function loadZenProblem() {
  // Reset toggle
  showPrev = false;
  const btnPrev = document.getElementById('toggle-previous-btn');
  const wrapPrev = document.getElementById('previous-wrapper');
  btnPrev.textContent = 'Show Previous Problems';
  wrapPrev.classList.add('hidden');
  wrapPrev.innerHTML = '';

  // Pick problem
  zenCount++; updateZenDisplay();
  [currentExam, currentNum] = getRandomProblem();
  document.getElementById('exam-label').textContent = `Exam ${currentExam} #${currentNum}`;

  // Show image
  const imgs = await fetchImageParts(currentExam, currentNum);
  const imgBox = document.getElementById('image-wrapper');
  imgBox.innerHTML = '';
  imgs.forEach(src => {
    const img = new Image();
    img.src = src;
    img.className = 'problem-image';
    imgBox.appendChild(img);
  });

  // Load answer key
  try {
    keyAnswers = (await (await fetch(`/static/images/aime/${currentExam}/key.txt`)).text())
      .split(/\r?\n/).map(l=>l.trim().toUpperCase());
  } catch {
    keyAnswers = [];
  }

  // Toggle previous handler
  btnPrev.onclick = async () => {
    showPrev = !showPrev;
    if (showPrev) {
      btnPrev.textContent = 'Hide Previous Problems';
      wrapPrev.classList.remove('hidden');
      wrapPrev.innerHTML = '';
      for (let i=1; i<=2; i++){
        const pn = currentNum - i;
        if (pn>=1 && pn <= config.maxProblems[currentExam]) {
          (await fetchImageParts(currentExam,pn)).forEach(src=>{
            const img = new Image();
            img.src = src;
            img.className = 'problem-image';
            wrapPrev.appendChild(img);
          });
        }
      }
      if (!wrapPrev.hasChildNodes()) {
        wrapPrev.classList.add('hidden');
        btnPrev.textContent = 'Show Previous Problems';
        showPrev = false;
      }
    } else {
      btnPrev.textContent = 'Show Previous Problems';
      wrapPrev.classList.add('hidden');
      wrapPrev.innerHTML = '';
    }
  };

  // Timer
  zenTimeLeft = 240;
  clearInterval(zenTimer);
  zenTimer = setInterval(()=>{
    zenTimeLeft--;
    displayTimer(document.getElementById('timer'), zenTimeLeft);
    if (zenTimeLeft<=0) clearInterval(zenTimer);
  },1000);
  displayTimer(document.getElementById('timer'), zenTimeLeft);

  // Reset input & hook submit
  document.getElementById('answer').value = '';
  document.getElementById('feedback').textContent = '';
  document.getElementById('submit-btn').onclick = handleZenSubmission;
}

function handleZenSubmission() {
  clearInterval(zenTimer);
  const fb = document.getElementById('feedback');
  const raw = document.getElementById('answer').value.trim();
  // only 1–3 digits allowed
  if (!/^\d{1,3}$/.test(raw)) {
    fb.textContent = 'Enter a number 0–999';
    fb.style.color = 'darkorange';
    return;
  }
  const ansNum = parseInt(raw, 10);
  const keyRaw = keyAnswers[currentNum-1] || '';
  const keyNum = parseInt(keyRaw, 10);

  let res;
  if (ansNum === keyNum) {
    if (zenTimeLeft > 0) {
      zenCorrect++;
      fb.textContent = '✅ CORRECT';
      fb.style.color = 'green';
      res = 'correct';
    } else {
      zenOvertime++;
      fb.textContent = '⏰ OVERTIME';
      fb.style.color = 'orange';
      res = 'overtime';
    }
  } else {
    zenIncorrect++;
    fb.textContent = `❌ INCORRECT (Answer: ${keyNum})`;
    fb.style.color = 'red';
    res = 'incorrect';
  }

  logHistory({ mode: 'zen', exam: currentExam, num: currentNum, result: res });
  updateZenDisplay();

  const sb = document.getElementById('submit-btn');
  sb.textContent = 'Next';
  sb.onclick = loadZenProblem;
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

// ---- Test Mode ----
let currentTestProblems = [], testTimeLeft, testTimerInterval;

function startTestMode() {
  hideHeaderAndMenu();
  testMode.classList.remove('hidden');
}

async function setupTest() {
  // Read inputs
  const mins = parseInt(document.getElementById('test-time-input').value, 10);
  const cnt  = parseInt(document.getElementById('test-count-input').value, 10);
  if (isNaN(mins) || isNaN(cnt) || mins <= 0 || cnt <= 0) return;

  // Show form, hide settings
  document.getElementById('test-settings').classList.add('hidden');
  document.getElementById('test-questions-form').classList.remove('hidden');

  // Start timer
  testTimeLeft = mins * 60;
  displayTimer(document.getElementById('test-timer-display'), testTimeLeft);
  clearInterval(testTimerInterval);
  testTimerInterval = setInterval(() => {
    testTimeLeft--;
    displayTimer(document.getElementById('test-timer-display'), testTimeLeft);
    if (testTimeLeft <= 0) clearInterval(testTimerInterval);
  }, 1000);

  // Generate problems
  currentTestProblems = [];
  const container = document.getElementById('test-questions');
  container.innerHTML = '';
  for (let i = 0; i < cnt; i++) {
    const [ex, num] = getRandomProblem();
    currentTestProblems.push({ exam: ex, num });

    // Build wrapper
    const w = document.createElement('div');
    w.className = 'problem-wrapper';

    // Header
    const h = document.createElement('h4');
    h.textContent = `${i+1}. Exam ${ex} #${num}`;
    w.appendChild(h);

    // Image placeholder
    const imgDiv = document.createElement('div');
    imgDiv.id = `test-img-${i}`;
    imgDiv.innerHTML = '<div class="loader"></div>';
    w.appendChild(imgDiv);

    // Previous toggle
    const btnPrev = document.createElement('button');
    btnPrev.className = 'toggle-previous-btn';
    btnPrev.textContent = 'Show Previous Problems';
    w.appendChild(btnPrev);

    const prevDiv = document.createElement('div');
    prevDiv.className = 'previous-wrapper hidden';
    w.appendChild(prevDiv);

    // Answer input
    const ansBox = document.createElement('div');
    ansBox.className = 'answer-box';
    ansBox.innerHTML = `<input type="text" id="ans-${i}" maxlength="1" placeholder="A–E"/>`;
    w.appendChild(ansBox);

    container.appendChild(w);

    // Load main image
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

    // Attach toggle logic (same as Zen)
    btnPrev.onclick = async () => {
      const showing = !prevDiv.classList.contains('hidden');
      if (!showing) {
        btnPrev.textContent = 'Hide Previous Problems';
        prevDiv.classList.remove('hidden');
        prevDiv.innerHTML = '';
        for (let j = 1; j <= 2; j++) {
          const pn = num - j;
          if (pn >= 1 && pn <= config.maxProblems[ex]) {
            (await fetchImageParts(ex, pn)).forEach(src => {
              const img = new Image();
              img.src = src;
              img.className = 'problem-image';
              prevDiv.appendChild(img);
            });
          }
        }
        if (!prevDiv.hasChildNodes()) {
          prevDiv.classList.add('hidden');
          btnPrev.textContent = 'Show Previous Problems';
        }
      } else {
        btnPrev.textContent = 'Show Previous Problems';
        prevDiv.classList.add('hidden');
        prevDiv.innerHTML = '';
      }
    };
  }
}

async function gradeTest() {
  clearInterval(testTimerInterval);
  let correct = 0;

  // Load all keys first
  const keyMap = {};
  for (const p of currentTestProblems) {
    const txt = await (await fetch(`/static/images/aime/${p.exam}/key.txt`)).text();
    keyMap[`${p.exam}.${p.num}`] = txt.split(/\r?\n/).map(l=>l.trim().toUpperCase());
  }

  // Grade each
  const wrappers = document.querySelectorAll('#test-questions .problem-wrapper');
  currentTestProblems.forEach((p, i) => {
  const raw = document.getElementById(`ans-${i}`).value.trim();
  const ansNum = /^\d{1,3}$/.test(raw) ? parseInt(raw,10) : NaN;
  const keyRaw = keyMap[`${p.exam}.${p.num}`][p.num-1] || '';
  const keyNum = parseInt(keyRaw, 10);

  const resDiv = document.createElement('div');
  resDiv.className = 'result-text';

  let result;
  if (ansNum === keyNum) {
    correct++;
    resDiv.textContent = '✅';
    result = 'correct';
  } else {
    resDiv.textContent = `❌ (Ans: ${keyNum})`;
    result = 'incorrect';
  }

  wrappers[i].appendChild(resDiv);
  logHistory({ mode: 'test', exam: p.exam, num: p.num, result });
});


  // Show score
  document.getElementById('test-questions')
    .insertAdjacentHTML('beforeend', `<h3>Score: ${correct}/${currentTestProblems.length}</h3>`);
  document.getElementById('submit-test-btn').disabled = true;
}

// ---- Speed Mode ----
let speedTime, speedTimerInterval, speedCount = 0;
function startSpeedMode() {
  hideHeaderAndMenu();
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
  document.getElementById('exam-label-speed').textContent = `Exam ${ex} #${num}`;

  // Reset prev toggle
  const btnPrev = document.getElementById('toggle-previous-speed-btn');
  const prevDiv = document.getElementById('previous-wrapper-speed');
  btnPrev.textContent = 'Show Previous Problems';
  prevDiv.classList.add('hidden');
  prevDiv.innerHTML = '';

  // Load image
  const imgW = document.getElementById('image-wrapper-speed');
  imgW.innerHTML = '';
  (await fetchImageParts(ex, num)).forEach(src => {
    const img = new Image();
    img.src = src;
    img.className = 'problem-image';
    imgW.appendChild(img);
  });

  // Load keyAnswers for this problem
  try {
    keyAnswers = (await (await fetch(`/static/images/aime/${ex}/key.txt`)).text())
      .split(/\r?\n/).map(l=>l.trim().toUpperCase());
  } catch {
    keyAnswers = [];
  }

  // Attach toggle
  btnPrev.onclick = async () => {
    const showing = !prevDiv.classList.contains('hidden');
    if (!showing) {
      btnPrev.textContent = 'Hide Previous Problems';
      prevDiv.classList.remove('hidden');
      prevDiv.innerHTML = '';
      for (let i = 1; i <= 2; i++) {
        const pn = num - i;
        if (pn>=1 && pn <= config.maxProblems[ex]) {
          (await fetchImageParts(ex,pn)).forEach(src => {
            const img = new Image();
            img.src = src;
            img.className = 'problem-image';
            prevDiv.appendChild(img);
          });
        }
      }
      if (!prevDiv.hasChildNodes()) {
        prevDiv.classList.add('hidden');
        btnPrev.textContent = 'Show Previous Problems';
      }
    } else {
      btnPrev.textContent = 'Show Previous Problems';
      prevDiv.classList.add('hidden');
      prevDiv.innerHTML = '';
    }
  };

  // Hook submit
  document.getElementById('answer-speed').value = '';
  document.getElementById('feedback-speed').textContent = '';
}

function handleSpeedSubmission() {
  const fb = document.getElementById('feedback-speed');
  const raw = document.getElementById('answer-speed').value.trim();
  if (!/^\d{1,3}$/.test(raw)) {
    fb.textContent = 'Enter 0–999';
    return;
  }
  const ansNum = parseInt(raw, 10);
  const keyRaw = keyAnswers[currentNum-1] || '';
  const keyNum = parseInt(keyRaw, 10);

  if (ansNum === keyNum) {
    fb.textContent = '✅';
    logHistory({ mode:'speed', exam: currentExam, num: currentNum, result:'correct' });
  } else {
    fb.textContent = `❌ (Ans: ${keyNum})`;
    logHistory({ mode:'speed', exam: currentExam, num: currentNum, result:'incorrect' });
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


function hideHeaderAndMenu() {
  document.getElementById('stats-container').classList.add('hidden');
  welcomeEl.classList.add('hidden');
}
