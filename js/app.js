// ─── Supabase Config ──────────────────────────────────────────
// 🔧 REPLACE THESE with your actual Supabase project values
// Get them from: https://app.supabase.com → Project Settings → API
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Auth Helpers ─────────────────────────────────────────────
async function getUser() {
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

async function requireAuth() {
  const user = await getUser();
  if (!user) { window.location.href = 'index.html'; return null; }
  return user;
}

async function signOut() {
  await sb.auth.signOut();
  window.location.href = 'index.html';
}

// ─── Toast Notifications ──────────────────────────────────────
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || icons.info}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 280);
  }, duration);
}

// ─── Geolocation ──────────────────────────────────────────────
function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Geolocation not supported')); return; }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true, timeout: 10000, maximumAge: 0
    });
  });
}

function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Reverse geocode — turn coords into a readable place name
async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await res.json();
    const a = data.address;
    // Build a nice short name: neighbourhood/road + city
    const area  = a.neighbourhood || a.suburb || a.village || a.road || '';
    const city  = a.city || a.town || a.county || '';
    if (area && city) return `${area}, ${city}`;
    return area || city || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

// ─── Location Search (Nominatim) ──────────────────────────────
async function searchPlaces(query) {
  if (!query || query.length < 2) return [];
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=6&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await res.json();
    return data.map(p => ({
      name: p.display_name.split(',').slice(0, 3).join(', '),
      display: p.display_name,
      lat: parseFloat(p.lat),
      lng: parseFloat(p.lon)
    }));
  } catch { return []; }
}

// ─── Date / Time Formatting ───────────────────────────────────
function formatDateShort(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function formatDateTime(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleString('en-IN', {
    day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit'
  });
}

// ─── Priority Badge ───────────────────────────────────────────
function priorityBadge(p) {
  const map = {
    high:   ['badge-red',    '↑ High'],
    medium: ['badge-yellow', '→ Medium'],
    low:    ['badge-green',  '↓ Low']
  };
  const [cls, label] = map[p] || map.low;
  return `<span class="badge ${cls}">${label}</span>`;
}

// ─── Alarm Sound (Web Audio API) ──────────────────────────────
function playAlarm(durationMs = 30000) {
  let ctx;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return () => {}; }

  let playing = true;

  function beep(startAt, freq = 880, dur = 0.3) {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = 'square';
    gain.gain.setValueAtTime(0.7, startAt);
    gain.gain.exponentialRampToValueAtTime(0.001, startAt + dur);
    osc.start(startAt);
    osc.stop(startAt + dur);
  }

  function schedulePattern(at) {
    if (!playing) return;
    beep(at,       880,  0.25);
    beep(at + 0.3, 880,  0.25);
    beep(at + 0.6, 1100, 0.4);
    setTimeout(() => { if (playing) schedulePattern(ctx.currentTime); }, 1800);
  }

  schedulePattern(ctx.currentTime);
  setTimeout(() => { playing = false; ctx.close(); }, durationMs);

  return () => { playing = false; ctx.close(); };
}

// ─── Wake-Up Alarm Modal ──────────────────────────────────────
function showWakeUpModal(task, triggerType) {
  document.getElementById('alarm-modal-overlay')?.remove();

  const stopAlarm = playAlarm(60000);
  if ('vibrate' in navigator) navigator.vibrate([500,200,500,200,500,200,500]);

  const overlay = document.createElement('div');
  overlay.id = 'alarm-modal-overlay';
  overlay.style.cssText = `
    position:fixed; inset:0; z-index:9999;
    background:rgba(10,14,26,0.97);
    display:flex; flex-direction:column;
    align-items:center; justify-content:center;
    text-align:center; padding:2rem;
    animation: alarmFadeIn 0.3s ease;
  `;

  const icon     = triggerType === 'location' ? '📍' : '⏰';
  const subtitle = triggerType === 'location'
    ? `You've arrived at <strong>${task.location_name || 'your destination'}</strong>`
    : `Your scheduled reminder for this task has triggered`;

  overlay.innerHTML = `
    <style>
      @keyframes alarmFadeIn { from { opacity:0; } to { opacity:1; } }
      @keyframes alarmPulse  { 0%,100%{transform:scale(1)} 50%{transform:scale(1.1)} }
      #alarm-icon { font-size:5rem; animation:alarmPulse 0.8s ease-in-out infinite; margin-bottom:1.5rem; }
      #alarm-title { font-family:'Syne',sans-serif; font-size:2rem; font-weight:800; letter-spacing:-0.04em; color:#f1f5f9; margin-bottom:0.75rem; }
      #alarm-task  { font-size:1.1rem; color:#4ade80; font-weight:600; margin-bottom:0.5rem; }
      #alarm-sub   { font-size:0.9rem; color:#64748b; margin-bottom:2.5rem; line-height:1.6; }
      #alarm-dismiss {
        background:#4ade80; color:#0a0e1a;
        border:none; border-radius:14px;
        padding:1rem 3rem; font-size:1.1rem; font-weight:800;
        font-family:'Syne',sans-serif; cursor:pointer; letter-spacing:-0.02em;
        box-shadow:0 0 40px rgba(74,222,128,0.4);
        animation:alarmPulse 0.8s ease-in-out infinite;
      }
      #alarm-snooze {
        margin-top:1rem; background:transparent;
        border:1px solid rgba(255,255,255,0.1); border-radius:8px;
        color:#64748b; padding:0.6rem 1.5rem; font-size:0.85rem; cursor:pointer;
      }
    </style>
    <div id="alarm-icon">${icon}</div>
    <div id="alarm-title">Reminder!</div>
    <div id="alarm-task">${task.title}</div>
    <div id="alarm-sub">${subtitle}</div>
    <button id="alarm-dismiss">Got it ✓</button>
    <button id="alarm-snooze">Snooze 5 min</button>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#alarm-dismiss').addEventListener('click', () => {
    stopAlarm();
    navigator.vibrate?.(0);
    overlay.remove();
  });

  overlay.querySelector('#alarm-snooze').addEventListener('click', () => {
    stopAlarm();
    navigator.vibrate?.(0);
    overlay.remove();
    setTimeout(() => showWakeUpModal(task, triggerType), 5 * 60 * 1000);
    showToast('Snoozed for 5 minutes', 'info');
  });
}

// ─── Time Reminder Engine ─────────────────────────────────────
class TimeReminderEngine {
  constructor() {
    this.intervalId = null;
    this.tasks = [];
    this.fired = new Set();
  }

  start(tasks) {
    this.updateTasks(tasks);
    // Check every 30 seconds
    this.intervalId = setInterval(() => this.check(), 30000);
    this.check(); // immediate check
  }

  stop() {
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
  }

  updateTasks(tasks) {
    this.tasks = tasks.filter(t => t.reminder_time && !t.done);
  }

  check() {
    const now = new Date();
    this.tasks.forEach(task => {
      if (this.fired.has(task.id)) return;
      const reminderAt = new Date(task.reminder_time);
      const diff = now - reminderAt; // ms past reminder time
      // Trigger if within a 2-minute window past the scheduled time
      if (diff >= 0 && diff < 120000) {
        this.fired.add(task.id);
        this.trigger(task);
      }
    });
  }

  trigger(task) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`⏰ Reminder: ${task.title}`, {
        body: task.description || 'Your task reminder is due now.',
        tag: `time-${task.id}`,
        requireInteraction: true,
      });
    }
    showWakeUpModal(task, 'time');
  }
}

// ─── Location Reminder Engine ─────────────────────────────────
class LocationReminderEngine {
  constructor() {
    this.watchId  = null;
    this.tasks    = [];
    this.notified = new Set();
  }

  async start(tasks) {
    this.tasks = tasks.filter(t => t.lat && t.lng && !t.done);
    if (!navigator.geolocation) return;

    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }

    this.watchId = navigator.geolocation.watchPosition(
      pos => this.checkProximity(pos.coords.latitude, pos.coords.longitude),
      err => console.warn('Location watch error:', err.message),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
    );
  }

  stop() {
    if (this.watchId !== null) { navigator.geolocation.clearWatch(this.watchId); this.watchId = null; }
  }

  updateTasks(tasks) {
    this.tasks = tasks.filter(t => t.lat && t.lng && !t.done);
  }

  checkProximity(userLat, userLng) {
    this.tasks.forEach(task => {
      const dist = getDistance(userLat, userLng, task.lat, task.lng);
      if (dist <= (task.radius || 500) && !this.notified.has(task.id)) {
        this.notified.add(task.id);
        this.triggerReminder(task, Math.round(dist));
      }
    });
  }

  triggerReminder(task, dist) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`📍 You've arrived! ${task.title}`, {
        body: `${dist}m from your pinned location. ${task.description || ''}`,
        tag: `loc-${task.id}`,
        requireInteraction: true,
      });
    }
    showWakeUpModal(task, 'location');
  }
}

// Global engine instances
const timeEngine     = new TimeReminderEngine();
const reminderEngine = new LocationReminderEngine();