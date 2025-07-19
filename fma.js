// fma.js

// Initialize Firebase
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

// Redirect if not signed in, then show greeting & stats
auth.onAuthStateChanged(user => {
  if (!user) {
    window.location.href = '/';
  } else {
    showGreeting(user);
    computeStats();
  }
});

// Helper: logHistory
function logHistory(data) {
  const u = auth.currentUser;
  if (!u) return;
  db.collection('users').doc(u.uid)
    .collection('history')
    .add({ ...data, timestamp: firebase.firestore.FieldValue.serverTimestamp() })
    .catch(e => console.error('logHistory error', e));
}

// Stats & CSV functionality
const examOrder = [
  '2007','2008','2009','2010','2011','2012','2013','2014',
  '2015','2016','2017','2018A','2018B','2019A','2019B',
  '2020A','2020B','2021','2022A','2022B','2023','2024'
];
const problemCount = 38;

function showGreeting(user) {
  const name = user.displayName || user.email.split('@')[0];
  document.getElementById('greeting').textContent = `Welcome back, ${name}!`;
}

async function computeStats() {
  const u = auth.currentUser;
  const stats = examOrder.map(() =>
    Array.from({length: problemCount}, () => ({correct:0,overtime:0,incorrect:0,skipped:0}))
  );
  const snap = await db.collection('users').doc(u.uid).collection('history').get();
  snap.forEach(doc => {
    const {exam,num,result} = doc.data();
    const r = examOrder.indexOf(exam), c = num - 1;
    if (r >= 0 && c >= 0 && c < problemCount && stats[r][c][result] !== undefined) {
      stats[r][c][result]++;
    }
  });
  const tot = {correct:0,overtime:0,incorrect:0,skipped:0};
  stats.forEach(row => row.forEach(cell => {
    tot.correct   += cell.correct;
    tot.overtime  += cell.overtime;
    tot.incorrect += cell.incorrect;
    tot.skipped   += cell.skipped;
  }));
  document.getElementById('total-correct').textContent = tot.correct;
  document.getElementById('total-overtime').textContent = tot.overtime;
  document.getElementById('total-incorrect').textContent = tot.incorrect;
  document.getElementById('total-skipped').textContent = tot.skipped;
  return stats;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('download-stats-btn').onclick = async () => {
    const stats = await computeStats();
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('F=ma Stats');
    ws.addRow(['Year\\Problem', ...Array.from({length: problemCount}, (_, i) => i+1)]);
    stats.forEach((rowStats, rowIdx) => {
      const row = [examOrder[rowIdx]];
      rowStats.forEach(cell => {
        const missed = cell.incorrect + cell.skipped;
        row.push(`${cell.correct}/${cell.overtime}/${missed}`);
      });
      ws.addRow(row);
    });
    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      row.eachCell((cell, colNum) => {
        if (colNum === 1) return;
        const [c,o,m] = cell.value.split('/').map(Number);
        const score = c*1 + o*(-0.5) + m*(-2);
        let color = null;
        if (score > 0) color = 'FF8BC34A';
        else if (score === -0.5) color = 'FFFFEB3B';
        else if (score < -0.5) color = 'FFF44336';
        if (color) {
          cell.fill = {type:'pattern',pattern:'solid',fgColor:{argb:color}};
        }
      });
    });
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {type:'application/octet-stream'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'fma-stats.xlsx'; a.click();
    URL.revokeObjectURL(url);
  };
});

// Practice Loader & Helpers
let practiceList = [];
async function loadPracticeList() {
  try {
    const res = await fetch('/static/practice.txt');
    const text = await res.text();
    practiceList = text.split(/[,\s]+/).filter(s => s.trim());
  } catch (e) {
    console.error('Practice list load error', e);
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

function getRandomProblem() {
  if (document.getElementById('practice-toggle').checked && practiceList.length) {
    const entry = practiceList[Math.floor(Math.random()*practiceList.length)];
    const [exam, num] = entry.split('.');
    return [exam, parseInt(num, 10)];
  }
  const exam = config.exams[Math.floor(Math.random()*config.exams.length)];
  const num  = Math.floor(Math.random()*config.maxProblems[exam]) + 1;
  return [exam, num];
}

async function fetchImageParts(exam, num) {
  const base = `/static/images/fma/${exam}/${num}`;
  const ext  = '.webp';
  const parts = [];
  for (const suffix of ['a','b','']) {
    try {
      const url = `${base}${suffix}${ext}`;
      const res = await fetch(url, {method: 'HEAD'});
      if (res.ok) parts.push(url);
    } catch {}
  }
  return parts;
}

function displayTimer(el, time) {
  if (time <= 0) {
    el.textContent = 'OVERTIME';
    el.style.color = 'red';
  } else {
    const m = String(Math.floor(time/60)).padStart(2,'0');
    const s = String(time % 60).padStart(2,'0');
    el.textContent = `${m}:${s}`;
    el.style.color = '#333';
  }
}

// Element References
const welcome   = document.getElementById('welcome-page');
const practice  = document.getElementById('practice-container');
const testMode  = document.getElementById('test-container');
const speedMode = document.getElementById('speed-container');
const summary   = document.getElementById('summary-container');

// Initialization
window.addEventListener('DOMContentLoaded', async () => {
  await loadPracticeList();
  document.getElementById('zen-btn').onclick   = startZen;
  document.getElementById('test-btn').onclick  = startTestMode;
  document.getElementById('speed-btn').onclick = startSpeedMode;
  document.getElementById('restart-btn').onclick = () => location.reload();

  document.getElementById('begin-test-btn').onclick   = setupTest;
  document.getElementById('submit-test-btn').onclick  = () => { clearInterval(testTimerInterval); gradeTest(currentTestProblems); };

  document.getElementById('begin-speed-btn').onclick  = initSpeed;
  document.getElementById('submit-speed-btn').onclick = handleSpeedSubmission;
});

// Zen Mode Logic
let zenCount=0, zenCorrect=0, zenOvertime=0, zenIncorrect=0, zenSkipped=0;
let skippedProblems = [];
let currentExam, currentNum, keyAnswers = [];
let zenTimer, zenTimeLeft, showPrev = false;

function startZen() {
  hideHeaderAndMenu();
  practice.classList.remove('hidden');
  document.getElementById('end-practice-btn').onclick = showZenSummary;
  document.getElementById('skip-btn').onclick       = handleZenSkip;
  loadZenProblem();
}

async function loadZenProblem() {
  // ... toggle and image loading logic ...
}

function handleZenSubmission() { /* ... */ }
function handleZenSkip()       { /* ... */ }
function updateZenDisplay()    { /* ... */ }
function showZenSummary()      { /* ... */ }

// Test Mode Logic
let currentTestProblems = [], testTimeLeft, testTimerInterval;
function startTestMode() { /* ... */ }
async function setupTest() { /* ... */ }
async function gradeTest(p) { /* ... */ }

// Speed Mode Logic
let speedTime, speedTimerInterval, speedCount=0;
function startSpeedMode() { /* ... */ }
function initSpeed()       { /* ... */ }
async function loadSpeedProblem() { /* ... */ }
function handleSpeedSubmission() { /* ... */ }
function finishSpeed()          { /* ... */ }

// Helper to hide header & menu
function hideHeaderAndMenu() {
  document.getElementById('stats-container').classList.add('hidden');
  welcome.classList.add('hidden');
}
