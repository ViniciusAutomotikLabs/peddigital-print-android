import { Capacitor, registerPlugin } from "./capacitor.js";
import { buildTicket, toBase64 } from "./escpos.js";

const TcpPrint = registerPlugin("TcpPrint");
const LocalServer = registerPlugin("LocalServer");

const MENU = [
  { id: "linguica", name: "Linguiça na chapa com pão", price: 31.99, station: "COZINHA", cat: "comida" },
  { id: "carne", name: "Carne de sol com queijo", price: 43.99, station: "COZINHA", cat: "comida" },
  { id: "pastel", name: "Cestinha com 8 pastéis", price: 27.98, station: "COZINHA", cat: "comida" },
  { id: "calabresa", name: "Calabresa acebolada", price: 13.99, station: "COZINHA", cat: "comida" },
  { id: "chopp", name: "Chopp geladinho", price: 5.99, station: "BAR", cat: "bebida" },
  { id: "drinks", name: "Drinks", price: 21.99, station: "BAR", cat: "bebida" },
];

const state = {
  filter: "all",
  cart: [],
  settings: loadSettings(),
  server: null,
  scanner: null,
};

const el = {
  menu: document.getElementById("menu"),
  cartList: document.getElementById("cart-list"),
  cartCount: document.getElementById("cart-count"),
  btnSend: document.getElementById("btn-send"),
  status: document.getElementById("status"),
  settings: document.getElementById("settings"),
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
    return JSON.parse(localStorage.getItem("pd_print_settings") || "{}");
  } catch {
    return {};
  }
}

function saveSettings(next) {
  state.settings = next;
  localStorage.setItem("pd_print_settings", JSON.stringify(next));
}

function money(n) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function setStatus(msg, kind = "") {
  el.status.textContent = msg || "";
  el.status.className = `status ${kind}`.trim();
}

function applyQueryParams() {
  const q = new URLSearchParams(location.search);
  const mesa = q.get("mesa") || q.get("table");
  const comanda = q.get("comanda") || q.get("order");
  if (mesa) document.getElementById("mesa").value = mesa;
  if (comanda) document.getElementById("comanda").value = comanda;

  // peddigital://mesa/12
  if (location.protocol === "peddigital:" || location.href.includes("peddigital://")) {
    const m = location.href.match(/mesa\/([^/?#]+)/i);
    if (m) document.getElementById("mesa").value = decodeURIComponent(m[1]);
  }
}

function parseQrPayload(raw) {
  const text = String(raw || "").trim();
  try {
    const data = JSON.parse(text);
    return {
      mesa: data.mesa || data.table || "",
      comanda: data.comanda || data.order || "",
    };
  } catch {
    /* not json */
  }

  if (/^https?:\/\//i.test(text) || text.includes("://")) {
    try {
      const url = new URL(text.replace(/^peddigital:/i, "https:"));
      const mesa =
        url.searchParams.get("mesa") ||
        url.searchParams.get("table") ||
        (url.pathname.match(/mesa\/([^/]+)/i) || [])[1] ||
        "";
      const comanda = url.searchParams.get("comanda") || url.searchParams.get("order") || "";
      return { mesa: decodeURIComponent(mesa || ""), comanda: decodeURIComponent(comanda || "") };
    } catch {
      /* fallthrough */
    }
  }

  const mesaMatch = text.match(/mesa\s*[:=#\/]?\s*([A-Za-z0-9_-]+)/i);
  const comandaMatch = text.match(/comanda\s*[:=#\/]?\s*([A-Za-z0-9_-]+)/i);
  if (mesaMatch || comandaMatch) {
    return {
      mesa: mesaMatch ? mesaMatch[1] : "",
      comanda: comandaMatch ? comandaMatch[1] : "",
    };
  }

  if (/^\d{1,3}$/.test(text)) return { mesa: text, comanda: "" };
  return null;
}

function renderMenu() {
  const items = MENU.filter((i) => state.filter === "all" || i.cat === state.filter);
  el.menu.innerHTML = items
    .map(
      (item) => `
      <article class="card">
        <span class="badge ${item.station === "BAR" ? "bar" : ""}">${item.station === "BAR" ? "Bar" : "Cozinha"}</span>
        <h3>${item.name}</h3>
        <div class="price">${money(item.price)}</div>
        <button type="button" data-add="${item.id}">Adicionar</button>
      </article>`
    )
    .join("");
}

function renderCart() {
  el.cartCount.textContent = String(state.cart.reduce((n, i) => n + i.qty, 0));
  el.btnSend.disabled = state.cart.length === 0;
  if (!state.cart.length) {
    el.cartList.innerHTML = `<li style="color:var(--muted)">Nenhum item ainda.</li>`;
    return;
  }
  el.cartList.innerHTML = state.cart
    .map(
      (item) => `
      <li>
        <span>${item.qty}x ${item.name} <small>(${item.station})</small></span>
        <button type="button" class="rm" data-rm="${item.id}">remover</button>
      </li>`
    )
    .join("");
}

function addItem(id) {
  const product = MENU.find((p) => p.id === id);
  if (!product) return;
  const existing = state.cart.find((c) => c.id === id);
  if (existing) existing.qty += 1;
  else state.cart.push({ ...product, qty: 1 });
  renderCart();
}

function removeItem(id) {
  state.cart = state.cart.filter((c) => c.id !== id);
  renderCart();
}

function splitTickets() {
  const groups = { COZINHA: [], BAR: [] };
  for (const item of state.cart) {
    groups[item.station].push({ qty: item.qty, name: item.name });
  }
  return Object.entries(groups)
    .filter(([, items]) => items.length)
    .map(([station, items]) => ({ station, items }));
}

function kitchenIp() {
  return state.settings.kitchenIp || el.kitchenIp.value || "192.168.1.26";
}

function barIp() {
  return state.settings.barIp || el.barIp.value || kitchenIp();
}

async function printNative(host, ticket) {
  const bytes = buildTicket(ticket);
  await TcpPrint.send({ host, port: 9100, data: toBase64(bytes) });
  return { station: ticket.station, host, bytes: bytes.length };
}

async function printViaHttp(body) {
  const res = await fetch("/api/print", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || "Falha na impressão");
  return data.results || [];
}

async function sendOrder() {
  const tickets = splitTickets();
  if (!tickets.length) return;

  setStatus("Imprimindo...");
  el.btnSend.disabled = true;

  const body = {
    mesa: document.getElementById("mesa").value.trim() || "12",
    comanda: document.getElementById("comanda").value.trim() || "T",
    note: document.getElementById("note").value.trim(),
    kitchenIp: kitchenIp(),
    barIp: barIp(),
    tickets,
  };

  try {
    let results;
    if (Capacitor.isNativePlatform()) {
      results = [];
      for (const ticket of tickets) {
        const host = ticket.station === "BAR" ? body.barIp : body.kitchenIp;
        results.push(
          await printNative(host, {
            station: ticket.station,
            mesa: body.mesa,
            comanda: body.comanda,
            note: body.note,
            items: ticket.items,
          })
        );
      }
    } else {
      results = await printViaHttp(body);
    }

    setStatus(`Pronto! Impresso: ${results.map((r) => r.station).join(" + ")}`, "ok");
    state.cart = [];
    document.getElementById("note").value = "";
    renderCart();
  } catch (err) {
    setStatus(err.message || String(err), "err");
    el.btnSend.disabled = state.cart.length === 0;
  }
}

function drawQr(text) {
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

async function ensureServer() {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const st = await LocalServer.start({
      port: 8787,
      kitchenIp: kitchenIp(),
      barIp: barIp(),
      printerPort: 9100,
    });
    state.server = st;
    return st;
  } catch (err) {
    console.warn(err);
    return null;
  }
}

async function refreshSettingsInfo() {
  let info = "";
  if (Capacitor.isNativePlatform()) {
    const st = await ensureServer();
    if (st?.running) {
      info = `Servidor no ar · ${st.url}`;
      const mesa = document.getElementById("mesa").value.trim() || "12";
      const comanda = document.getElementById("comanda").value.trim() || "T1";
      drawQr(`${st.url}/?mesa=${encodeURIComponent(mesa)}&comanda=${encodeURIComponent(comanda)}`);
    } else {
      info = "Não foi possível abrir o servidor local (porta 8787).";
    }
    el.modeLabel.textContent = "Android nativo · QR + ESC/POS";
  } else {
    info = "Cliente via Wi‑Fi · impressão no Android do salão";
    el.modeLabel.textContent = "Aberto pelo QR · mesma Wi‑Fi";
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      info = `Conectado ao salão · ${data.url || data.lan}`;
    } catch {
      info = "Sem servidor de impressão neste endereço.";
    }
  }
  el.agentInfo.textContent = info;
}

async function startScan() {
  el.scanDialog.showModal();
  if (!window.Html5Qrcode) {
    setStatus("Scanner indisponível neste aparelho", "err");
    return;
  }
  const scanner = new Html5Qrcode("qr-reader");
  state.scanner = scanner;
  try {
    await scanner.start(
      { facingMode: "environment" },
      { fps: 8, qrbox: 220 },
      async (decoded) => {
        const parsed = parseQrPayload(decoded);
        if (!parsed) {
          setStatus("QR não reconhecido", "err");
          return;
        }
        if (parsed.mesa) document.getElementById("mesa").value = parsed.mesa;
        if (parsed.comanda) document.getElementById("comanda").value = parsed.comanda;
        setStatus(`Mesa ${parsed.mesa || "?"} carregada pelo QR`, "ok");
        await stopScan();
      }
    );
  } catch (err) {
    setStatus("Permita a câmera para ler o QR", "err");
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

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.filter = btn.dataset.cat;
    renderMenu();
  });
});

el.menu.addEventListener("click", (e) => {
  const id = e.target.closest("[data-add]")?.dataset.add;
  if (id) addItem(id);
});

el.cartList.addEventListener("click", (e) => {
  const id = e.target.closest("[data-rm]")?.dataset.rm;
  if (id) removeItem(id);
});

document.getElementById("btn-send").addEventListener("click", sendOrder);
document.getElementById("btn-scan").addEventListener("click", startScan);
document.getElementById("btn-close-scan").addEventListener("click", stopScan);

document.getElementById("btn-settings").addEventListener("click", async () => {
  el.kitchenIp.value = state.settings.kitchenIp || "192.168.1.26";
  el.barIp.value = state.settings.barIp || "192.168.1.26";
  await refreshSettingsInfo();
  el.settings.showModal();
});

document.getElementById("btn-save-settings").addEventListener("click", async () => {
  saveSettings({
    kitchenIp: el.kitchenIp.value.trim(),
    barIp: el.barIp.value.trim(),
  });
  await ensureServer();
});

applyQueryParams();
renderMenu();
renderCart();
ensureServer().then(() => {
  refreshSettingsInfo();
});
