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

// Redirect if not signed in, then show greeting & stats
auth.onAuthStateChanged(user => {
    if (!user) {
    window.location.href = '/';
    } else {
    showGreeting(user);
    computeStats();
    }
});

// ---- Helpers for tracking & stats ----
// logHistory: write one {mode,exam,num,result} document
function logHistory(data) {
    const u = auth.currentUser;
    if (!u) return;
    db.collection('users').doc(u.uid)
    .collection('history')
    .add({
        ...data,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    })
    .catch(e => console.error('logHistory error', e));
}

// examOrder & problem count for CSV template
const examOrder = [
    '2007','2008','2009','2010','2011','2012','2013','2014',
    '2015','2016','2017','2018A','2018B','2019A','2019B',
    '2020A','2020B','2021','2022A','2022B','2023','2024'
];
const problemCount = 38;

// Display "Welcome back, USERNAME!"
function showGreeting(user) {
    const name = user.displayName || user.email.split('@')[0];
    document.getElementById('greeting').textContent = `Welcome back, ${name}!`;
}

// Read entire history, build stats[row][col], update totals display
async function computeStats() {
    const u = auth.currentUser;
    // init 2D stats array
    const stats = examOrder.map(() =>
    Array.from({length: problemCount}, () =>
        ({ correct:0, overtime:0, incorrect:0 })
    )
    );
    const snap = await db
    .collection('users').doc(u.uid)
    .collection('history')
    .get();

    snap.forEach(doc => {
    const { exam, num, result } = doc.data();
    const r = examOrder.indexOf(exam), c = num - 1;
    if (r >= 0 && c >= 0 && c < problemCount && stats[r][c][result] !== undefined) {
        stats[r][c][result]++;
    }
    });

    // compute totals
    const tot = { correct:0, overtime:0, incorrect:0};
    stats.forEach(row =>
    row.forEach(cell => {
        tot.correct   += cell.correct;
        tot.overtime  += cell.overtime;
        tot.incorrect += cell.incorrect;
    })
    );
    // update DOM
    document.getElementById('total-correct').textContent   = tot.correct;
    document.getElementById('total-overtime').textContent  = tot.overtime;
    document.getElementById('total-incorrect').textContent = tot.incorrect;

    return stats;
}

// Build & download CSV matching your template
window.addEventListener('load', () => {
document
.getElementById('download-stats-btn')
.addEventListener('click', async () => {
    try {
    const stats = await computeStats();
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('F=ma Stats');

    // header row
    ws.addRow([
        'Year\\Problem',
        ...Array.from({ length: problemCount }, (_, i) => i + 1),
    ]);

    // data rows
    stats.forEach((rowStats, rowIdx) => {
        const row = [examOrder[rowIdx]];
        rowStats.forEach(cell =>
        row.push(`${cell.correct}/${cell.overtime}/${cell.incorrect}`)
        );
        ws.addRow(row);
    });

    // apply coloring based on weighted score
    ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // skip header

        row.eachCell((cell, colNumber) => {
        if (colNumber === 1) return; // skip the Year label

        const [correct, overtime, wrong] = cell.value
            .split('/')
            .map(Number);

        // 1) if it's 0/0/0 → leave white
        if (correct === 0 && overtime === 0 && wrong === 0) {
            return;
        }

        // 2) compute weighted score
        const score = correct - 0.5 * overtime - 2 * wrong;

        // 3) pick fill color
        let fillColor;
        if (score > 0) {
            fillColor = 'FF8BC34A';   // green
        } else if (score >= -0.5) {
            fillColor = 'FFFFEB3B';   // yellow
        } else {
            fillColor = 'FFF44336';   // red
        }

        // 4) apply it
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: fillColor },
        };
        });
    });

    // write out and trigger download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fma-stats.xlsx';
    a.click();
    URL.revokeObjectURL(url);
    } catch (e) {
    console.error('Download error', e);
    }
});
});




// ----- PRACTICE LIST LOADER -----
let practiceList = [];
async function loadPracticeList() {
    try {
    const res = await fetch('/static/practice.txt');
    const text = await res.text();
    practiceList = text.split(/[,\s]+/).filter(s => s.trim());
    } catch(e) {
    console.error('practice list load error', e);
    }
}

// shared config
const config = {
    exams: examOrder,
    maxProblems: {
    '2007':38,'2008':25,'2009':25,'2010':25,'2011':25,'2012':25,
    '2013':25,'2014':25,'2015':25,'2016':25,'2017':25,'2018A':25,
    '2018B':25,'2019A':25,'2019B':25,'2020A':25,'2020B':25,
    '2021':25,'2022A':25,'2022B':25,'2023':25,'2024':25
    }
};

// element refs
const welcome = document.getElementById('welcome-page');
const practice = document.getElementById('practice-container');
const testMode = document.getElementById('test-container');
const speedMode = document.getElementById('speed-container');
const summary = document.getElementById('summary-container');
const practiceToggle = document.getElementById('practice-toggle');

window.addEventListener('DOMContentLoaded', async () => {
    await loadPracticeList();

    // Mode buttons
    document.getElementById('zen-btn').onclick = startZen;
    document.getElementById('test-btn').onclick = startTestMode;
    document.getElementById('speed-btn').onclick = startSpeedMode;

    // Restart
    document.getElementById('restart-btn').onclick = () => location.reload();

    // Test
    document.getElementById('begin-test-btn').onclick = setupTest;
    document.getElementById('submit-test-btn').onclick = () => {
    clearInterval(testTimerInterval);
    gradeTest(currentTestProblems);
    };

    // Speed
    document.getElementById('begin-speed-btn').onclick = initSpeed;
    document.getElementById('submit-speed-btn').onclick = handleSpeedSubmission;
});

// random problem helper
function getRandomProblem() {
    if (practiceToggle.checked && practiceList.length) {
    const entry = practiceList[Math.floor(Math.random()*practiceList.length)];
    const [exam, num] = entry.split('.');
    return [exam, parseInt(num,10)];
    }
    const exam = config.exams[Math.floor(Math.random()*config.exams.length)];
    const num  = Math.floor(Math.random()*config.maxProblems[exam]) + 1;
    return [exam,num];
}

// fetch image parts
async function fetchImageParts(exam,num) {
    const base = `/static/images/fma/${exam}/${num}`;
    const ext  = '.webp';
    const parts = [];
    for (const s of ['a','b','']) {
    try {
        const url = `${base}${s}${ext}`;
        const res = await fetch(url,{method:'HEAD'});
        if (res.ok) parts.push(url);
    } catch {}
    }
    return parts;
}

// timer display
function displayTimer(el,time) {
    if (time<=0) {
    el.textContent = 'OVERTIME';
    el.style.color = 'red';
    } else {
    const m = String(Math.floor(time/60)).padStart(2,'0');
    const s = String(time%60).padStart(2,'0');
    el.textContent = `${m}:${s}`;
    el.style.color = '#333';
    }
}

// ----- ZEN MODE -----
let zenCount=0, zenCorrect=0, zenOvertime=0, zenIncorrect=0;
let gaveupProblems=[]; let currentExam, currentNum, keyAnswers=[], zenTimer, zenTimeLeft;

function startZen() {
    welcome.classList.add('hidden');
    practice.classList.remove('hidden');
    document.getElementById('end-practice-btn').onclick = showZenSummary;
    document.getElementById('giveup-btn').onclick = handleZenSkip;
    loadZenProblem();
}
async function loadZenProblem() {
    // reset
    const submitBtn = document.getElementById('submit-btn'), skipBtn = document.getElementById('giveup-btn');
    submitBtn.disabled = skipBtn.disabled = false;
    skipBtn.textContent = 'Give Up'; skipBtn.onclick = handleZenSkip;

    zenCount++; updateZenDisplay();
    [currentExam,currentNum] = getRandomProblem();
    document.getElementById('exam-label').textContent = `Exam ${currentExam} #${currentNum}`;

    // show images
    const w = document.getElementById('image-wrapper');
    w.innerHTML = '<div class="loader"></div>';
    const imgs = await fetchImageParts(currentExam,currentNum);
    w.innerHTML = ''; imgs.forEach(src=>{
    const img=new Image(); img.src=src; img.className='problem-image'; w.appendChild(img);
    });

    // load key
    try {
    const t = await (await fetch(`/static/images/fma/${currentExam}/key.txt`)).text();
    keyAnswers = t.split(/\r?\n/).map(l=>l.trim().toUpperCase());
    } catch { keyAnswers=[]; }

    document.getElementById('answer').value=''; document.getElementById('feedback').textContent='';
    clearInterval(zenTimer);
    zenTimeLeft=240; displayTimer(document.getElementById('timer'),zenTimeLeft);
    zenTimer = setInterval(()=>{
    zenTimeLeft--; displayTimer(document.getElementById('timer'),zenTimeLeft);
    if (zenTimeLeft<=0) clearInterval(zenTimer);
    },1000);

    submitBtn.onclick = handleZenSubmission;
}
function handleZenSubmission() {
    clearInterval(zenTimer);
    const ans = document.getElementById('answer').value.toUpperCase().trim();
    const fb  = document.getElementById('feedback');
    const raw = keyAnswers[currentNum-1]||'';
    const corr= raw.split('').filter(c=>/[A-E]/.test(c));
    let result;
    if (!/^[A-E]$/.test(ans)) {
    fb.textContent='Enter A–E'; fb.style.color='darkorange'; return;
    }
    if (corr.includes(ans)) {
    if (zenTimeLeft>0) {
        zenCorrect++; fb.textContent='✅ CORRECT'; fb.style.color='green';
        result='correct';
    } else {
        zenOvertime++; fb.textContent='⏰ OVERTIME'; fb.style.color='orange';
        result='overtime';
    }
    } else {
    zenIncorrect++; fb.textContent=`❌ INCORRECT (Answer: ${corr.join(' & ')})`; fb.style.color='red';
    result='incorrect';
    }
    logHistory({mode:'zen',exam:currentExam,num:currentNum,result});
    updateZenDisplay();
    const sb=document.getElementById('submit-btn');
    sb.textContent='Next'; sb.onclick=loadZenProblem; sb.disabled=false;
    document.getElementById('giveup-btn').disabled=true;
}
function handleZenSkip() {
    clearInterval(zenTimer);
    const fb=document.getElementById('feedback');
    const raw=keyAnswers[currentNum-1]||'';
    const corr=raw.split('').filter(c=>/[A-E]/.test(c));
    zenIncorrect++; gaveupProblems.push(`Exam ${currentExam} #${currentNum}`);
    fb.textContent=`❌ Gave Up (Answer: ${corr.join(' & ')})`; fb.style.color='red';
    logHistory({mode:'zen',exam:currentExam,num:currentNum,result:'incorrect'});
    updateZenDisplay();
    const sk=document.getElementById('giveup-btn');
    sk.textContent='Next'; sk.onclick=loadZenProblem; sk.disabled=false;
    document.getElementById('submit-btn').disabled=true;
}
function updateZenDisplay() {
    document.getElementById('problem-counter').textContent=`Problems: ${zenCount}`;
    document.getElementById('accuracy-summary').textContent=
    `Correct: ${zenCorrect} | Overtime: ${zenOvertime} | Incorrect: ${zenIncorrect}`;
}
function showZenSummary() {
    practice.classList.add('hidden');
    summary.classList.remove('hidden');
    document.getElementById('final-summary').innerHTML=
    `Total: ${zenCount}<br>`+
    `Correct (fast): ${zenCorrect}<br>`+
    `Correct (overtime): ${zenOvertime}<br>`+
    `Incorrect: ${zenIncorrect}<br>`;
}

// ----- TEST MODE -----
let currentTestProblems=[], testTimeLeft, testTimerInterval;
function startTestMode() {
    welcome.classList.add('hidden'); testMode.classList.remove('hidden');
}
async function setupTest() {
    const mins = parseInt(document.getElementById('test-time-input').value,10);
    const cnt  = parseInt(document.getElementById('test-count-input').value,10);
    if (isNaN(mins)||isNaN(cnt)||mins<=0||cnt<=0) return;
    currentTestProblems=[];
    document.getElementById('test-settings').classList.add('hidden');
    document.getElementById('test-questions-form').classList.remove('hidden');
    testTimeLeft = mins*60;
    displayTimer(document.getElementById('test-timer-display'),testTimeLeft);
    clearInterval(testTimerInterval);
    testTimerInterval = setInterval(()=>{
    testTimeLeft--; displayTimer(document.getElementById('test-timer-display'),testTimeLeft);
    if (testTimeLeft<=0) clearInterval(testTimerInterval);
    },1000);
    const div = document.getElementById('test-questions');
    div.innerHTML='';
    for(let i=0;i<cnt;i++){
    const [ex,num]=getRandomProblem();
    currentTestProblems.push({exam:ex,num});
    const w=document.createElement('div');
    w.className='problem-wrapper';
    w.innerHTML=
        `<h4>${i+1}. Exam ${ex} #${num}</h4>
        <div id="test-img-${i}"><div class="loader"></div></div>
        <div class="answer-box">
            <input type="text" id="ans-${i}" maxlength="1" placeholder="A–E"/>
        </div>`;
    div.appendChild(w);
    (async()=>{
        const parts=await fetchImageParts(ex,num);
        const ct=document.getElementById(`test-img-${i}`);
        ct.innerHTML='';
        parts.forEach(src=>{
        const img=new Image(); img.src=src; img.className='problem-image'; ct.appendChild(img);
        });
    })();
    }
}
async function gradeTest(probs){
    clearInterval(testTimerInterval);
    const keys={};
    for(const p of probs){
    const txt=await (await fetch(`/static/images/fma/${p.exam}/key.txt`)).text();
    keys[`${p.exam}.${p.num}`]=txt.split(/\r?\n/).map(l=>l.trim().toUpperCase());
    }
    let correct=0;
    const wrs=document.querySelectorAll('#test-questions .problem-wrapper');
    probs.forEach((p,i)=>{
    const ans = document.getElementById(`ans-${i}`).value.toUpperCase().trim();
    const raw = keys[`${p.exam}.${p.num}`][p.num-1]||'';
    const corr= raw.split('').filter(c=>/[A-E]/.test(c));
    const res=document.createElement('div'); res.className='result-text';
    let result;
    if(corr.includes(ans)){
        correct++; res.textContent='✅'; result='correct';
    } else {
        res.textContent=`❌ (Answer: ${corr.join(',')})`; result='incorrect';
    }
    wrs[i].appendChild(res);
    logHistory({mode:'test',exam:p.exam,num:p.num,result});
    });
    document.getElementById('test-questions')
    .insertAdjacentHTML('beforeend',`<h3>Score: ${correct}/${probs.length}</h3>`);
    document.getElementById('submit-test-btn').disabled=true;
}

// ----- SPEED MODE -----
let speedTime, speedTimerInterval, speedCount=0;
function startSpeedMode() {
    welcome.classList.add('hidden'); speedMode.classList.remove('hidden');
}
function initSpeed(){
    const mins=parseInt(document.getElementById('speed-time-input').value,10);
    if(isNaN(mins)||mins<=0) return;
    speedTime=mins*60; speedCount=0;
    document.getElementById('speed-settings').classList.add('hidden');
    document.getElementById('speed-problem-area').classList.remove('hidden');
    loadSpeedProblem();
    speedTimerInterval = setInterval(()=>{
    speedTime--; displayTimer(document.getElementById('speed-timer-display'),speedTime);
    if(speedTime<=0) finishSpeed();
    },1000);
}
async function loadSpeedProblem(){
    speedCount++;
    document.getElementById('speed-counter').textContent=`Solved: ${speedCount-1}`;
    [currentExam,currentNum]=getRandomProblem();
    document.getElementById('exam-label-speed').textContent=`Exam ${currentExam} #${currentNum}`;
    const w=document.getElementById('image-wrapper-speed');
    w.innerHTML='<div class="loader"></div>';
    (await fetchImageParts(currentExam,currentNum)).forEach(src=>{
    const img=new Image(); img.src=src; img.className='problem-image'; w.appendChild(img);
    });
    document.getElementById('answer-speed').value=''; document.getElementById('feedback-speed').textContent='';
    try {
    const txt=await (await fetch(`/static/images/fma/${currentExam}/key.txt`)).text();
    keyAnswers = txt.split(/\r?\n/).map(l=>l.trim().toUpperCase());
    } catch { keyAnswers=[]; }
}
function handleSpeedSubmission(){
    const ans=document.getElementById('answer-speed').value.toUpperCase().trim();
    const fb=document.getElementById('feedback-speed');
    const raw=keyAnswers[currentNum-1]||'';
    const corr=raw.split('').filter(c=>/[A-E]/.test(c));
    let result;
    if(corr.includes(ans)){
    fb.textContent='✅'; result='correct';
    } else {
    fb.textContent=`❌ (Answer: ${corr.join('/')})`; result='incorrect';
    }
    logHistory({mode:'speed',exam:currentExam,num:currentNum,result});
    loadSpeedProblem();
}
function finishSpeed(){
    clearInterval(speedTimerInterval);
    speedMode.classList.add('hidden');
    summary.classList.remove('hidden');
    document.getElementById('final-summary').textContent=`Problems Solved: ${speedCount-1}`;
}
// helper to hide header + menu
function hideHeaderAndMenu() {
document.getElementById('stats-container').classList.add('hidden');
document.getElementById('welcome-page').classList.add('hidden');
}

// wrap the existing start functions
const _origStartZen   = startZen;
const _origStartTest  = startTestMode;
const _origStartSpeed = startSpeedMode;

startZen       = () => { hideHeaderAndMenu(); _origStartZen(); };
startTestMode  = () => { hideHeaderAndMenu(); _origStartTest(); };
startSpeedMode = () => { hideHeaderAndMenu(); _origStartSpeed(); };