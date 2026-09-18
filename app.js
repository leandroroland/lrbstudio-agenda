/* =============================================================================
 * LRB Studio — Agenda pública
 * Lee la agenda desde Supabase (misma DB que BarberBrain) mediante la RPC
 * get_public_agenda. Solo muestra franjas ocupadas: ningún dato del cliente.
 * ========================================================================== */

const CONFIG = {
  supabaseUrl: "https://symzcmzmyclimleanfim.supabase.co",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5bXpjbXpteWNsaW1sZWFuZmltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTM0ODksImV4cCI6MjA5NjE4OTQ4OX0.pjnJR77xGdMmwt-L5YFO3jc32dWmVUhWKepXDPHU3yM",
  barberId: "a8105994-21e9-47c1-80e0-7ef707339c29",
  refreshMs: 60000,
  minDaysBack: 7,
  maxDaysAhead: 30,
};

const els = {
  prev: document.getElementById("prev"),
  next: document.getElementById("next"),
  today: document.getElementById("today"),
  dateRel: document.getElementById("dateRel"),
  dateFull: document.getElementById("dateFull"),
  hours: document.getElementById("hours"),
  hoursText: document.getElementById("hoursText"),
  content: document.getElementById("content"),
  updated: document.getElementById("updated"),
  live: document.getElementById("live"),
  liveText: document.getElementById("liveText"),
};

const state = {
  date: startOfDay(new Date()),
  loading: false,
  timer: null,
};

/* ----- Date helpers (siempre en hora local, sin UTC) ---------------------- */
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function ymd(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function isToday(d) {
  return isSameDay(d, new Date());
}
function daysFromToday(d) {
  const t = startOfDay(new Date()).getTime();
  return Math.round((startOfDay(d).getTime() - t) / 86400000);
}
function formatFull(d) {
  try {
    return new Intl.DateTimeFormat("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(d);
  } catch {
    return ymd(d);
  }
}
function relativeLabel(d) {
  const diff = daysFromToday(d);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  if (diff === -1) return "Ayer";
  return formatFull(d).split(" ")[0];
}

/* ----- Data -------------------------------------------------------------- */
async function fetchAgenda(dateStr) {
  const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/rpc/get_public_agenda`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: CONFIG.anonKey,
      Authorization: `Bearer ${CONFIG.anonKey}`,
    },
    body: JSON.stringify({ p_barber: CONFIG.barberId, p_date: dateStr }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ----- Rendering --------------------------------------------------------- */
function setLive(ok) {
  els.live.classList.toggle("off", !ok);
  els.liveText.textContent = ok ? "En vivo" : "Sin conexión";
}

function setUpdated() {
  els.updated.textContent = new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function renderHours(data) {
  if (data && !data.is_closed && data.work_start) {
    els.hoursText.textContent = `Horario de atención ${data.work_start} – ${data.work_end}`;
  } else if (data && data.is_closed) {
    els.hoursText.textContent = "Día sin atención";
  } else {
    els.hoursText.textContent = "";
  }
}

function svgCheck() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
}

function renderLoading() {
  els.content.innerHTML = `<div class="state loading"><span class="spinner"></span><p>Cargando agenda…</p></div>`;
}

function renderError() {
  els.content.innerHTML = `<div class="state"><p class="big">No pudimos cargar la agenda</p><p>Revisá tu conexión e intentá de nuevo.</p><button class="nav" id="retry" type="button" style="width:auto;padding:0 20px;height:44px;font-size:14px;font-weight:600">Reintentar</button></div>`;
  const retry = document.getElementById("retry");
  if (retry) retry.addEventListener("click", load);
}

function renderClosed() {
  els.content.innerHTML = `<div class="state"><p class="big">Sin atención este día</p><p>No hay jornada programada. Elegí otra fecha.</p></div>`;
}

function renderEmpty() {
  els.content.innerHTML = `<div class="state"><span class="emoji-free">${svgCheck()}</span><p class="big">Sin turnos agendados</p><p>La jornada está libre por ahora.</p></div>`;
}

function renderSlots(slots) {
  const rows = slots
    .map((s, i) => {
      const blocked = s.status === "bloqueado";
      return `<div class="slot${blocked ? " blocked" : ""}" style="animation-delay:${Math.min(i * 45, 300)}ms">
        <div class="slot-times">
          <span class="t1">${s.start}</span>
          <span class="dash">–</span>
          <span class="t2">${s.end}</span>
        </div>
        <span class="badge">${blocked ? "No disponible" : "Ocupado"}</span>
      </div>`;
    })
    .join("");

  const count = slots.filter((s) => s.status !== "bloqueado").length;
  const summary = count === 1 ? "1 turno agendado" : `${count} turnos agendados`;
  els.content.innerHTML = rows + `<p class="summary">${summary}</p>`;
}

function render(data) {
  renderHours(data);
  if (!data || data.error) return renderError();
  if (data.is_closed) return renderClosed();
  if (!data.slots || data.slots.length === 0) return renderEmpty();
  renderSlots(data.slots);
}

/* ----- Controller -------------------------------------------------------- */
async function load() {
  if (state.loading) return;
  state.loading = true;
  renderLoading();

  els.dateRel.textContent = relativeLabel(state.date);
  els.dateFull.textContent = formatFull(state.date);

  const today = isToday(state.date);
  els.today.disabled = today;
  els.prev.disabled = daysFromToday(state.date) <= -CONFIG.minDaysBack;
  els.next.disabled = daysFromToday(state.date) >= CONFIG.maxDaysAhead;

  try {
    const data = await fetchAgenda(ymd(state.date));
    render(data);
    setLive(true);
    setUpdated();
  } catch (err) {
    console.error(err);
    setLive(false);
    renderError();
  } finally {
    state.loading = false;
  }
}

function go(deltaDays) {
  const next = new Date(state.date);
  next.setDate(next.getDate() + deltaDays);
  const diff = daysFromToday(next);
  if (diff < -CONFIG.minDaysBack || diff > CONFIG.maxDaysAhead) return;
  state.date = startOfDay(next);
  load();
}

function goToday() {
  state.date = startOfDay(new Date());
  load();
}

function scheduleRefresh() {
  if (state.timer) clearInterval(state.timer);
  state.timer = setInterval(() => {
    if (isToday(state.date) && document.visibilityState === "visible") load();
  }, CONFIG.refreshMs);
}

els.prev.addEventListener("click", () => go(-1));
els.next.addEventListener("click", () => go(1));
els.today.addEventListener("click", goToday);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && isToday(state.date)) load();
});

scheduleRefresh();
load();
