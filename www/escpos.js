export function buildTicket({ station, mesa, comanda, note, items }) {
  const ESC = 0x1b;
  const GS = 0x1d;
  const enc = (s) => Array.from(new TextEncoder().encode(s));
  // Prefer Latin-1 bytes for accents on Bematech
  const latin1 = (s) => Array.from(String(s), (ch) => {
    const c = ch.charCodeAt(0);
    return c <= 255 ? c : 63;
  });
  const out = [];
  const push = (...arr) => out.push(...arr);
  const text = (s) => push(...latin1(s));
  const line = (s = "") => {
    text(s);
    push(0x0a);
  };

  push(ESC, 0x40);
  push(ESC, 0x61, 0x01);
  push(ESC, 0x21, 0x30);
  line("PedDigital");
  push(ESC, 0x21, 0x00);
  line(String(station || "COZINHA").toUpperCase());
  line("--------------------------------");
  push(ESC, 0x61, 0x00);
  line(`Data: ${new Date().toLocaleString("pt-BR", { hour12: false })}`);
  if (mesa) line(`Mesa: ${mesa}`);
  if (comanda) line(`Comanda: ${comanda}`);
  line("--------------------------------");
  for (const item of items || []) {
    push(ESC, 0x45, 0x01);
    line(`${item.qty || 1}x  ${item.name}`);
    push(ESC, 0x45, 0x00);
    if (item.note) line(`   Obs: ${item.note}`);
  }
  if (note) {
    line("--------------------------------");
    line(`Obs geral: ${note}`);
  }
  line("--------------------------------");
  push(ESC, 0x61, 0x01);
  line("Pedido via Android");
  push(ESC, 0x64, 0x04);
  push(GS, 0x56, 0x00);
  return new Uint8Array(out);
}

export function toBase64(bytes) {
  let s = "";
  bytes.forEach((b) => {
    s += String.fromCharCode(b);
  });
  return btoa(s);
}
