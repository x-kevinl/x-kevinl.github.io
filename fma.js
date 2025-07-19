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

// Compute & display stats
async function computeStats() {
  const u = auth.currentUser;
  const stats = examOrder.map(() =>
    Array.from({length:problemCount}, () => ({correct:0,overtime:0,incorrect:0,skipped:0}))
  );
  const snap = await db.collection('users').doc(u.uid).collection('history').get();
  snap.forEach(doc => {
    const { exam, num, result } = doc.data();
    const r = examOrder.indexOf(exam), c = num - 1;
    if (r>=0 && c>=0 && c<problemCount && stats[r][c][result]!==undefined) {
      stats[r][c][result]++;
    }
  });
  const tot = {correct:0,overtime:0,incorrect:0,skipped:0};
  stats.flat().forEach(cell => {
    tot.correct   += cell.correct;
    tot.overtime  += cell.overtime;
    tot.incorrect += cell.incorrect;
    tot.skipped   += cell.skipped;
  });
  document.getElementById('total-correct').textContent = tot.correct;
  document.getElementById('total-overtime').textContent = tot.overtime;
  document.getElementById('total-incorrect').textContent = tot.incorrect;
  document.getElementById('total-skipped').textContent = tot.skipped;
  return stats;
}

// CSV export hook
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('download-stats-btn').onclick = async () => {
    const stats = await computeStats();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('F=ma Stats');
    ws.addRow(['Year\\Problem', ...Array.from({length:problemCount},(_,i)=>i+1)]);
    stats.forEach((row,rowIdx) => {
      const r = [ examOrder[rowIdx] ];
      row.forEach(cell => {
        const missed = cell.incorrect + cell.skipped;
        r.push(`${cell.correct}/${cell.overtime}/${missed}`);
      });
      ws.addRow(r);
    });
    // Color coding
    ws.eachRow((row,rowNum) => {
      if (rowNum===1) return;
      row.eachCell((cell,colNum) => {
        if (colNum===1) return;
        const [c,o,m] = cell.value.split('/').map(Number);
        const score = c + o*(-0.5) + m*(-2);
        let color = null;
        if (score > 0) color = 'FF8BC34A';
        else if (score === -0.5) color = 'FFFFEB3B';
        else if (score < -0.5) color = 'FFF44336';
        if (color) cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:color} };
      });
    });
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf],{type:'application/octet-stream'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'fma-stats.xlsx'; a.click();
    URL.revokeObjectURL(url);
  };
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
let zenCount=0, zenCorrect=0, zenOvertime=0, zenIncorrect=0, zenSkipped=0;
let skippedProblems=[], currentExam, currentNum, keyAnswers = [];
let zenTimer, zenTimeLeft, showPrev = false;

function startZen() {
  hideHeaderAndMenu();
  practiceEl.classList.remove('hidden');
  document.getElementById('end-practice-btn').onclick = showZenSummary;
  document.getElementById('skip-btn').onclick       = handleZenSkip;
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
    keyAnswers = (await (await fetch(`/static/images/fma/${currentExam}/key.txt`)).text())
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
    if (zenTimeLeft>0)  { zenCorrect++; fb.textContent='✅ CORRECT';     fb.style.color='green';   res='correct';  }
    else                { zenOvertime++;fb.textContent='⏰ OVERTIME';    fb.style.color='orange';  res='overtime'; }
  } else {
    zenIncorrect++;
    fb.textContent = `❌ INCORRECT (Answer: ${corr.join(' & ')})`;
    fb.style.color = 'red';
    res = 'incorrect';
  }
  logHistory({mode:'zen',exam:currentExam,num:currentNum,result:res});
  updateZenDisplay();
  const sb = document.getElementById('submit-btn');
  sb.textContent = 'Next';
  sb.onclick = loadZenProblem;
  document.getElementById('skip-btn').disabled = true;
}

function handleZenSkip() {
  clearInterval(zenTimer);
  const corr = keyAnswers[currentNum-1]?.split('').filter(c=>/[A-E]/.test(c))||[];
  zenSkipped++;
  skippedProblems.push(`Exam ${currentExam} #${currentNum}`);
  const fb = document.getElementById('feedback');
  fb.textContent = `❌ Gave Up (Answer: ${corr.join(' & ')})`;
  fb.style.color = 'red';
  logHistory({mode:'zen',exam:currentExam,num:currentNum,result:'skipped'});
  updateZenDisplay();
  const sk = document.getElementById('skip-btn');
  sk.textContent='Next';
  sk.onclick = loadZenProblem;
  document.getElementById('submit-btn').disabled = true;
}

function updateZenDisplay() {
  document.getElementById('problem-counter').textContent =
    `Problems: ${zenCount}`;
  document.getElementById('accuracy-summary').textContent =
    `CORRECT: ${zenCorrect} | OVERTIME: ${zenOvertime} | INCORRECT: ${zenIncorrect} | GAVE UP: ${zenSkipped}`;
}

function showZenSummary() {
  practiceEl.classList.add('hidden');
  summaryEl.classList.remove('hidden');
  document.getElementById('final-summary').innerHTML =
    `Total: ${zenCount}<br>` +
    `Correct (fast): ${zenCorrect}<br>` +
    `Correct (overtime): ${zenOvertime}<br>` +
    `Incorrect: ${zenIncorrect}<br>` +
    `Gave Up: ${zenSkipped}` +
    (zenSkipped ? `<br>Gave Up Problems:<br>${skippedProblems.join('<br>')}` : '');
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
    const txt = await (await fetch(`/static/images/fma/${p.exam}/key.txt`)).text();
    keyMap[`${p.exam}.${p.num}`] = txt.split(/\r?\n/).map(l=>l.trim().toUpperCase());
  }

  // Grade each
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
    keyAnswers = (await (await fetch(`/static/images/fma/${ex}/key.txt`)).text())
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
  const ans = document.getElementById('answer-speed').value.toUpperCase().trim();
  const corr = keyAnswers[currentNum-1]?.split('').filter(c=>/[A-E]/.test(c)) || [];
  const fb   = document.getElementById('feedback-speed');
  const exam = document.getElementById('exam-label-speed').textContent.match(/Exam (\\S+) #/)[1];
  if (corr.includes(ans)) {
    fb.textContent = '✅';
    logHistory({mode:'speed',exam, num: currentNum, result:'correct'});
  } else {
    fb.textContent = `❌ (Answer: ${corr.join('/')})`;
    logHistory({mode:'speed',exam, num: currentNum, result:'incorrect'});
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
