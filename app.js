const STORAGE_KEY = 'cycleBloomState';
const defaultState = {
  settings: {
    lastPeriod: '',
    cycleLength: 28,
    periodLength: 5,
  },
  entries: [],
};

const form = document.getElementById('cycle-form');
const lastPeriodInput = document.getElementById('last-period');
const cycleLengthInput = document.getElementById('cycle-length');
const periodLengthInput = document.getElementById('period-length');
const settingsPanel = document.getElementById('settings-panel');
const phasePill = document.getElementById('phase-pill');
const nextPeriodOutput = document.getElementById('next-period');
const cycleDayOutput = document.getElementById('hero-cycle-day');
const ringCycleDayOutput = document.getElementById('ring-cycle-day');
const heroNextPeriodOutput = document.getElementById('hero-next-period');
const fertileWindowOutput = document.getElementById('fertile-window');
const daysRemainingOutput = document.getElementById('days-remaining');
const symptomButtons = document.querySelectorAll('[data-symptom]');
const notesField = document.getElementById('notes');
const logEntryButton = document.getElementById('log-entry-btn');
const entriesList = document.getElementById('entries-list');
const calendarGrid = document.getElementById('calendar-grid');
const calendarMonthLabel = document.getElementById('calendar-month');
const selectedDayDetail = document.getElementById('selected-day-detail');
const chartWrap = document.getElementById('fertility-chart');
const chartCycleLabel = document.getElementById('chart-cycle-label');
const periodStartForm = document.getElementById('period-start-form');
const periodStartDateInput = document.getElementById('period-start-date');
const periodStartMessage = document.getElementById('period-start-message');
const editEntryDialog = document.getElementById('edit-entry-dialog');
const editEntryForm = document.getElementById('edit-entry-form');
const editEntryDateInput = document.getElementById('edit-entry-date');
const editEntryNoteInput = document.getElementById('edit-entry-note');
const editEntrySymptoms = editEntryForm.querySelectorAll('.edit-symptoms input');
const dataMessage = document.getElementById('data-message');

let selectedSymptoms = new Set();
let editingEntryId = null;
let selectedDate = startOfDay(new Date());
let visibleMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return JSON.parse(JSON.stringify(defaultState));
  }

  try {
    const parsed = JSON.parse(saved);
    const periodStarts = Array.isArray(parsed.periodStarts) ? parsed.periodStarts : [];
    if (parsed.settings?.lastPeriod) periodStarts.push(parsed.settings.lastPeriod);
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    return {
      settings: { ...defaultState.settings, ...parsed.settings },
      periodStarts: [...new Set(periodStarts.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort(),
      entries: entries.map((entry, index) => ({
        ...entry,
        id: entry.id || `entry-${entry.date}-${index}`,
        symptoms: Array.isArray(entry.symptoms) ? entry.symptoms : [],
        note: typeof entry.note === 'string' ? entry.note : '',
      })),
    };
  } catch (error) {
    return JSON.parse(JSON.stringify(defaultState));
  }
}

let state = loadState();
if (!Array.isArray(state.periodStarts)) {
  state.periodStarts = state.settings.lastPeriod ? [state.settings.lastPeriod] : [];
  persistState();
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(value, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!value) return '--';

  const date = value instanceof Date ? value : parseDate(value);
  if (Number.isNaN(date.getTime())) return '--';

  return new Intl.DateTimeFormat('en', options).format(date);
}

function addDays(date, days) {
  const result = startOfDay(date);
  result.setDate(result.getDate() + days);
  return result;
}

function dateDiffInDays(start, end) {
  const startUTC = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUTC = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endUTC - startUTC) / 86400000);
}

function cycleInfoForDate(date) {
  const { periodLength } = state.settings;
  const starts = state.periodStarts.map(parseDate);
  if (!starts.length) return null;

  const target = startOfDay(date);
  const startIndex = starts.findIndex((start) => start > target);
  const previousIndex = startIndex === -1 ? starts.length - 1 : startIndex - 1;
  if (previousIndex < 0) return null;

  const cycleStart = starts[previousIndex];
  const nextActualStart = starts[previousIndex + 1];
  const actualCycleLength = nextActualStart ? dateDiffInDays(cycleStart, nextActualStart) : null;
  const cycleLength = actualCycleLength || getAverageCycleLength();
  const elapsedDays = dateDiffInDays(cycleStart, target);
  const cyclesAhead = nextActualStart ? 0 : Math.floor(elapsedDays / cycleLength);
  const projectedCycleStart = nextActualStart ? cycleStart : addDays(cycleStart, cyclesAhead * cycleLength);
  const cycleDay = dateDiffInDays(projectedCycleStart, target) + 1;
  const ovulationDay = Math.max(1, cycleLength - 14);
  const fertileStartDay = Math.max(1, ovulationDay - 5);

  return {
    cycleDay,
    cycleStart: projectedCycleStart,
    cycleLength,
    isPeriod: cycleDay <= periodLength,
    isFertile: cycleDay >= fertileStartDay && cycleDay <= ovulationDay,
    isPredictedPeriod: !nextActualStart && projectedCycleStart > starts[starts.length - 1] && cycleDay <= periodLength,
  };
}

function getAverageCycleLength() {
  const starts = state.periodStarts.map(parseDate);
  if (starts.length < 2) return state.settings.cycleLength;

  const intervals = starts.slice(1).map((date, index) => dateDiffInDays(starts[index], date));
  const validIntervals = intervals.filter((days) => days >= 21 && days <= 45);
  if (!validIntervals.length) return state.settings.cycleLength;
  return Math.round(validIntervals.reduce((sum, days) => sum + days, 0) / validIntervals.length);
}

function getPhaseText(cycleDay, cycleLength, periodLength) {
  if (cycleDay <= periodLength) return 'Period';

  const ovulationDay = Math.max(1, cycleLength - 14);
  const fertileStartDay = Math.max(1, ovulationDay - 5);
  if (cycleDay >= fertileStartDay && cycleDay <= ovulationDay) return 'Fertile window';
  if (cycleDay > ovulationDay) return 'Luteal phase';
  return 'Follicular phase';
}

function getCycleMetrics() {
  const { periodLength } = state.settings;
  const today = startOfDay(new Date());

  if (!state.periodStarts.length) {
    return { cycleDay: '--', daysRemaining: '--', fertileWindow: '--', nextPeriod: '--', phase: 'Cycle phase' };
  }

  const info = cycleInfoForDate(today);
  if (!info) {
    return { cycleDay: '--', daysRemaining: '--', fertileWindow: '--', nextPeriod: '--', phase: 'Cycle phase' };
  }

  const cycleLength = info.cycleLength;
  const ovulationDay = Math.max(1, cycleLength - 14);
  let fertileCycleStart = info.cycleStart;
  let fertileStart = addDays(fertileCycleStart, Math.max(0, ovulationDay - 6));
  let fertileEnd = addDays(fertileCycleStart, ovulationDay - 1);
  if (dateDiffInDays(today, fertileEnd) < 0) {
    fertileCycleStart = addDays(fertileCycleStart, cycleLength);
    fertileStart = addDays(fertileCycleStart, Math.max(0, ovulationDay - 6));
    fertileEnd = addDays(fertileCycleStart, ovulationDay - 1);
  }
  const nextPeriodDate = addDays(info.cycleStart, cycleLength);
  const daysRemaining = dateDiffInDays(today, nextPeriodDate);

  return {
    cycleDay: info.cycleDay,
    daysRemaining,
    fertileWindow: `${formatDate(fertileStart, { month: 'short', day: 'numeric' })} – ${formatDate(fertileEnd, { month: 'short', day: 'numeric' })}`,
    nextPeriod: formatDate(nextPeriodDate),
    phase: getPhaseText(info.cycleDay, cycleLength, periodLength),
  };
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function populateForm() {
  const { lastPeriod, cycleLength, periodLength } = state.settings;
  lastPeriodInput.value = lastPeriod;
  lastPeriodInput.max = toDateKey(new Date());
  cycleLengthInput.value = cycleLength;
  periodLengthInput.value = periodLength;
  periodStartDateInput.max = toDateKey(new Date());
  periodStartDateInput.value = toDateKey(new Date());
}

function renderEntryList() {
  const items = [...state.entries].sort((a, b) => b.date.localeCompare(a.date));
  entriesList.replaceChildren();

  if (!items.length) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = 'No entries yet. Your check-ins will appear here.';
    entriesList.append(empty);
    return;
  }

  items.slice(0, 5).forEach((entry) => {
    const item = document.createElement('li');
    item.className = 'entry-item';
    const head = document.createElement('div');
    head.className = 'entry-head';
    const cycleDay = document.createElement('strong');
    cycleDay.textContent = Number.isInteger(entry.cycleDay) ? `Cycle Day ${entry.cycleDay}` : 'Cycle day unavailable';
    const date = document.createElement('span');
    date.className = 'entry-date';
    date.textContent = formatDate(entry.date);
    head.append(cycleDay, date);

    const symptoms = document.createElement('p');
    symptoms.className = 'entry-symptoms';
    symptoms.textContent = entry.symptoms.length ? entry.symptoms.join(', ') : 'No symptoms noted';
    item.append(head, symptoms);

    if (entry.note) {
      const note = document.createElement('p');
      note.className = 'entry-note';
      note.textContent = entry.note;
      item.append(note);
    }

    const actions = document.createElement('div');
    actions.className = 'entry-actions';
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'entry-action';
    editButton.textContent = 'Edit';
    editButton.setAttribute('aria-label', `Edit check-in from ${formatDate(entry.date)}`);
    editButton.addEventListener('click', () => openEntryEditor(entry));
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'entry-action delete-entry';
    deleteButton.textContent = 'Delete';
    deleteButton.setAttribute('aria-label', `Delete check-in from ${formatDate(entry.date)}`);
    deleteButton.addEventListener('click', () => deleteEntry(entry.id));
    actions.append(editButton, deleteButton);
    item.append(actions);
    entriesList.append(item);
  });
}

function updateOverview() {
  const metrics = getCycleMetrics();
  phasePill.textContent = metrics.phase;
  nextPeriodOutput.textContent = metrics.nextPeriod;
  cycleDayOutput.textContent = metrics.cycleDay === '--' ? 'Set up your cycle' : `Cycle day ${metrics.cycleDay}`;
  ringCycleDayOutput.textContent = metrics.cycleDay;
  fertileWindowOutput.textContent = metrics.fertileWindow;
  daysRemainingOutput.textContent = metrics.daysRemaining === '--'
    ? 'Set up your cycle'
    : metrics.daysRemaining === 0
      ? 'Expected today'
      : `${metrics.daysRemaining} days to go`;
  heroNextPeriodOutput.textContent = metrics.nextPeriod === '--'
    ? 'Set your last period to get started'
    : `Next period around ${metrics.nextPeriod}`;
  chartCycleLabel.textContent = `${getAverageCycleLength()}-day cycle`;
}

function renderCalendar() {
  calendarMonthLabel.textContent = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(visibleMonth);
  calendarGrid.replaceChildren();

  const monthStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const mondayOffset = (monthStart.getDay() + 6) % 7;
  const gridStart = addDays(monthStart, -mondayOffset);
  const todayKey = toDateKey(startOfDay(new Date()));
  const selectedKey = toDateKey(selectedDate);
  const loggedDays = new Set(state.entries.map((entry) => entry.date));

  for (let index = 0; index < 42; index += 1) {
    const date = addDays(gridStart, index);
    const dateKey = toDateKey(date);
    const info = cycleInfoForDate(date);
    const day = document.createElement('button');
    day.type = 'button';
    day.className = 'calendar-day';
    day.setAttribute('aria-label', formatDate(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }));
    day.setAttribute('aria-pressed', String(dateKey === selectedKey));
    day.textContent = String(date.getDate());
    if (date.getMonth() !== visibleMonth.getMonth()) day.classList.add('outside-month');
    if (dateKey === todayKey) day.classList.add('today');
    if (dateKey === selectedKey) day.classList.add('selected');
    if (info?.isPeriod && !info.isPredictedPeriod) day.classList.add('period-day');
    if (info?.isFertile) day.classList.add('fertile-day');
    if (info?.isPredictedPeriod) day.classList.add('predicted-day');
    if (state.periodStarts.includes(dateKey)) day.classList.add('actual-period-start');
    if (loggedDays.has(dateKey)) day.classList.add('logged-day');
    day.addEventListener('click', () => {
      selectedDate = date;
      renderCalendar();
    });
    calendarGrid.append(day);
  }

  renderSelectedDayDetail();
}

function renderSelectedDayDetail() {
  const dateKey = toDateKey(selectedDate);
  const info = cycleInfoForDate(selectedDate);
  const entry = state.entries.find((item) => item.date === dateKey);
  const summary = document.createElement('span');

  if (!info) {
    summary.textContent = state.settings.lastPeriod
      ? 'This date is before your last period start.'
      : 'Add your last period date in cycle settings to see predictions.';
  } else {
    const phase = info.isPeriod
      ? 'Period'
      : info.isFertile
        ? 'Estimated fertile window'
        : getPhaseText(info.cycleDay, state.settings.cycleLength, state.settings.periodLength);
    const title = document.createElement('strong');
    title.textContent = `${formatDate(selectedDate, { month: 'long', day: 'numeric' })} · Cycle day ${info.cycleDay}`;
    summary.append(title, document.createTextNode(` — ${phase}`));
  }

  if (entry) {
    const logged = document.createElement('span');
    logged.textContent = ` · Logged: ${entry.symptoms.join(', ') || 'check-in'}${entry.note ? ` — ${entry.note}` : ''}`;
    summary.append(logged);
  }

  selectedDayDetail.replaceChildren(summary);
}

function renderFertilityChart() {
  const cycleLength = getAverageCycleLength();
  const ovulationDay = Math.max(1, cycleLength - 14);
  const fertileStartDay = Math.max(1, ovulationDay - 5);
  const width = 640;
  const height = 220;
  const left = 40;
  const right = 12;
  const top = 18;
  const bottom = 34;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const x = (day) => left + ((day - 1) / Math.max(1, cycleLength - 1)) * chartWidth;
  const y = (chance) => top + (1 - chance / 100) * chartHeight;
  const points = [];

  for (let day = 1; day <= cycleLength; day += 1) {
    const distance = (day - ovulationDay) / 2.4;
    const chance = Math.max(4, Math.round(88 * Math.exp(-0.5 * distance * distance)));
    points.push({ day, x: x(day), y: y(chance), chance });
  }

  const line = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const area = `${line} L ${x(cycleLength).toFixed(1)} ${(height - bottom).toFixed(1)} L ${left} ${(height - bottom).toFixed(1)} Z`;
  const windowEndDay = Math.min(cycleLength, ovulationDay);
  const windowStart = x(fertileStartDay);
  const windowEnd = x(windowEndDay);
  const tickDays = [...new Set([1, 7, 14, 21, 28, cycleLength].filter((day) => day <= cycleLength))];
  const gridLines = [0, 50, 100].map((value) => {
    const yPosition = y(value).toFixed(1);
    return `<line x1="${left}" y1="${yPosition}" x2="${width - right}" y2="${yPosition}" stroke="#f1e9ec" stroke-width="1"/><text x="4" y="${Number(yPosition) + 4}" fill="#9b8993" font-size="10">${value}%</text>`;
  }).join('');
  const ticks = tickDays.map((day) => `<text x="${x(day).toFixed(1)}" y="${height - 8}" text-anchor="middle" fill="#9b8993" font-size="10">${day}</text>`).join('');
  const peak = points.find((point) => point.day === ovulationDay);

  chartWrap.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">
      <defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#df7796" stop-opacity=".24"/><stop offset="100%" stop-color="#df7796" stop-opacity=".02"/></linearGradient></defs>
      ${gridLines}
      <rect x="${windowStart.toFixed(1)}" y="${top}" width="${Math.max(3, windowEnd - windowStart).toFixed(1)}" height="${chartHeight}" rx="7" fill="#f8eaf0"/>
      <path d="${area}" fill="url(#chart-fill)"/>
      <path d="${line}" fill="none" stroke="#d65b81" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${peak.x.toFixed(1)}" cy="${peak.y.toFixed(1)}" r="4.5" fill="#d65b81" stroke="#fff" stroke-width="2"/>
      ${ticks}
    </svg>`;
  chartWrap.setAttribute('aria-label', `Estimated fertility pattern for a ${cycleLength}-day cycle, highest around cycle day ${ovulationDay}. The highlighted estimated fertile window is cycle days ${fertileStartDay} to ${windowEndDay}.`);
}

function renderAll() {
  updateOverview();
  renderCalendar();
  renderFertilityChart();
  renderEntryList();
}

function openEntryEditor(entry) {
  editingEntryId = entry.id;
  editEntryDateInput.value = entry.date;
  editEntryDateInput.max = toDateKey(new Date());
  editEntryNoteInput.value = entry.note;
  editEntrySymptoms.forEach((checkbox) => {
    checkbox.checked = entry.symptoms.includes(checkbox.value);
  });
  editEntryDialog.showModal();
}

function deleteEntry(entryId) {
  const entry = state.entries.find((item) => item.id === entryId);
  if (!entry || !window.confirm(`Delete the check-in from ${formatDate(entry.date)}?`)) return;

  state.entries = state.entries.filter((item) => item.id !== entryId);
  persistState();
  renderAll();
}

function handleEditEntry(event) {
  event.preventDefault();
  if (!editEntryForm.reportValidity()) return;

  const entry = state.entries.find((item) => item.id === editingEntryId);
  if (!entry) {
    editEntryDialog.close();
    return;
  }

  entry.date = editEntryDateInput.value;
  entry.symptoms = Array.from(editEntrySymptoms)
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => checkbox.value);
  entry.note = editEntryNoteInput.value.trim();
  const info = cycleInfoForDate(parseDate(entry.date));
  entry.cycleDay = info ? info.cycleDay : null;

  persistState();
  editEntryDialog.close();
  editingEntryId = null;
  renderAll();
}

function handlePeriodStart(event) {
  event.preventDefault();
  if (!periodStartForm.reportValidity()) return;

  const date = periodStartDateInput.value;
  if (parseDate(date) > startOfDay(new Date())) {
    periodStartDateInput.setCustomValidity('Choose today or an earlier date.');
    periodStartDateInput.reportValidity();
    return;
  }
  periodStartDateInput.setCustomValidity('');

  if (state.periodStarts.includes(date)) {
    periodStartMessage.textContent = 'That period start is already recorded.';
    return;
  }

  state.periodStarts.push(date);
  state.periodStarts.sort();
  state.settings.lastPeriod = state.periodStarts[state.periodStarts.length - 1];
  persistState();
  populateForm();
  periodStartMessage.textContent = 'Period start saved. Your estimates have been updated.';
  selectedDate = parseDate(date);
  visibleMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  renderAll();
}

function exportData() {
  const exportObject = {
    exportedAt: new Date().toISOString(),
    ...state,
  };
  const file = new Blob([JSON.stringify(exportObject, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = `cycle-bloom-data-${toDateKey(new Date())}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  dataMessage.textContent = 'Your data export is ready.';
}

function clearData() {
  if (!window.confirm('Delete all cycle details, period dates, and check-ins from this browser? This cannot be undone.')) return;

  localStorage.removeItem(STORAGE_KEY);
  state = { ...JSON.parse(JSON.stringify(defaultState)), periodStarts: [] };
  selectedSymptoms = new Set();
  selectedDate = startOfDay(new Date());
  visibleMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  notesField.value = '';
  syncSymptoms();
  populateForm();
  periodStartMessage.textContent = '';
  dataMessage.textContent = 'All Cycle Bloom data was deleted from this browser.';
  settingsPanel.hidden = true;
  document.getElementById('settings-toggle').setAttribute('aria-expanded', 'false');
  renderAll();
}

function syncSymptoms() {
  symptomButtons.forEach((button) => {
    button.classList.toggle('is-selected', selectedSymptoms.has(button.dataset.symptom));
  });
}

function handleFormSubmit(event) {
  event.preventDefault();
  if (!form.reportValidity()) return;

  const submittedDate = parseDate(lastPeriodInput.value);
  if (submittedDate > startOfDay(new Date())) {
    lastPeriodInput.setCustomValidity('Choose today or an earlier date.');
    lastPeriodInput.reportValidity();
    return;
  }
  lastPeriodInput.setCustomValidity('');

  state.settings = {
    lastPeriod: lastPeriodInput.value,
    cycleLength: Number(cycleLengthInput.value),
    periodLength: Number(periodLengthInput.value),
  };
  if (!state.periodStarts.includes(lastPeriodInput.value)) {
    state.periodStarts.push(lastPeriodInput.value);
    state.periodStarts.sort();
  }

  persistState();
  settingsPanel.hidden = true;
  document.getElementById('settings-toggle').setAttribute('aria-expanded', 'false');
  renderAll();
}

function logEntry() {
  const today = startOfDay(new Date());
  const info = cycleInfoForDate(today);
  if (!info) {
    settingsPanel.hidden = false;
    document.getElementById('settings-toggle').setAttribute('aria-expanded', 'true');
    lastPeriodInput.focus();
    return;
  }

  state.entries.push({
    id: typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `entry-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    date: toDateKey(today),
    cycleDay: info.cycleDay,
    symptoms: Array.from(selectedSymptoms),
    note: notesField.value.trim(),
  });

  persistState();
  selectedSymptoms = new Set();
  notesField.value = '';
  syncSymptoms();
  renderAll();
}

symptomButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const symptom = button.dataset.symptom;
    if (selectedSymptoms.has(symptom)) selectedSymptoms.delete(symptom);
    else selectedSymptoms.add(symptom);
    syncSymptoms();
  });
});

document.getElementById('previous-month').addEventListener('click', () => {
  visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
  renderCalendar();
});

document.getElementById('next-month').addEventListener('click', () => {
  visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
  renderCalendar();
});

document.getElementById('settings-toggle').addEventListener('click', () => {
  settingsPanel.hidden = !settingsPanel.hidden;
  document.getElementById('settings-toggle').setAttribute('aria-expanded', String(!settingsPanel.hidden));
  if (!settingsPanel.hidden) settingsPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

document.getElementById('mobile-settings').addEventListener('click', () => {
  settingsPanel.hidden = false;
  document.getElementById('settings-toggle').setAttribute('aria-expanded', 'true');
  settingsPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

lastPeriodInput.addEventListener('input', () => lastPeriodInput.setCustomValidity(''));
periodStartDateInput.addEventListener('input', () => {
  periodStartDateInput.setCustomValidity('');
  periodStartMessage.textContent = '';
});
form.addEventListener('submit', handleFormSubmit);
periodStartForm.addEventListener('submit', handlePeriodStart);
logEntryButton.addEventListener('click', logEntry);
editEntryForm.addEventListener('submit', handleEditEntry);
document.getElementById('cancel-edit-entry').addEventListener('click', () => editEntryDialog.close());
document.getElementById('export-data').addEventListener('click', exportData);
document.getElementById('clear-data').addEventListener('click', clearData);

populateForm();
renderAll();
