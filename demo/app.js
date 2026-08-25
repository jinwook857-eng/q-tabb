(() => {
  'use strict';

  const STORAGE_KEY = 'mp1.events.v1';
  const TOTAL_DOSES = 10;
  const DAY_MS = 86_400_000;
  const state = {
    events: loadEvents(),
    portState: 'disconnected',
    emergency: false,
    emergencyModalOpen: false,
    now: Date.now(),
    fxTimer: null,
    port: null,
    reader: null,
    reading: false
  };

  const $ = (selector) => document.querySelector(selector);
  const elements = {
    appShell: $('.app-shell'), portDot: $('#port-dot'), portLabel: $('#port-label'), emergencyBanner: $('#emergency-banner'),
    emergencyModal: $('#emergency-modal'), kakaoAlertTime: $('#kakao-alert-time'),
    takeToast: $('#take-toast'), toastTime: $('#toast-time'), elapsedWrap: $('.elapsed-wrap'), elapsed: $('#elapsed'),
    lastTake: $('#last-take'), prediction: $('#prediction'), predictionTime: $('#prediction-time'), averageInterval: $('#average-interval'),
    todayStrip: $('#today-strip'), nowLine: $('#now-line'), todayCount: $('#today-count'), pillSlots: $('#pill-slots'),
    remainingLabel: $('#remaining-label'), lowStock: $('#low-stock'), settingsLayer: $('#settings-layer'),
    serialToggle: $('#serial-toggle'), simulateEmergency: $('#simulate-emergency'), report: $('#report'),
    intervalSummary: $('#interval-summary'), intervalChart: $('#interval-chart'), hourChart: $('#hour-chart'),
    weekStrips: $('#week-strips'), dailyLog: $('#daily-log'), eventSummary: $('#event-summary'),
    timeline: $('#timeline'), guardianLog: $('#guardian-log')
  };

  if (!state.events.length) {
    state.events = seedDemo();
    saveEvents();
  }
  state.emergency = deriveEmergency(state.events);
  state.emergencyModalOpen = state.emergency;

  function loadEvents() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(value) ? value.filter((event) => event && event.type && Number.isFinite(event.ts)) : [];
    } catch (_error) {
      return [];
    }
  }

  function saveEvents() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.events)); } catch (_error) { /* storage may be unavailable */ }
  }

  function seedDemo() {
    const events = [];
    const now = new Date();
    const plans = [[8.2, 15.5, 22.1], [9, 20.3], [7.8, 14.1, 21.6], [8.5, 13.2, 23], [10.1, 19.4], [8, 15.9, 21.2], [7.5, 14.6, 20.8]];
    let remaining = TOTAL_DOSES;
    plans.forEach((hours, index) => {
      const daysAgo = 7 - index;
      hours.forEach((decimalHour, doseIndex) => {
        const timestamp = new Date(now);
        timestamp.setDate(timestamp.getDate() - daysAgo);
        timestamp.setHours(Math.floor(decimalHour), Math.round((decimalHour % 1) * 60) + ((index * 3 + doseIndex * 5) % 12), 0, 0);
        if (remaining <= 0) {
          events.push({ type: 'RESET', ts: timestamp.getTime() - 60_000 });
          remaining = TOTAL_DOSES;
        }
        remaining -= 1;
        events.push({ type: 'TAKE', ts: timestamp.getTime(), taken: TOTAL_DOSES - remaining, remaining });
      });
    });
    const todayDose = new Date(now);
    todayDose.setHours(8, 12, 0, 0);
    if (todayDose.getTime() < now.getTime()) {
      if (remaining <= 0) {
        events.push({ type: 'RESET', ts: todayDose.getTime() - 60_000 });
        remaining = TOTAL_DOSES;
      }
      remaining -= 1;
      events.push({ type: 'TAKE', ts: todayDose.getTime(), taken: TOTAL_DOSES - remaining, remaining });
    }
    return events;
  }

  function deriveEmergency(events) {
    let active = false;
    events.forEach((event) => {
      if (event.type === 'EMERGENCY') active = true;
      if (event.type === 'EMERGENCY_CANCEL' || event.type === 'RESET') active = false;
    });
    return active;
  }

  function addEvent(event) {
    state.events.push({ ts: Date.now(), ...event });
    saveEvents();
    render();
  }

  function lastDispenserState() {
    let taken = 0;
    let remaining = TOTAL_DOSES;
    state.events.forEach((event) => {
      if (event.type === 'RESET') {
        taken = 0;
        remaining = TOTAL_DOSES;
      } else if ((event.type === 'TAKE' || event.type === 'EMERGENCY') && event.remaining != null) {
        taken = Number(event.taken);
        remaining = Math.max(0, Math.min(TOTAL_DOSES, Number(event.remaining)));
      }
    });
    return { taken, remaining };
  }

  function handleLine(rawLine) {
    const line = String(rawLine).trim();
    if (!line) return;
    const upper = line.toUpperCase();
    let match;
    if (/^MEDICINE\s+BOX\s+READY$/.test(upper)) {
      addEvent({ type: 'READY' });
    } else if (/^EMERGENCY\s*,?\s*CANCEL$/.test(upper)) {
      state.emergency = false;
      state.emergencyModalOpen = false;
      addEvent({ type: 'EMERGENCY_CANCEL' });
    } else if ((match = upper.match(/^\[?\s*(\d+)\s*,\s*(\d+)\s*,\s*EMERGENCY\s*\]?$/))) {
      state.emergency = true;
      state.emergencyModalOpen = true;
      addEvent({ type: 'EMERGENCY', taken: Number(match[1]), remaining: Number(match[2]) });
    } else if ((match = upper.match(/^\[?\s*(\d+)\s*,\s*(\d+)\s*,\s*TAKE\s*\]?$/))) {
      addEvent({ type: 'TAKE', taken: Number(match[1]), remaining: Number(match[2]) });
      playTakeAnimation();
    } else if (/^RESET$/.test(upper)) {
      state.emergency = false;
      state.emergencyModalOpen = false;
      addEvent({ type: 'RESET' });
    } else {
      addEvent({ type: 'INFO', text: line });
    }
  }

  async function connectSerial() {
    if (!('serial' in navigator)) {
      addEvent({ type: 'INFO', text: '이 환경에서는 Web Serial을 지원하지 않습니다 (Chrome/Electron 필요)' });
      return;
    }
    state.portState = 'connecting';
    renderConnection();
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 9600 });
      state.port = port;
      state.portState = 'connected';
      renderConnection();
      void readSerialLines(port);
    } catch (error) {
      state.portState = 'disconnected';
      renderConnection();
      if (error && error.name !== 'NotFoundError') addEvent({ type: 'INFO', text: `시리얼 연결 실패: ${error.message || error}` });
    }
  }

  async function readSerialLines(port) {
    if (!port.readable || state.reading) return;
    state.reading = true;
    const decoder = new TextDecoder();
    let buffer = '';
    const reader = port.readable.getReader();
    state.reader = reader;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        lines.forEach(handleLine);
        const pending = buffer.trim();
        if (/^RESET$/i.test(pending)) {
          handleLine(buffer);
          buffer = '';
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) handleLine(buffer);
    } catch (error) {
      if (state.portState === 'connected') addEvent({ type: 'INFO', text: `시리얼 수신 종료: ${error.message || error}` });
    } finally {
      try { reader.releaseLock(); } catch (_error) { /* already released */ }
      if (state.reader === reader) state.reader = null;
      state.reading = false;
      if (state.port === port) {
        state.portState = 'disconnected';
        renderConnection();
      }
    }
  }

  async function disconnectSerial() {
    state.portState = 'disconnecting';
    renderConnection();
    const reader = state.reader;
    const port = state.port;
    state.port = null;
    try { if (reader) await reader.cancel(); } catch (_error) { /* device may already be gone */ }
    try { if (port) await port.close(); } catch (_error) { /* device may already be gone */ }
    state.portState = 'disconnected';
    renderConnection();
  }

  function playTakeAnimation() {
    clearTimeout(state.fxTimer);
    const lastTake = takes()[0];
    elements.toastTime.textContent = lastTake ? formatTime(lastTake.ts) : formatTime(Date.now());
    elements.takeToast.hidden = true;
    elements.elapsedWrap.classList.remove('animating');
    elements.elapsed.classList.remove('settling');
    void elements.elapsedWrap.offsetWidth;
    elements.takeToast.hidden = false;
    elements.elapsedWrap.classList.add('animating');
    elements.elapsed.classList.add('settling');
    state.fxTimer = setTimeout(() => {
      elements.takeToast.hidden = true;
      elements.elapsedWrap.classList.remove('animating');
      elements.elapsed.classList.remove('settling');
    }, 2400);
  }

  function takes() {
    return state.events.filter((event) => event.type === 'TAKE').sort((a, b) => b.ts - a.ts);
  }

  function analysis() {
    const takeEvents = takes();
    const chronological = [...takeEvents].reverse();
    const recent = chronological.filter((event) => state.now - event.ts < 14 * DAY_MS);
    const intervals = [];
    for (let index = 1; index < recent.length; index += 1) {
      const hours = (recent[index].ts - recent[index - 1].ts) / 3_600_000;
      if (hours > 0 && hours < 48) intervals.push({ hours, ts: recent[index].ts });
    }
    const average = intervals.length ? intervals.reduce((sum, item) => sum + item.hours, 0) / intervals.length : NaN;
    return { takeEvents, intervals, average };
  }

  function render() {
    state.now = Date.now();
    const { takeEvents, average } = analysis();
    const lastTake = takeEvents[0] || null;
    const elapsed = lastTake ? state.now - lastTake.ts : null;
    const dispenser = lastDispenserState();

    elements.elapsed.textContent = lastTake ? formatDuration(elapsed) : '기록 없음';
    elements.elapsed.classList.toggle('is-emergency', state.emergency);
    elements.elapsed.classList.toggle('is-late', !state.emergency && lastTake && Number.isFinite(average) && elapsed > average * 3_600_000 * 1.5);
    elements.lastTake.textContent = lastTake ? formatDateTime(lastTake.ts) : '—';
    const predictionTs = lastTake && Number.isFinite(average) ? lastTake.ts + average * 3_600_000 : null;
    elements.prediction.hidden = !predictionTs;
    if (predictionTs) {
      elements.predictionTime.textContent = formatDateTime(predictionTs);
      elements.averageInterval.textContent = formatHours(average);
    }
    renderToday(takeEvents);
    renderStock(dispenser.remaining);
    renderConnection();
    elements.appShell.classList.toggle('emergency-active', state.emergency);
    elements.emergencyBanner.hidden = !state.emergency;
    elements.emergencyModal.hidden = !state.emergencyModalOpen;
    if (state.emergency) {
      const latestEmergency = [...state.events].reverse().find((event) => event.type === 'EMERGENCY');
      elements.kakaoAlertTime.textContent = `감지 시각 ${formatDateTime(latestEmergency ? latestEmergency.ts : state.now)}`;
    }
    elements.simulateEmergency.textContent = state.emergency ? '응급 해제' : '2회 — 응급';
    if (!elements.report.hidden) renderReport();
  }

  function renderToday(takeEvents) {
    elements.todayStrip.querySelectorAll('.dose-dot').forEach((dot) => dot.remove());
    const today = new Date(state.now);
    const todayTakes = takeEvents.filter((event) => new Date(event.ts).toDateString() === today.toDateString());
    todayTakes.forEach((event) => elements.todayStrip.insertBefore(makeDoseDot(event, 9), elements.nowLine));
    const now = new Date(state.now);
    elements.nowLine.style.left = `${toDayPercent(now)}%`;
    elements.todayCount.textContent = String(todayTakes.length);
  }

  function renderStock(remaining) {
    elements.pillSlots.replaceChildren();
    const taken = TOTAL_DOSES - remaining;
    for (let index = 0; index < TOTAL_DOSES; index += 1) {
      const slot = document.createElement('span');
      const isTaken = index < taken;
      slot.className = `pill-slot${isTaken ? ' taken' : ''}`;
      slot.setAttribute('aria-label', isTaken ? `${index + 1}번째 알약 복용 완료` : `${index + 1}번째 알약 남음`);
      elements.pillSlots.append(slot);
    }
    elements.remainingLabel.textContent = `복용 ${taken}정 · 잔여 ${remaining}/${TOTAL_DOSES}정`;
    elements.lowStock.hidden = remaining > Math.max(1, Math.round(TOTAL_DOSES * 0.2));
  }

  function renderConnection() {
    const connected = state.portState === 'connected';
    elements.portDot.classList.toggle('connected', connected);
    const labels = { connecting: '연결 중', connected: 'SERIAL 9600 연결됨', disconnecting: '연결 해제 중', disconnected: '포트 미연결' };
    elements.portLabel.textContent = labels[state.portState] || labels.disconnected;
    elements.serialToggle.disabled = state.portState === 'connecting' || state.portState === 'disconnecting';
    elements.serialToggle.textContent = connected ? '연결 해제' : '시리얼 연결 (9600bps)';
  }

  function renderReport() {
    const { takeEvents, intervals, average } = analysis();
    renderIntervalChart(intervals, average);
    renderHourChart(takeEvents);
    renderWeekStrips(takeEvents);
    renderDailyLog(takeEvents);
    renderTimeline();
    renderGuardianLog();
  }

  function renderIntervalChart(intervals, average) {
    const recent = intervals.slice(-10);
    const maximum = Math.max(1, ...recent.map((item) => item.hours), Number.isFinite(average) ? average : 0);
    elements.intervalSummary.textContent = `최근 ${recent.length}회 · 평균 ${formatHours(average)}`;
    elements.intervalChart.style.gridTemplateColumns = `repeat(${Math.max(1, recent.length)}, 1fr)`;
    elements.intervalChart.replaceChildren();
    if (Number.isFinite(average)) {
      const line = document.createElement('span');
      line.className = 'average-line';
      line.style.bottom = `${Math.round(average / maximum * 68)}px`;
      elements.intervalChart.append(line);
    }
    recent.forEach((item) => {
      const column = document.createElement('div');
      column.className = 'interval-column';
      column.title = `${formatDateTime(item.ts)} · 간격 ${formatHours(item.hours)}`;
      const label = document.createElement('span');
      label.className = 'interval-label';
      label.textContent = `${Math.round(item.hours * 10) / 10}h`;
      const bar = document.createElement('div');
      const outlier = Number.isFinite(average) && Math.abs(item.hours - average) > average * 0.35;
      bar.className = `interval-bar${outlier ? ' outlier' : ''}`;
      bar.style.height = `${Math.max(4, Math.round(item.hours / maximum * 68))}px`;
      column.append(label, bar);
      elements.intervalChart.append(column);
    });
  }

  function renderHourChart(takeEvents) {
    const counts = Array(24).fill(0);
    takeEvents.forEach((event) => { counts[new Date(event.ts).getHours()] += 1; });
    const maximum = Math.max(1, ...counts);
    elements.hourChart.replaceChildren(...counts.map((count, hour) => {
      const bar = document.createElement('div');
      bar.className = 'hour-bar';
      bar.style.height = `${Math.max(2, Math.round(count / maximum * 48))}px`;
      bar.title = `${hour}시 · ${count}회`;
      return bar;
    }));
  }

  function renderWeekStrips(takeEvents) {
    elements.weekStrips.replaceChildren();
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    for (let daysAgo = 6; daysAgo >= 0; daysAgo -= 1) {
      const day = new Date(state.now);
      day.setDate(day.getDate() - daysAgo);
      const dayTakes = takeEvents.filter((event) => new Date(event.ts).toDateString() === day.toDateString());
      const row = document.createElement('div');
      row.className = 'week-row';
      const label = document.createElement('span');
      label.className = 'week-label text-muted';
      label.textContent = daysAgo === 0 ? '오늘' : `${day.getMonth() + 1}/${day.getDate()} ${weekdays[day.getDay()]}`;
      const strip = document.createElement('div');
      strip.className = 'week-strip';
      strip.innerHTML = '<span class="strip-line"></span><span class="tick tick-25"></span><span class="tick tick-50"></span><span class="tick tick-75"></span>';
      dayTakes.forEach((event) => strip.append(makeDoseDot(event, 7)));
      const count = document.createElement('span');
      count.className = 'week-count text-muted';
      count.textContent = `${dayTakes.length}회`;
      row.append(label, strip, count);
      elements.weekStrips.append(row);
    }
  }

  function renderDailyLog(takeEvents) {
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    const groups = new Map();
    takeEvents.forEach((event) => {
      const day = new Date(event.ts);
      const key = day.toDateString();
      if (!groups.has(key)) groups.set(key, { day, times: [] });
      groups.get(key).times.push(formatTime(event.ts));
    });
    elements.dailyLog.replaceChildren(...[...groups.values()].slice(0, 8).map((group) => {
      const row = document.createElement('tr');
      const date = document.createElement('td');
      date.textContent = `${group.day.getMonth() + 1}/${group.day.getDate()} (${weekdays[group.day.getDay()]})`;
      const times = document.createElement('td');
      times.textContent = [...group.times].reverse().join('  ');
      const count = document.createElement('td');
      count.textContent = `${group.times.length}회`;
      row.append(date, times, count);
      return row;
    }));
  }

  function renderTimeline() {
    const definitions = {
      TAKE: (event) => ['약 복용', event.remaining != null ? `잔여 ${event.remaining}정` : '', '복용', 'tag-accent'],
      RESET: () => ['디스펜서 리셋', '카트리지 리필', '리셋', 'tag-neutral'],
      EMERGENCY: () => ['응급 상황 발생', '보호자 알림 발송 (모의)', '응급', 'tag-emergency'],
      EMERGENCY_CANCEL: () => ['응급 상황 해제', '정상 모드로 전환', '해제', 'tag-outline'],
      READY: () => ['기기 연결됨', 'MEDICINE BOX READY 수신', '연결', 'tag-neutral'],
      INFO: (event) => ['수신 메시지', event.text || '', '정보', 'tag-neutral']
    };
    const events = [...state.events].sort((a, b) => b.ts - a.ts).slice(0, 60);
    elements.eventSummary.textContent = `최신순 · ${state.events.length}건`;
    elements.timeline.replaceChildren();
    if (!events.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state text-muted';
      empty.textContent = '아직 기록이 없습니다.';
      elements.timeline.append(empty);
      return;
    }
    events.forEach((event) => {
      const [titleText, detail, tagText, tagClass] = (definitions[event.type] || definitions.INFO)(event);
      const row = document.createElement('div');
      row.className = 'timeline-row';
      const time = document.createElement('span');
      time.className = 'timeline-time';
      time.textContent = formatTime(event.ts);
      const copy = document.createElement('span');
      copy.className = 'timeline-copy';
      const title = document.createElement('span');
      title.className = 'timeline-title';
      title.textContent = titleText;
      const meta = document.createElement('span');
      meta.className = 'timeline-meta';
      meta.textContent = `${formatDateTime(event.ts)}${detail ? ` · ${detail}` : ''}`;
      copy.append(title, meta);
      const tag = document.createElement('span');
      tag.className = `tag ${tagClass}`;
      tag.textContent = tagText;
      row.append(time, copy, tag);
      elements.timeline.append(row);
    });
  }

  function renderGuardianLog() {
    const entries = state.events.filter((event) => event.type === 'EMERGENCY' || event.type === 'EMERGENCY_CANCEL').sort((a, b) => b.ts - a.ts);
    elements.guardianLog.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'text-muted';
      empty.style.fontSize = '12px';
      empty.textContent = '발송된 알림이 없습니다.';
      elements.guardianLog.append(empty);
      return;
    }
    entries.forEach((event) => {
      const row = document.createElement('div');
      row.className = 'guardian-row';
      const time = document.createElement('span');
      time.className = 'guardian-time';
      time.textContent = formatDateTime(event.ts);
      const text = document.createElement('span');
      text.textContent = event.type === 'EMERGENCY' ? '응급 버튼 감지 — 보호자에게 문자 발송 (모의)' : '응급 해제 — 보호자에게 안내 발송 (모의)';
      row.append(time, text);
      elements.guardianLog.append(row);
    });
  }

  function makeDoseDot(event) {
    const dot = document.createElement('span');
    dot.className = 'dose-dot';
    dot.style.left = `${toDayPercent(new Date(event.ts))}%`;
    dot.title = formatTime(event.ts);
    return dot;
  }

  function toDayPercent(date) { return ((date.getHours() + date.getMinutes() / 60) / 24 * 100).toFixed(1); }
  function formatTime(timestamp) {
    const date = new Date(timestamp);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  function formatDateTime(timestamp) {
    const date = new Date(timestamp);
    const today = new Date(state.now);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const sameDay = (left, right) => left.toDateString() === right.toDateString();
    const label = sameDay(date, today) ? '오늘' : sameDay(date, yesterday) ? '어제' : `${date.getMonth() + 1}/${date.getDate()}`;
    return `${label} ${formatTime(timestamp)}`;
  }
  function formatDuration(milliseconds) {
    const minutes = Math.max(0, Math.floor(milliseconds / 60_000));
    if (minutes < 1) return '방금 전';
    if (minutes < 60) return `${minutes}분`;
    const hours = Math.floor(minutes / 60);
    if (hours < 48) return `${hours}시간 ${minutes % 60}분`;
    return `${Math.floor(hours / 24)}일 ${hours % 24}시간`;
  }
  function formatHours(hours) {
    if (!Number.isFinite(hours)) return '—';
    return hours >= 1 ? `${Math.round(hours * 10) / 10}시간` : `${Math.round(hours * 60)}분`;
  }

  $('#settings-open').addEventListener('click', () => { elements.settingsLayer.hidden = false; });
  $('#settings-close').addEventListener('click', () => { elements.settingsLayer.hidden = true; });
  elements.settingsLayer.addEventListener('click', (event) => { if (event.target === elements.settingsLayer) elements.settingsLayer.hidden = true; });
  $('#serial-toggle').addEventListener('click', () => { if (state.portState === 'connected') void disconnectSerial(); else void connectSerial(); });
  $('#simulate-take').addEventListener('click', () => {
    const dispenser = lastDispenserState();
    if (dispenser.remaining <= 0) handleLine('RESET');
    const current = lastDispenserState();
    const remaining = current.remaining - 1;
    handleLine(`[${TOTAL_DOSES - remaining},${remaining},TAKE]`);
  });
  $('#simulate-reset').addEventListener('click', () => handleLine('RESET'));
  $('#simulate-emergency').addEventListener('click', () => {
    const dispenser = lastDispenserState();
    handleLine(state.emergency ? 'EMERGENCY,CANCEL' : `[${dispenser.taken},${dispenser.remaining},EMERGENCY]`);
  });
  $('#emergency-cancel').addEventListener('click', () => handleLine('EMERGENCY,CANCEL'));
  $('#emergency-modal-confirm').addEventListener('click', () => {
    state.emergencyModalOpen = false;
    render();
  });
  $('#emergency-modal-cancel').addEventListener('click', () => handleLine('EMERGENCY,CANCEL'));
  $('#report-open').addEventListener('click', () => { elements.report.hidden = false; renderReport(); });
  const closeReport = () => { elements.report.hidden = true; };
  $('#report-close').addEventListener('click', closeReport);
  $('#report-confirm').addEventListener('click', closeReport);
  $('#history-clear').addEventListener('click', () => {
    state.events = [];
    state.emergency = false;
    state.emergencyModalOpen = false;
    saveEvents();
    closeReport();
    render();
  });

  window.addEventListener('beforeunload', () => { clearTimeout(state.fxTimer); void disconnectSerial(); });
  if ('serial' in navigator) navigator.serial.addEventListener('disconnect', () => {
    state.portState = 'disconnected';
    state.port = null;
    renderConnection();
  });

  render();
  setInterval(render, 1000);
})();
