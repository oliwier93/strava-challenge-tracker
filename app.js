const ACTIVITY_TYPES = {
    running: { icon: '\u{1F3C3}', label: 'Bieganie' },
    cycling: { icon: '\u{1F6B4}', label: 'Rower' },
    walking: { icon: '\u{1F6B6}', label: 'Spacer' },
    other:   { icon: '\u{1F4AA}', label: 'Inna' },
};

// ── Toast & custom confirm ──────────────────────────────────────────

let toastTimer;
function showToast(msg, type = 'error') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast ' + type;
    clearTimeout(toastTimer);
    requestAnimationFrame(() => { t.classList.add('visible'); });
    toastTimer = setTimeout(() => t.classList.remove('visible'), 3000);
}

let confirmResolver = null;
function customConfirm(msg) {
    return new Promise(resolve => {
        confirmResolver = resolve;
        document.getElementById('confirmMessage').textContent = msg;
        document.getElementById('confirmModal').classList.add('active');
    });
}
function resolveConfirm(val) {
    document.getElementById('confirmModal').classList.remove('active');
    if (confirmResolver) { confirmResolver(val); confirmResolver = null; }
}

// ── Data layer ──────────────────────────────────────────────────────

let _data = null;

function loadData() {
    if (!_data) _data = { events: [], activities: [], activeEventId: null };
    return _data;
}

function saveData(data) {
    _data = data;
    fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    }).catch(() => showToast('Nie uda\u0142o si\u0119 zapisa\u0107 danych na serwer.'));
}

async function loadDataFromServer() {
    try {
        const res = await fetch('/api/data');
        _data = await res.json();
    } catch {
        const raw = localStorage.getItem('strava-challenge-data');
        if (raw) {
            _data = JSON.parse(raw);
            if (!_data.activities) {
                _data.activities = [];
                for (const ev of _data.events) {
                    if (ev.activities) {
                        _data.activities.push(...ev.activities);
                        delete ev.activities;
                    }
                }
            }
            saveData(_data);
            localStorage.removeItem('strava-challenge-data');
        } else {
            _data = { events: [], activities: [], activeEventId: null };
        }
    }
}

function getActiveEvent() {
    const data = loadData();
    return data.events.find(e => e.id === data.activeEventId) || null;
}

function getEventActivities(event, data) {
    if (!event || !event.startDate || !event.endDate) return [];
    return data.activities.filter(a => a.date >= event.startDate && a.date <= event.endDate);
}

// ── Helpers ──────────────────────────────────────────────────────────

function parseTimeToMinutes(input) {
    input = input.trim();
    if (!input) return NaN;
    if (input.includes(':')) {
        const parts = input.split(':').map(Number);
        if (parts.some(isNaN)) return NaN;
        if (parts.length === 3) return Math.round(parts[0] * 60 + parts[1] + parts[2] / 60);
        if (parts.length === 2) return Math.round(parts[0] + parts[1] / 60);
        return NaN;
    }
    const num = parseFloat(input);
    return isNaN(num) || num <= 0 ? NaN : Math.round(num);
}

function minutesToHHMM(mins) {
    const roundedMinutes = Math.max(0, Math.round(mins));
    const h = Math.floor(roundedMinutes / 60);
    const m = roundedMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatMinutesWithClock(mins) {
    const roundedMinutes = Math.max(0, Math.round(mins));
    return `${roundedMinutes} min (${minutesToHHMM(roundedMinutes)})`;
}

function getLocalDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function dateStringToUtcMs(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
}

function diffDays(startDateStr, endDateStr) {
    return Math.round((dateStringToUtcMs(endDateStr) - dateStringToUtcMs(startDateStr)) / 86400000);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ── Render: event selector ──────────────────────────────────────────

function renderEventSelect() {
    const data = loadData();
    const sel = document.getElementById('eventSelect');
    const emptyPrompt = document.getElementById('emptyEventPrompt');
    const barWrapper = document.getElementById('eventBarWrapper');
    const progressSection = document.querySelector('.progress-section');

    if (data.events.length === 0) {
        emptyPrompt.style.display = 'block';
        barWrapper.style.display = 'none';
        progressSection.style.display = 'none';
    } else {
        emptyPrompt.style.display = 'none';
        barWrapper.style.display = 'block';
        progressSection.style.display = 'block';
        sel.innerHTML = data.events.map(e =>
            `<option value="${e.id}" ${e.id === data.activeEventId ? 'selected' : ''}>${e.name}</option>`
        ).join('');
    }

    const event = data.events.find(e => e.id === data.activeEventId);
    const datesEl = document.getElementById('eventDates');
    if (event && event.startDate && event.endDate) {
        datesEl.textContent = `${formatDate(event.startDate)} \u2014 ${formatDate(event.endDate)}`;
    } else {
        datesEl.textContent = '';
    }
}

document.getElementById('eventSelect').addEventListener('change', function() {
    const data = loadData();
    data.activeEventId = parseInt(this.value);
    selectedGoal = null;
    saveData(data);
    renderAll();
});

// ── Render: progress ────────────────────────────────────────────────

let selectedGoal = null;

function selectGoal(minutes, points) {
    if (selectedGoal && selectedGoal.minutes === minutes && selectedGoal.points === points) {
        selectedGoal = null;
    } else {
        selectedGoal = { minutes, points };
    }
    renderProgress();
}

function renderProgress() {
    const data = loadData();
    const event = getActiveEvent();
    const goalEl = document.getElementById('goalAnalysis');
    const guidesEl = document.getElementById('progressThresholdGuides');

    if (!event) {
        selectedGoal = null;
        document.getElementById('totalMinutes').innerHTML = '0 <span>min (00:00)</span>';
        document.getElementById('progressBar').style.width = '0%';
        document.getElementById('thresholdMarkers').innerHTML = '';
        guidesEl.innerHTML = '';
        document.getElementById('rewardValue').textContent = '0 pkt';
        document.getElementById('nextThreshold').textContent = '';
        goalEl.innerHTML = '';
        goalEl.classList.remove('visible');
        return;
    }

    const matched = getEventActivities(event, data);
    const totalMins = matched.reduce((sum, a) => sum + a.minutes, 0);
    document.getElementById('totalMinutes').innerHTML = `${totalMins} <span>min (${minutesToHHMM(totalMins)})</span>`;

    const thresholds = [...event.thresholds].sort((a, b) => a.minutes - b.minutes);
    if (selectedGoal) {
        const activeGoal = thresholds.find(t => t.minutes === selectedGoal.minutes);
        selectedGoal = activeGoal ? { minutes: activeGoal.minutes, points: activeGoal.points } : null;
    }
    const maxThreshold = thresholds.length > 0 ? thresholds[thresholds.length - 1].minutes : 1000;
    const progressMax = maxThreshold * 1.1;
    const pct = Math.min((totalMins / progressMax) * 100, 100);
    document.getElementById('progressBar').style.width = pct + '%';

    const markersEl = document.getElementById('thresholdMarkers');
    markersEl.innerHTML = thresholds.map(t => {
        const left = (t.minutes / progressMax) * 100;
        const achieved = totalMins >= t.minutes;
        const selected = selectedGoal && selectedGoal.minutes === t.minutes;
        const title = `Sprawdź tempo dla progu ${t.minutes} min`;
        return `<button type="button" class="threshold-marker ${achieved ? 'achieved' : ''} ${selected ? 'selected' : ''}" style="left:${left}%" data-mins="${t.minutes}" data-pts="${t.points}" aria-pressed="${selected ? 'true' : 'false'}" title="${title}">
            <div class="mins">${t.minutes} min</div>
            <div>${t.points} pkt</div>
        </button>`;
    }).join('');

    guidesEl.innerHTML = thresholds.map(t => {
        const left = (t.minutes / progressMax) * 100;
        const achieved = totalMins >= t.minutes;
        const selected = selectedGoal && selectedGoal.minutes === t.minutes;
        return `<span class="progress-threshold-guide ${achieved ? 'achieved' : ''} ${selected ? 'selected' : ''}" style="left:${left}%"></span>`;
    }).join('');

    let currentPoints = 0;
    let nextThreshold = null;
    for (const t of thresholds) {
        if (totalMins >= t.minutes) {
            currentPoints = t.points;
        } else if (!nextThreshold) {
            nextThreshold = t;
        }
    }

    document.getElementById('rewardValue').textContent = `${currentPoints} pkt`;

    const nextEl = document.getElementById('nextThreshold');
    if (nextThreshold) {
        const remaining = nextThreshold.minutes - totalMins;
        nextEl.textContent = `Do nast\u0119pnego progu (${nextThreshold.points} pkt): brakuje ${formatMinutesWithClock(remaining)}`;
    } else if (thresholds.length > 0) {
        nextEl.textContent = 'Wszystkie progi osi\u0105gni\u0119te!';
    } else {
        nextEl.textContent = '';
    }

    renderGoalAnalysis(event, matched, totalMins);
}

function renderGoalAnalysis(event, activities, totalMins) {
    const el = document.getElementById('goalAnalysis');

    if (!selectedGoal) {
        el.innerHTML = '';
        el.classList.remove('visible');
        return;
    }

    const goal = selectedGoal.minutes;
    const goalPts = selectedGoal.points;
    const todayStr = getLocalDateString();
    const totalDays = diffDays(event.startDate, event.endDate) + 1;
    const eventEnded = todayStr > event.endDate;
    const eventNotStarted = todayStr < event.startDate;
    const goalReached = totalMins >= goal;

    const todayMins = activities
        .filter(a => a.date === todayStr)
        .reduce((sum, a) => sum + a.minutes, 0);
    const hadTrainingToday = todayMins > 0;

    const avgPerDay = goal / totalDays;
    const trackedDays = eventNotStarted
        ? 0
        : (eventEnded ? totalDays : diffDays(event.startDate, todayStr) + 1);
    const yourPerDay = trackedDays > 0 ? totalMins / trackedDays : 0;
    const deltaMinutes = trackedDays > 0 ? totalMins - (avgPerDay * trackedDays) : 0;
    const remainingDaysAfterToday = eventEnded || eventNotStarted ? 0 : diffDays(todayStr, event.endDate);
    const remainingToGoal = Math.max(goal - totalMins, 0);

    let forecastCard = `
        <article class="goal-metric-card muted">
            <span class="goal-metric-label">Forecast na jutro</span>
            <strong class="goal-metric-main">--:--</strong>
            <span class="goal-metric-foot">pojawi si\u0119 po treningu dzisiaj</span>
        </article>`;
    if (eventNotStarted) {
        forecastCard = `
            <article class="goal-metric-card muted">
                <span class="goal-metric-label">Forecast na jutro</span>
                <strong class="goal-metric-main">--:--</strong>
                <span class="goal-metric-foot">dost\u0119pny po starcie eventu</span>
            </article>`;
    } else if (goalReached) {
        forecastCard = `
            <article class="goal-metric-card muted">
                <span class="goal-metric-label">Forecast na jutro</span>
                <strong class="goal-metric-main">--:--</strong>
                <span class="goal-metric-foot">cel jest ju\u017C domkni\u0119ty</span>
            </article>`;
    } else if (eventEnded || remainingDaysAfterToday <= 0) {
        forecastCard = `
            <article class="goal-metric-card muted">
                <span class="goal-metric-label">Forecast na jutro</span>
                <strong class="goal-metric-main">--:--</strong>
                <span class="goal-metric-foot">brak kolejnego dnia eventu</span>
            </article>`;
    } else if (hadTrainingToday) {
        const remainingAfterToday = Math.max(goal - totalMins, 0);
        const tomorrowRequired = Math.ceil(remainingAfterToday / remainingDaysAfterToday);
        forecastCard = `
            <article class="goal-metric-card">
                <span class="goal-metric-label">Forecast na jutro</span>
                <strong class="goal-metric-main">${minutesToHHMM(tomorrowRequired)}</strong>
                <span class="goal-metric-foot">minimum na dzie\u0144</span>
            </article>`;
    }

    function deltaLabel(delta) {
        const absDelta = Math.abs(Math.round(delta));
        if (absDelta === 0) {
            return '<span class="goal-delta on-track">R\u00F3wno z planem</span>';
        }
        if (delta > 0) {
            return `<span class="goal-delta ahead">+${formatMinutesWithClock(absDelta)}</span>`;
        }
        return `<span class="goal-delta behind">-${formatMinutesWithClock(absDelta)}</span>`;
    }

    let yourTempoCard = `
        <article class="goal-metric-card muted">
            <span class="goal-metric-label">Twoje tempo</span>
            <strong class="goal-metric-main">--:--</strong>
            <span class="goal-metric-foot">wystartuje z eventem</span>
        </article>`;
    if (!eventNotStarted) {
        yourTempoCard = `
            <article class="goal-metric-card">
                <span class="goal-metric-label">Twoje tempo</span>
                <div class="goal-metric-main-row">
                    <strong class="goal-metric-main">${minutesToHHMM(yourPerDay)}</strong>
                    ${deltaLabel(deltaMinutes)}
                </div>
                <span class="goal-metric-foot">na dzie\u0144</span>
            </article>`;
    }

    let statusClass = 'neutral';
    let statusLabel = 'Do celu zosta\u0142o';
    let statusText = formatMinutesWithClock(remainingToGoal);
    if (eventNotStarted) {
        statusLabel = 'Start wyzwania';
        statusText = formatDate(event.startDate);
    } else if (goalReached) {
        const surplus = Math.max(totalMins - goal, 0);
        statusClass = 'success';
        statusLabel = surplus > 0 ? 'Masz zapas' : 'Cel osi\u0105gni\u0119ty';
        statusText = surplus > 0 ? formatMinutesWithClock(surplus) : `${goalPts} pkt gotowe`;
    } else if (eventEnded) {
        statusClass = 'danger';
        statusLabel = 'Zabrak\u0142o';
        statusText = formatMinutesWithClock(goal - totalMins);
    }

    el.innerHTML = `
        <div class="goal-summary ${statusClass}">
            <span class="goal-summary-label">${statusLabel}</span>
            <strong class="goal-summary-value">${statusText}</strong>
        </div>
        <div class="goal-metrics">
            <article class="goal-metric-card">
                <span class="goal-metric-label">\u015Arednie tempo</span>
                <strong class="goal-metric-main">${minutesToHHMM(avgPerDay)}</strong>
                <span class="goal-metric-foot">na dzie\u0144</span>
            </article>
            ${yourTempoCard}
            ${forecastCard}
        </div>
    `;
    el.classList.add('visible');
}

// ── Render: activities ──────────────────────────────────────────────

let showAllActivities = false;
let currentPage = 1;
const PAGE_SIZE = 10;

function toggleShowAll() {
    showAllActivities = !showAllActivities;
    currentPage = 1;
    document.getElementById('toggleEventOnly').classList.toggle('active', showAllActivities);
    renderActivities();
}

function renderActivities() {
    const data = loadData();
    const event = getActiveEvent();
    const listEl = document.getElementById('activitiesList');
    const paginationEl = document.getElementById('pagination');

    const eventActivities = event ? getEventActivities(event, data) : [];
    const activities = showAllActivities ? eventActivities : data.activities;

    if (activities.length === 0) {
        const msg = showAllActivities ? 'Brak aktywno\u015Bci w okresie tego eventu.' : 'Brak aktywno\u015Bci. Dodaj pierwsz\u0105!';
        listEl.innerHTML = `<div class="no-activities">${msg}</div>`;
        paginationEl.style.display = 'none';
        return;
    }

    const sorted = [...activities].sort((a, b) => new Date(b.date) - new Date(a.date));
    const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = sorted.slice(start, start + PAGE_SIZE);

    const eventStart = event?.startDate || '';
    const eventEnd = event?.endDate || '';

    listEl.innerHTML = pageItems.map(a => {
        const inEvent = a.date >= eventStart && a.date <= eventEnd;
        const badge = inEvent ? '<span class="event-badge" title="Liczy si\u0119 do eventu"></span>' : '';
        const stravaBadge = a.strava_id ? '<span class="strava-badge" title="Ze Stravy">S</span>' : '';
        const typeInfo = ACTIVITY_TYPES[a.type] || ACTIVITY_TYPES.other;
        return `<div class="activity-item">
            <div class="activity-info">
                <div class="activity-type-icon" title="${typeInfo.label}">${typeInfo.icon}</div>
                <div class="activity-details">
                    <div class="activity-name">${badge}${stravaBadge}${escapeHtml(a.name)}</div>
                    <div class="activity-date">${formatDate(a.date)}</div>
                </div>
            </div>
            <div class="activity-minutes">${minutesToHHMM(a.minutes)}</div>
            <div class="activity-actions">
                <button class="icon-btn edit" title="Edytuj" onclick="startEditActivity(${a.id})">&#9998;</button>
                <button class="icon-btn delete" title="Usu\u0144" onclick="deleteActivity(${a.id})">&#10005;</button>
            </div>
        </div>`;
    }).join('');

    // Pagination
    if (totalPages <= 1) {
        paginationEl.style.display = 'none';
    } else {
        paginationEl.style.display = 'flex';
        document.getElementById('pageInfo').textContent = `${currentPage} / ${totalPages}`;
        document.getElementById('prevPageBtn').disabled = currentPage <= 1;
        document.getElementById('nextPageBtn').disabled = currentPage >= totalPages;
    }
}

function goToPage(delta) {
    currentPage += delta;
    renderActivities();
}

// ── Activities CRUD ─────────────────────────────────────────────────

let editingActivityId = null;

function openActivityModal() {
    editingActivityId = null;
    document.getElementById('actModalTitle').textContent = 'Dodaj aktywno\u015B\u0107';
    document.getElementById('actModalSubmitBtn').textContent = 'Dodaj';
    document.getElementById('actType').value = 'running';
    document.getElementById('actName').value = '';
    document.getElementById('actTime').value = '';
    document.getElementById('actDate').value = getLocalDateString();
    document.getElementById('activityModal').classList.add('active');
    document.getElementById('actName').focus();
}

function closeActivityModal() {
    document.getElementById('activityModal').classList.remove('active');
    editingActivityId = null;
}

function startEditActivity(actId) {
    const data = loadData();
    const act = data.activities.find(a => a.id === actId);
    if (!act) return;

    editingActivityId = actId;
    document.getElementById('actModalTitle').textContent = 'Edytuj aktywno\u015B\u0107';
    document.getElementById('actModalSubmitBtn').textContent = 'Zapisz';
    document.getElementById('actType').value = act.type || 'other';
    document.getElementById('actName').value = act.name;
    const h = Math.floor(act.minutes / 60);
    const m = act.minutes % 60;
    document.getElementById('actTime').value = `${h}:${String(m).padStart(2, '0')}:00`;
    document.getElementById('actDate').value = act.date;
    document.getElementById('activityModal').classList.add('active');
}

function submitActivity() {
    const data = loadData();

    const type = document.getElementById('actType').value;
    const name = document.getElementById('actName').value.trim();
    const timeInput = document.getElementById('actTime').value;
    const minutes = parseTimeToMinutes(timeInput);
    const date = document.getElementById('actDate').value;

    if (!name || isNaN(minutes) || minutes <= 0) {
        showToast('Podaj nazw\u0119 i prawid\u0142owy czas.');
        if (!name) document.getElementById('actName').classList.add('invalid');
        if (isNaN(minutes) || minutes <= 0) document.getElementById('actTime').classList.add('invalid');
        return;
    }
    document.getElementById('actName').classList.remove('invalid');
    document.getElementById('actTime').classList.remove('invalid');

    if (editingActivityId) {
        const act = data.activities.find(a => a.id === editingActivityId);
        if (act) {
            act.type = type;
            act.name = name;
            act.minutes = minutes;
            act.date = date || getLocalDateString();
        }
    } else {
        data.activities.push({
            id: Date.now(),
            type,
            name,
            minutes,
            date: date || getLocalDateString()
        });
    }

    saveData(data);
    closeActivityModal();
    renderAll();
}

function deleteActivity(actId) {
    const data = loadData();
    data.activities = data.activities.filter(a => a.id !== actId);
    saveData(data);
    renderAll();
}

// ── Event CRUD ──────────────────────────────────────────────────────

let editingEventId = null;

function openNewEventModal() {
    editingEventId = null;
    document.getElementById('modalTitle').textContent = 'Nowy event';
    document.getElementById('eventName').value = '';
    document.getElementById('eventStartDate').value = '';
    document.getElementById('eventEndDate').value = '';
    document.getElementById('thresholdInputs').innerHTML = '';
    addThresholdRow();
    addThresholdRow();
    document.getElementById('eventModal').classList.add('active');
}

function openEditEventModal() {
    const event = getActiveEvent();
    if (!event) return;
    editingEventId = event.id;
    document.getElementById('modalTitle').textContent = 'Edytuj event';
    document.getElementById('eventName').value = event.name;
    document.getElementById('eventStartDate').value = event.startDate || '';
    document.getElementById('eventEndDate').value = event.endDate || '';
    document.getElementById('thresholdInputs').innerHTML = '';
    event.thresholds.forEach(t => addThresholdRow(t.minutes, t.points));
    document.getElementById('eventModal').classList.add('active');
}

function closeModal() {
    document.getElementById('eventModal').classList.remove('active');
}

function addThresholdRow(mins = '', pts = '') {
    const container = document.getElementById('thresholdInputs');
    const row = document.createElement('div');
    row.className = 'threshold-input-row';
    row.innerHTML = `
        <input type="number" placeholder="Minuty" value="${mins}" class="thresh-mins" min="1">
        <span style="color:#888">\u2192</span>
        <input type="number" placeholder="Punkty" value="${pts}" class="thresh-pts" min="1">
        <button class="icon-btn delete" onclick="this.parentElement.remove()" title="Usu\u0144 pr\u00f3g">&#10005;</button>
    `;
    container.appendChild(row);
}

function saveEvent() {
    const name = document.getElementById('eventName').value.trim();
    if (!name) { showToast('Podaj nazw\u0119 eventu.'); return; }

    const startDate = document.getElementById('eventStartDate').value;
    const endDate = document.getElementById('eventEndDate').value;
    if (!startDate || !endDate) { showToast('Podaj daty od-do eventu.'); return; }
    if (startDate > endDate) { showToast('Data "od" musi by\u0107 przed dat\u0105 "do".'); return; }

    const rows = document.querySelectorAll('#thresholdInputs .threshold-input-row');
    const thresholds = [];
    rows.forEach(row => {
        const mins = parseInt(row.querySelector('.thresh-mins').value);
        const pts = parseInt(row.querySelector('.thresh-pts').value);
        if (mins > 0 && pts > 0) {
            thresholds.push({ minutes: mins, points: pts });
        }
    });

    const data = loadData();

    if (editingEventId) {
        const event = data.events.find(e => e.id === editingEventId);
        if (event) {
            event.name = name;
            event.startDate = startDate;
            event.endDate = endDate;
            event.thresholds = thresholds;
        }
    } else {
        const newEvent = {
            id: Date.now(),
            name,
            startDate,
            endDate,
            thresholds,
        };
        data.events.push(newEvent);
        data.activeEventId = newEvent.id;
    }

    saveData(data);
    closeModal();
    renderAll();
}

async function deleteCurrentEvent() {
    const event = getActiveEvent();
    if (!event) return;
    const ok = await customConfirm(`Usun\u0105\u0107 event "${event.name}"? Aktywno\u015Bci nie zostan\u0105 usuni\u0119te.`);
    if (!ok) return;

    const data = loadData();
    data.events = data.events.filter(e => e.id !== event.id);
    data.activeEventId = data.events.length > 0 ? data.events[0].id : null;
    saveData(data);
    renderAll();
}

// ── Enter key to submit activity ────────────────────────────────────

document.querySelectorAll('#actName, #actTime, #actDate').forEach(el => {
    el.addEventListener('keydown', e => {
        if (e.key === 'Enter') submitActivity();
    });
});

// ── Render all ──────────────────────────────────────────────────────

function renderAll() {
    renderEventSelect();
    renderProgress();
    renderActivities();
}

// Event delegation for threshold marker clicks
document.getElementById('thresholdMarkers').addEventListener('click', function(e) {
    const marker = e.target.closest('.threshold-marker');
    if (!marker) return;
    const mins = parseInt(marker.dataset.mins);
    const pts = parseInt(marker.dataset.pts);
    if (!isNaN(mins) && !isNaN(pts)) selectGoal(mins, pts);
});

// ── Event Export / Import ───────────────────────────────────────────

function exportEvent() {
    const name = document.getElementById('eventName').value.trim();
    const startDate = document.getElementById('eventStartDate').value;
    const endDate = document.getElementById('eventEndDate').value;
    const rows = document.querySelectorAll('#thresholdInputs .threshold-input-row');
    const thresholds = [];
    rows.forEach(row => {
        const mins = parseInt(row.querySelector('.thresh-mins').value);
        const pts = parseInt(row.querySelector('.thresh-pts').value);
        if (mins > 0 && pts > 0) thresholds.push({ minutes: mins, points: pts });
    });

    const eventData = { name, startDate, endDate, thresholds };
    const blob = new Blob([JSON.stringify(eventData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `event-${(name || 'nowy').replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Event wyeksportowany!', 'success');
}

function importEvent(ev) {
    const file = ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (!imported.name || !imported.startDate || !imported.endDate) {
                showToast('Nieprawid\u0142owy format pliku eventu.');
                return;
            }
            document.getElementById('eventName').value = imported.name || '';
            document.getElementById('eventStartDate').value = imported.startDate || '';
            document.getElementById('eventEndDate').value = imported.endDate || '';
            document.getElementById('thresholdInputs').innerHTML = '';
            (imported.thresholds || []).forEach(t => addThresholdRow(t.minutes, t.points));
            showToast('Event zaimportowany do formularza!', 'success');
        } catch {
            showToast('B\u0142\u0105d odczytu pliku.');
        }
    };
    reader.readAsText(file);
    ev.target.value = '';
}

// ── Activities Export / Import ──────────────────────────────────────

function exportActivities() {
    const data = loadData();
    const blob = new Blob([JSON.stringify(data.activities, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aktywnosci.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Aktywno\u015Bci wyeksportowane!', 'success');
}

function importActivities(ev) {
    const file = ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (!Array.isArray(imported)) {
                showToast('Nieprawid\u0142owy format pliku.');
                return;
            }
            const data = loadData();
            const existingIds = new Set(data.activities.map(a => a.id));
            let added = 0;
            for (const act of imported) {
                if (act.name && act.minutes && act.date && !existingIds.has(act.id)) {
                    data.activities.push({
                        id: act.id || Date.now() + added,
                        type: act.type || 'other',
                        name: act.name,
                        minutes: act.minutes,
                        date: act.date,
                        strava_id: act.strava_id || undefined,
                    });
                    added++;
                }
            }
            saveData(data);
            renderAll();
            showToast(`Zaimportowano ${added} aktywno\u015Bci!`, 'success');
        } catch {
            showToast('B\u0142\u0105d odczytu pliku.');
        }
    };
    reader.readAsText(file);
    ev.target.value = '';
}

// ── Clear all data ──────────────────────────────────────────────────

async function clearAllData() {
    const ok = await customConfirm('Czy na pewno chcesz wyczy\u015Bci\u0107 wszystkie dane? Usuni\u0119te zostan\u0105 wszystkie eventy i aktywno\u015Bci. Tej operacji nie mo\u017Cna cofn\u0105\u0107!');
    if (!ok) return;
    _data = { events: [], activities: [], activeEventId: null };
    saveData(_data);
    closeSettingsModal();
    renderAll();
    showToast('Wszystkie dane zosta\u0142y usuni\u0119te.', 'success');
}

// ── Strava integration ──────────────────────────────────────────────

let stravaConnected = false;

async function checkStravaStatus() {
    try {
        const res = await fetch('/api/strava/status');
        const status = await res.json();
        const dot = document.getElementById('stravaStatusDot');
        const text = document.getElementById('stravaStatusText');
        const configSection = document.getElementById('stravaConfigSection');
        const connectedSection = document.getElementById('stravaConnectedSection');
        const syncBtn = document.getElementById('syncStravaBtn');

        stravaConnected = status.connected;

        if (status.connected) {
            dot.className = 'dot connected';
            text.textContent = 'Po\u0142\u0105czono ze Strav\u0105';
            configSection.style.display = 'none';
            connectedSection.style.display = 'block';
            syncBtn.style.display = 'flex';
        } else if (status.configured) {
            dot.className = 'dot disconnected';
            text.textContent = 'Skonfigurowano, ale nie po\u0142\u0105czono';
            document.getElementById('stravaClientId').value = status.client_id || '';
            configSection.style.display = 'block';
            connectedSection.style.display = 'none';
            syncBtn.style.display = 'none';
        } else {
            dot.className = 'dot disconnected';
            text.textContent = 'Nie skonfigurowano';
            configSection.style.display = 'block';
            connectedSection.style.display = 'none';
            syncBtn.style.display = 'none';
        }
    } catch {
        document.getElementById('stravaStatusText').textContent = 'B\u0142\u0105d po\u0142\u0105czenia';
    }
}

async function saveStravaConfig() {
    const clientId = document.getElementById('stravaClientId').value.trim();
    const clientSecret = document.getElementById('stravaClientSecret').value.trim();
    if (!clientId || !clientSecret) {
        showToast('Podaj Client ID i Client Secret.');
        return;
    }
    try {
        const res = await fetch('/api/strava/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: clientId, client_secret: clientSecret })
        });
        const data = await res.json();
        if (data.error) {
            showToast(data.error);
            return;
        }
        showToast('Konfiguracja zapisana. Przekierowuj\u0119 do Stravy...', 'success');
        setTimeout(() => { window.location.href = '/api/strava/auth'; }, 1000);
    } catch {
        showToast('B\u0142\u0105d zapisu konfiguracji.');
    }
}

async function disconnectStrava() {
    const ok = await customConfirm('Czy na pewno chcesz roz\u0142\u0105czy\u0107 Strav\u0119?');
    if (!ok) return;
    try {
        await fetch('/api/strava/disconnect', { method: 'POST' });
        showToast('Strava roz\u0142\u0105czona.', 'success');
        await checkStravaStatus();
    } catch {
        showToast('B\u0142\u0105d roz\u0142\u0105czania.');
    }
}

async function handleStravaSync() {
    const syncBtn = document.getElementById('syncStravaBtn');
    syncBtn.disabled = true;
    syncBtn.style.opacity = '0.5';
    try {
        const res = await fetch('/api/strava/sync');
        const result = await res.json();
        if (result.error) {
            showToast(result.error);
            return;
        }
        if (result.added > 0) {
            await loadDataFromServer();
            renderAll();
            showToast(`Zaimportowano ${result.added} nowych aktywno\u015Bci ze Stravy!`, 'success');
        } else {
            showToast('Brak nowych aktywno\u015Bci do zaimportowania.', 'success');
        }
    } catch {
        showToast('B\u0142\u0105d synchronizacji ze Strav\u0105.');
    } finally {
        syncBtn.disabled = false;
        syncBtn.style.opacity = '1';
    }
}

// ── Settings modal ──────────────────────────────────────────────────

function openSettingsModal() {
    document.getElementById('settingsModal').classList.add('active');
    checkStravaStatus();
}

function closeSettingsModal() {
    document.getElementById('settingsModal').classList.remove('active');
}

// ── Init ────────────────────────────────────────────────────────────

(async () => {
    await loadDataFromServer();
    renderAll();
    // Check for Strava callback
    const params = new URLSearchParams(window.location.search);
    if (params.get('strava') === 'connected') {
        showToast('Po\u0142\u0105czono ze Strav\u0105!', 'success');
        window.history.replaceState({}, '', '/');
        checkStravaStatus();
    } else {
        checkStravaStatus();
    }
})();
