import { Capacitor, registerPlugin } from "./capacitor.js";
import { buildTicket, toBase64 } from "./escpos.js";

const TcpPrint = registerPlugin("TcpPrint");

const DEFAULTS = {
  // URL pública do relay (troque quando subir em Vercel/Fly definitivo)
  cloudUrl: "https://hot-bobcats-begin.loca.lt",
  agentToken: "b230c36fe19f28a4bfcc76ee68c5d64b",
  kitchenIp: "192.168.1.26",
  barIp: "192.168.1.26",
  publicSlug: "demo",
};

const state = {
  settings: { ...DEFAULTS, ...loadSettings() },
  jobs: [],
  scanner: null,
  polling: false,
};

const el = {
  status: document.getElementById("status"),
  jobList: document.getElementById("job-list"),
  cartCount: document.getElementById("cart-count"),
  settings: document.getElementById("settings"),
  cloudUrl: document.getElementById("cloud-url"),
  agentToken: document.getElementById("agent-token"),
  kitchenIp: document.getElementById("kitchen-ip"),
  barIp: document.getElementById("bar-ip"),
  agentInfo: document.getElementById("agent-info"),
  qrUrl: document.getElementById("qr-url"),
  qrCanvas: document.getElementById("qr-canvas"),
  modeLabel: document.getElementById("mode-label"),
  scanDialog: document.getElementById("scan-dialog"),
};

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem("pd_cloud_settings") || "{}");
  } catch {
    return {};
  }
}

function saveSettings(next) {
  state.settings = { ...state.settings, ...next };
  localStorage.setItem("pd_cloud_settings", JSON.stringify(state.settings));
}

function setStatus(msg, kind = "") {
  el.status.textContent = msg || "";
  el.status.className = `status ${kind}`.trim();
}

function cloudBase() {
  return String(state.settings.cloudUrl || "").replace(/\/$/, "");
}

function publicMenuUrl(mesa = "12") {
  const base = cloudBase();
  if (!base) return "";
  const slug = state.settings.publicSlug || "demo";
  return `${base}/m/${slug}?mesa=${encodeURIComponent(mesa)}`;
}

function drawQr(text) {
  if (!text) {
    el.qrUrl.textContent = "Configure a URL da nuvem";
    return;
  }
  if (typeof qrcode !== "function") {
    el.qrUrl.textContent = text;
    return;
  }
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const size = 220;
  const cells = qr.getModuleCount();
  const ctx = el.qrCanvas.getContext("2d");
  const scale = size / cells;
  ctx.fillStyle = "#F6EFE4";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#632626";
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(c * scale, r * scale, scale, scale);
    }
  }
  el.qrUrl.textContent = text;
}

function renderJobs() {
  el.cartCount.textContent = String(state.jobs.length);
  if (!state.jobs.length) {
    el.jobList.innerHTML = `<li style="color:var(--muted)">Aguardando pedidos da nuvem…</li>`;
    return;
  }
  el.jobList.innerHTML = state.jobs
    .map((j) => {
      const items = (j.tickets || [])
        .flatMap((t) => (t.items || []).map((i) => `${i.qty}x ${i.name} (${t.station})`))
        .join(", ");
      return `<li><span>#${j.id} · Mesa ${j.order?.mesa || "?"} · ${items}</span></li>`;
    })
    .join("");
}

async function printJob(job) {
  const kitchenIp = state.settings.kitchenIp || "192.168.1.26";
  const barIp = state.settings.barIp || kitchenIp;
  for (const ticket of job.tickets || []) {
    const host = ticket.station === "BAR" ? barIp : kitchenIp;
    const bytes = buildTicket({
      station: ticket.station,
      mesa: job.order?.mesa,
      comanda: job.order?.comanda,
      note: job.order?.note,
      items: ticket.items || [],
    });
    if (!Capacitor.isNativePlatform()) {
      throw new Error("Impressão só no APK Android");
    }
    await TcpPrint.send({ host, port: 9100, data: toBase64(bytes) });
  }
}

async function ack(jobId, ok, error = "") {
  const base = cloudBase();
  if (!base) return;
  await fetch(`${base}/api/agent/ack`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-agent-token": state.settings.agentToken,
      "bypass-tunnel-reminder": "true",
    },
    body: JSON.stringify({ jobId, ok, error }),
  });
}

async function pollOnce() {
  const base = cloudBase();
  if (!base) {
    el.modeLabel.textContent = "Configure a URL da nuvem em ⚙";
    return;
  }
  try {
    const res = await fetch(`${base}/api/agent/heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-agent-token": state.settings.agentToken,
        "bypass-tunnel-reminder": "true",
      },
      body: JSON.stringify({
        kitchenIp: state.settings.kitchenIp,
        barIp: state.settings.barIp,
        name: "android-agent",
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Falha no heartbeat");

    state.jobs = data.jobs || [];
    renderJobs();
    el.modeLabel.textContent = `Online na nuvem · ${state.jobs.length} na fila`;

    for (const job of [...state.jobs]) {
      try {
        setStatus(`Imprimindo #${job.id}…`);
        await printJob(job);
        await ack(job.id, true);
        setStatus(`Impresso #${job.id}`, "ok");
      } catch (err) {
        await ack(job.id, false, err.message || String(err));
        setStatus(err.message || String(err), "err");
      }
    }
  } catch (err) {
    el.modeLabel.textContent = "Sem nuvem / token";
    setStatus(err.message || String(err), "err");
  }
}

function startPolling() {
  if (state.polling) return;
  state.polling = true;
  const loop = async () => {
    await pollOnce();
    if (state.polling) setTimeout(loop, 2000);
  };
  loop();
}

async function startScan() {
  el.scanDialog.showModal();
  if (!window.Html5Qrcode) return;
  const scanner = new Html5Qrcode("qr-reader");
  state.scanner = scanner;
  try {
    await scanner.start({ facingMode: "environment" }, { fps: 8, qrbox: 220 }, async (decoded) => {
      if (/^https?:\/\//i.test(decoded)) {
        saveSettings({ cloudUrl: decoded.replace(/\/m\/.*$/, "").replace(/\/$/, "") });
        setStatus("URL da nuvem atualizada pelo QR", "ok");
      }
      await stopScan();
      drawQr(publicMenuUrl("12"));
      startPolling();
    });
  } catch {
    setStatus("Permita a câmera", "err");
  }
}

async function stopScan() {
  try {
    if (state.scanner) {
      await state.scanner.stop();
      await state.scanner.clear();
    }
  } catch {
    /* ignore */
  }
  state.scanner = null;
  if (el.scanDialog.open) el.scanDialog.close();
}

document.getElementById("btn-settings").addEventListener("click", () => {
  el.cloudUrl.value = state.settings.cloudUrl || "";
  el.agentToken.value = state.settings.agentToken || DEFAULTS.agentToken;
  el.kitchenIp.value = state.settings.kitchenIp || DEFAULTS.kitchenIp;
  el.barIp.value = state.settings.barIp || DEFAULTS.barIp;
  el.agentInfo.textContent = Capacitor.isNativePlatform()
    ? "Modo agente Android"
    : "Abra no APK";
  drawQr(publicMenuUrl("12"));
  el.settings.showModal();
});

document.getElementById("btn-save-settings").addEventListener("click", () => {
  saveSettings({
    cloudUrl: el.cloudUrl.value.trim().replace(/\/$/, ""),
    agentToken: el.agentToken.value.trim(),
    kitchenIp: el.kitchenIp.value.trim(),
    barIp: el.barIp.value.trim(),
  });
  drawQr(publicMenuUrl("12"));
  startPolling();
});

document.getElementById("btn-scan").addEventListener("click", startScan);
document.getElementById("btn-close-scan").addEventListener("click", stopScan);

renderJobs();
drawQr(publicMenuUrl("12"));
startPolling();
