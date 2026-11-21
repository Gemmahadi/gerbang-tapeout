/* ============================================================================
   GERBANG TAPEOUT — puzzle sirkuit NAND/LATCH di atas sirkuit TapeOut (X Layer)
   - Game statis: tanpa build step, tanpa CDN, tanpa wallet, tanpa backend.
   - Target tiap level = tabel kebenaran sirkuit TapeOut dari data/circuits.json
     (snapshot terverifikasi). Kalau file itu belum ada, pakai contoh lokal yang
     dilabeli jelas "CONTOH LOKAL — bukan sirkuit onchain".
   - Verifikasi live: eth_call read-only ke RPC publik X Layer (failover 3 RPC,
     timeout 8 dtk). Gagal RPC = game tetap jalan dari snapshot.
   ============================================================================ */

'use strict';

/* ---------------- konstanta ---------------- */
const RPCS = [
  'https://rpc.xlayer.tech',
  'https://xlayerrpc.okx.com',
  'https://xlayer.drpc.org',
];
const EXPLORER = 'https://www.okx.com/web3/explorer/xlayer';
const CHAIN_ID = 196;
const LS_KEY = 'gerbang-tapeout-v1';
const RPC_TIMEOUT_MS = 8000;

/* ---------------- sirkuit contoh lokal (fallback) ----------------
   JELAS-JELAS BUKAN sirkuit onchain. Dipakai hanya kalau data/circuits.json
   belum ada. Truth table-nya standar dan kecil. */
const FALLBACK_EXAMPLES = {
  'contoh-not': {
    id: 'contoh-not', name: 'NOT — contoh lokal', canonical: 'contoh-not',
    level: 1, nandCount: 1,
    truthTable: { '0': '1', '1': '0' },
    note: 'CONTOH LOKAL — bukan sirkuit onchain',
  },
  'contoh-and': {
    id: 'contoh-and', name: 'AND — contoh lokal', canonical: 'contoh-and',
    level: 2, nandCount: 2,
    truthTable: { '00': '0', '01': '0', '10': '0', '11': '1' },
    note: 'CONTOH LOKAL — bukan sirkuit onchain',
  },
  'contoh-xor': {
    id: 'contoh-xor', name: 'XOR — contoh lokal', canonical: 'contoh-xor',
    level: 4, nandCount: 4,
    truthTable: { '00': '0', '01': '1', '10': '1', '11': '0' },
    note: 'CONTOH LOKAL — bukan sirkuit onchain',
  },
};

/* ---------------- definisi level ----------------
   fn: ([bit input...]) -> [bit output...] — target lokal.
   fnSeq (level sekuensial): (q0, [bit input...]) -> qNext.
   PEMETAAN JUJUR ke data on-chain (data/circuits.json, terverifikasi 21 Nov 2026):
   - `circuit` = canonical sirkuit on-chain yang jadi target PERSIS level ini
     (truth table-nya dipakai verbatim). Hanya level 7 (mayoritas 2-dari-3).
   - `backing: 'nand'` = target level ini KOMPOSISI LOKAL dari primitif NAND
     on-chain 1.268.tape (NAND functionally complete). TIDAK ADA adder, latch,
     atau multi-output on-chain di data ini — jangan klaim ada.
   - Level 1 (NOT) memakai primitif NAND yang sama: NOT = NAND(A,A). */
const LEVELS = [
  { id: 1, name: 'NOT', desc: 'Balik satu bit: 0 jadi 1, 1 jadi 0. Satu NAND sudah cukup — hubungkan input yang sama ke kedua kaki NAND.',
    inputs: [{ id: 'A', label: 'A' }], outputs: [{ id: 'Y', label: 'Y' }],
    fn: ([a]) => [1 - a], par: 1, example: 'contoh-not',
    circuit: '1.268.tape', relation: 'primitive',
    backing: 'NOT = NAND(A,A) — komposisi 1 gerbang dari primitif yang sama. Target level ini adalah NOT, bukan sirkuit NAND itu sendiri.',
    tip: 'NAND(A, A) = NOT A. Coba sambung A ke kedua input NAND.' },
  { id: 2, name: 'AND', desc: 'Keluaran 1 hanya kalau A DAN B sama-sama 1.',
    inputs: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }], outputs: [{ id: 'Y', label: 'Y' }],
    fn: ([a, b]) => [a & b], par: 2, example: 'contoh-and',
    backing: 'nand',
    backingText: 'Komposisi lokal dari primitif NAND on-chain 1.268.tape (2 NAND). Tidak ada sirkuit AND on-chain di data terverifikasi ini.',
    tip: 'AND = NOT(NAND). NAND dulu, lalu balik hasilnya dengan NAND lagi.' },
  { id: 3, name: 'OR', desc: 'Keluaran 1 kalau A ATAU B (atau keduanya) bernilai 1.',
    inputs: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }], outputs: [{ id: 'Y', label: 'Y' }],
    fn: ([a, b]) => [a | b], par: 3,
    backing: 'nand',
    backingText: 'Komposisi lokal dari primitif NAND on-chain 1.268.tape (3 NAND). Tidak ada sirkuit OR on-chain di data terverifikasi ini.',
    tip: 'OR = NAND(NOT A, NOT B). Balik dulu tiap input, baru NAND.' },
  { id: 4, name: 'XOR', desc: 'Keluaran 1 kalau A dan B BERBEDA. Gerbang paling terkenal kedua setelah NAND.',
    inputs: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }], outputs: [{ id: 'Y', label: 'Y' }],
    fn: ([a, b]) => [a ^ b], par: 4, example: 'contoh-xor',
    backing: 'nand',
    backingText: 'Komposisi lokal dari primitif NAND on-chain 1.268.tape (4 NAND). Tidak ada sirkuit XOR on-chain di data terverifikasi ini.',
    tip: 'XOR butuh 4 NAND: NAND(A,B) dipakai dua kali sebagai "kunci" untuk dua NAND berikutnya.' },
  { id: 5, name: 'Half-Adder', desc: 'Penambah 1 bit: S = jumlah, C = bawaan (carry). Dua output sekaligus!',
    inputs: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }],
    outputs: [{ id: 'S', label: 'S' }, { id: 'C', label: 'C' }],
    fn: ([a, b]) => [a ^ b, a & b], par: 5,
    backing: 'nand',
    backingText: 'Komposisi lokal dari primitif NAND on-chain 1.268.tape (5 NAND). Tidak ada adder on-chain di data terverifikasi ini.',
    tip: 'S itu XOR, C itu AND. NAND(A,B) di dalam XOR bisa dipakai ulang untuk C (tambah satu NAND sebagai pembalik).' },
  { id: 6, name: 'Full-Adder', desc: 'Penambah 1 bit + carry masuk. Otak dari semua penambah besar.',
    inputs: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }, { id: 'Cin', label: 'Cin' }],
    outputs: [{ id: 'S', label: 'S' }, { id: 'C', label: 'Cout' }],
    fn: ([a, b, c]) => [a ^ b ^ c, (a & b) | (c & (a ^ b))], par: 10,
    backing: 'nand',
    backingText: 'Komposisi lokal dari primitif NAND on-chain 1.268.tape (10 NAND). Tidak ada adder on-chain di data terverifikasi ini.',
    tip: 'S = XOR(XOR(A,B), Cin). Carry = NAND(NAND(A,B), NAND(Cin, XOR(A,B))).' },
  { id: 7, name: 'Mayoritas 2-dari-3', desc: 'Keluaran 1 kalau MINIMAL 2 dari 3 input bernilai 1. Ini sirkuit on-chain ASLI: targetnya adalah tabel kebenaran lengkap 3.268.tape (XBOT Konsensus 2-dari-3) — 8 baris, terverifikasi on-chain.',
    inputs: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }, { id: 'C', label: 'C' }],
    outputs: [{ id: 'Y', label: 'Y' }],
    fn: ([a, b, c]) => [(a & b) | (b & c) | (a & c)], par: 6,
    circuit: '3.268.tape', relation: 'exact',
    backing: 'Target = tabel kebenaran LENGKAP sirkuit on-chain 3.268.tape (XBOT Konsensus 2-dari-3: Risk + Liquidity + Market, 8 gerbang NAND, 8 baris — terverifikasi on-chain, blok #76470115).',
    tip: 'Mayoritas = NAND(NAND(A,B), NAND(B,C), NAND(A,C)) dengan NAND 3-input. NAND 3-input dari NAND 2-input: NAND(NAND(x,y), z) setelah x∧y dibuat dulu — total 6 NAND.' },
  { id: 8, name: 'Penambah 2-bit', desc: 'Jumlahkan dua bilangan 2-bit: A1A0 + B1B0 = S2S1S0.',
    inputs: [{ id: 'A1', label: 'A1' }, { id: 'A0', label: 'A0' }, { id: 'B1', label: 'B1' }, { id: 'B0', label: 'B0' }],
    outputs: [{ id: 'S2', label: 'S2' }, { id: 'S1', label: 'S1' }, { id: 'S0', label: 'S0' }],
    fn: ([a1, a0, b1, b0]) => {
      const s = (a1 * 2 + a0) + (b1 * 2 + b0);
      return [(s >> 2) & 1, (s >> 1) & 1, s & 1];
    }, par: 15,
    backing: 'nand',
    backingText: 'Komposisi lokal dari primitif NAND on-chain 1.268.tape (15 NAND). Tidak ada adder on-chain di data terverifikasi ini.',
    tip: 'Bit 0 = half-adder, bit 1 = full-adder dengan carry dari bit 0.' },
  { id: 9, name: 'Sel Memori D-Latch', desc: 'Memori 1 bit! Q mengikuti D hanya saat CLK=1 (tekan TICK). Saat CLK=0, Q diam — itulah memori.',
    inputs: [{ id: 'D', label: 'D' }, { id: 'CLK', label: 'CLK' }],
    outputs: [{ id: 'Q', label: 'Q' }],
    fnSeq: (q0, [d, clk]) => (clk ? d : q0),
    sequential: true, latchAllowed: true, par: 6,
    backing: 'nand',
    backingText: 'LATCH adalah komponen lokal game — TIDAK ADA latch on-chain di data terverifikasi ini. Level ini melatih memori yang dibangun dari NAND, bukan meniru sirkuit on-chain.',
    tip: 'Pakai 1 LATCH: S = NOT NAND(D, CLK), R = NOT NAND(NOT D, CLK). Atur D + CLK, lalu tekan TICK.' },
  { id: 10, name: 'BOS: Penambah 4-bit', desc: 'Penambah 4-bit dari NAND: A3A2A1A0 + B3B2B1B0 = S4S3S2S1S0. 256 kombinasi diuji! Satu half-adder + tiga full-adder berantai.',
    inputs: [{ id: 'A3', label: 'A3' }, { id: 'A2', label: 'A2' }, { id: 'A1', label: 'A1' }, { id: 'A0', label: 'A0' },
             { id: 'B3', label: 'B3' }, { id: 'B2', label: 'B2' }, { id: 'B1', label: 'B1' }, { id: 'B0', label: 'B0' }],
    outputs: [{ id: 'S4', label: 'S4' }, { id: 'S3', label: 'S3' }, { id: 'S2', label: 'S2' }, { id: 'S1', label: 'S1' }, { id: 'S0', label: 'S0' }],
    fn: ([a3, a2, a1, a0, b3, b2, b1, b0]) => {
      const s = (a3 * 8 + a2 * 4 + a1 * 2 + a0) + (b3 * 8 + b2 * 4 + b1 * 2 + b0);
      return [(s >> 4) & 1, (s >> 3) & 1, (s >> 2) & 1, (s >> 1) & 1, s & 1];
    }, par: 35,
    backing: 'nand',
    backingText: 'Komposisi lokal dari primitif NAND on-chain 1.268.tape (35 NAND). TIDAK ADA adder on-chain di data terverifikasi ini — level ini bukan miniatur CPU on-chain.',
    tip: 'Satu half-adder (bit 0) + tiga full-adder berantai, carry mengalir dari bit 0 ke bit 3. Bangun satu full-adder yang rapi, lalu salin polanya.' },
];

/* Tantangan "BANGUN SIRKUIT INI" dari mode SIRKUIT ONCHAIN: pemain membangun
   ulang sirkuit on-chain ASLI dengan NAND, dicek ekshaustif terhadap truth
   table asli. Bukan bagian dari 10 level (tidak memberi bintang/koin). */
const CHALLENGES = [
  { id: 'oc-nand', name: 'Bangun NAND 1.268.tape', challengeOf: '1.268.tape',
    desc: 'Bangun ulang sirkuit NAND 2-input on-chain (XBOT 1.268.tape) dengan gerbang NAND. Target = tabel kebenaran asli, 4 baris.',
    inputs: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }], outputs: [{ id: 'Y', label: 'Y' }],
    fn: ([a, b]) => [(a && b) ? 0 : 1], par: 1,
    circuit: '1.268.tape', relation: 'exact',
    backing: 'Target = tabel kebenaran LENGKAP sirkuit on-chain 1.268.tape (XBOT NAND 2-input, 3 gerbang, 4 baris — terverifikasi on-chain, blok #76470115).',
    tip: 'Satu NAND saja sudah cukup — sirkuit aslinya memang satu fungsi NAND (netlist-nya memakai 3 gerbang karena ada buffer NOT ganda di ujung).' },
];
function findLevel(id) {
  return LEVELS.find((l) => l.id === id) || CHALLENGES.find((l) => l.id === id) || null;
}
function isChallenge(level) { return typeof level.id === 'string'; }

/* ---------------- state ---------------- */
const state = {
  circuits: null,          // isi data/circuits.json kalau berhasil dimuat
  circuitsLoaded: false,
  progress: loadProgress(),
  level: null,             // definisi level aktif
  nodes: [],               // {id,type,x,y,value,q}
  wires: [],               // {id,fromNode,fromPin,toNode,toPin}
  nextId: 1,
  pendingWire: null,       // {fromNode,fromPin}
  deleteMode: false,
  muted: false,
  lastEval: null,
  oc: { circuit: null, live: {}, quiz: { total: 0, correct: 0, value: null, answered: false } },
};

function loadProgress() {
  try {
    const p = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    return { stars: p.stars || {}, coins: p.coins || 0, muted: !!p.muted };
  } catch (e) { return { stars: {}, coins: 0, muted: false }; }
}
function saveProgress() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state.progress));
  } catch (e) { /* localStorage penuh/diblokir — game tetap jalan */ }
}
state.muted = state.progress.muted;

/* ---------------- util ---------------- */
const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  if (html != null) d.innerHTML = html;
  return d;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shortHash = (h) => (h && h.length > 18 ? h.slice(0, 10) + '…' + h.slice(-6) : (h || '—'));
const fmtDate = (iso) => {
  try { return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch (e) { return iso || '—'; }
};

/* ---------------- suara (WebAudio, bisa dimute) ---------------- */
let audioCtx = null;
function beep(freq, dur, type) {
  if (state.muted) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type || 'square';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.06, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
  } catch (e) { /* audio tidak tersedia — diam saja */ }
}
const sfxClick = () => beep(660, 0.06);
const sfxWire = () => beep(880, 0.05);
const sfxWin = () => { beep(523, 0.12); setTimeout(() => beep(659, 0.12), 110); setTimeout(() => beep(784, 0.22), 220); };
const sfxFail = () => beep(180, 0.18, 'sawtooth');

/* ---------------- navigasi layar ---------------- */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $('#' + id).classList.add('active');
  window.scrollTo(0, 0);
}
function refreshTitle() {
  const done = Object.keys(state.progress.stars).length;
  const stars = Object.values(state.progress.stars).reduce((a, b) => a + b, 0);
  $('#title-progress').textContent = done === 0
    ? 'Belum ada progres'
    : `Selesai ${done}/10 level · ${stars}/30 bintang`;
  $('#title-coins').textContent = state.progress.coins;
  $('#header-coins').textContent = state.progress.coins;
  $('#title-data-status').textContent = state.circuitsLoaded
    ? `Data sirkuit on-chain dimuat (${(state.circuits.circuits || []).length} sirkuit)`
    : 'Mode contoh lokal — data onchain belum dimuat';
}

/* ---------------- pilih level ---------------- */
function renderLevelGrid() {
  const grid = $('#level-grid');
  grid.innerHTML = '';
  const unlocked = maxUnlocked();
  LEVELS.forEach((lv) => {
    const stars = state.progress.stars[lv.id] || 0;
    const locked = lv.id > unlocked;
    const card = el('button', 'level-card');
    card.disabled = locked;
    card.innerHTML = `<div class="lc-num">LEVEL ${lv.id}${locked ? ' · TERKUNCI' : ''}</div>
      <div class="lc-name">${esc(lv.name)}</div>
      <div class="lc-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
      <div class="lc-par">Par ${lv.par} gerbang</div>`;
    card.addEventListener('click', () => { sfxClick(); loadLevel(lv.id); });
    grid.appendChild(card);
  });
}
function maxUnlocked() {
  let m = 1;
  for (let i = 1; i <= 10; i++) if (state.progress.stars[i]) m = Math.max(m, Math.min(10, i + 1));
  return m;
}

/* ---------------- data sirkuit ---------------- */
async function loadCircuits() {
  try {
    const res = await fetch('data/circuits.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data || !Array.isArray(data.circuits)) throw new Error('format circuits.json tidak dikenal');
    state.circuits = data;
    state.circuitsLoaded = true;
  } catch (e) {
    // File belum ditulis worker verifikasi — mode contoh lokal. Bukan error fatal.
    state.circuits = null;
    state.circuitsLoaded = false;
  }
  refreshTitle();
}

/* ---------------- simulator netlist on-chain ----------------
   Format terverifikasi (circuits.json, field `decode` tiap sirkuit):
   - record 7-byte [0x00][in1:uint24 BE][in2:uint24 BE] (NAND)
   - gate ke-i output wire n+i, n = inputs+2 (wire 0 = 0, wire 1 = 1)
   - bits little-endian: byte j bit k -> wire 8j+k+2; untuk nilai V,
     wire 2+i = bit i dari V. Output = gate terakhir.
   - kunci truth table = V dalam biner MSB-first (parseInt(key, 2)).
   Divalidasi vs circuits.json (sim-check.js): semua baris truth table
   (4+8+5x4) cocok, calldata contoh ke-6 sirkuit ter-rekonstruksi persis. */

/* Simulasi lokal dari netlist di circuits.json. value = nilai input mentah V. */
function simulateNetlist(circuit, value) {
  const n = circuit.inputs + 2;
  const gates = circuit.netlist || [];
  const wires = new Array(n + gates.length).fill(0);
  wires[0] = 0; wires[1] = 1;
  for (let k = 0; k < circuit.inputs; k++) wires[k + 2] = (value >> k) & 1;
  gates.forEach((g, i) => { wires[n + i] = (wires[g[0]] && wires[g[1]]) ? 0 : 1; });
  return wires[n + gates.length - 1];
}
/* Nilai "field" threshold (mis. leverage 2000): dibangun dari caring wires
   LSB-first; daftar caring wires diparse dari field `function` di file.
   Kalau tidak ada daftarnya (sirkuit #1 ViperX), field = nilai mentah V. */
function fieldValueOf(circuit, value) {
  const m = (circuit.function || '').match(/caring wires \[([0-9,\s]+)\]/);
  if (!m) return value;
  const caring = m[1].split(',').map((s) => parseInt(s.trim(), 10));
  let f = 0;
  caring.forEach((w, i) => { f |= (((value >> (w - 2)) & 1) << i); });
  return f;
}
/* Kunci truth table (MSB-first) <-> nilai V. */
const valueFromKey = (key) => parseInt(key, 2);
const keyFromValue = (v, n) => v.toString(2).padStart(n, '0');
/* Apakah sirkuit ini threshold 16-input (truth table hanya 5 spot-check)? */
function isThreshold(circuit) {
  return circuit && circuit.inputs === 16;
}
/* Nama tampilan yang jujur: ViperX #2-#4 hanya "kemungkinan" (lihat notes). */
function displayName(circuit) {
  if (!circuit) return '—';
  const name = circuit.name || circuit.canonical || circuit.id || '—';
  if (/ViperX risk circuit #[234]\b/.test(name)) return name.replace(' — ', ' — KEMUNGKINAN: ');
  return name;
}
/* Bangun calldata eval(tokenId, bits) — selector 0x934d06ea.
   bits = little-endian bytes dari V (1 byte untuk sirkuit kecil, 2 byte untuk 16-bit). */
function buildEvalCalldata(circuit, value) {
  const tokenId = parseInt(circuit.id, 10);
  const nBytes = Math.ceil(circuit.inputs / 8);
  const bytes = [];
  for (let j = 0; j < nBytes; j++) bytes.push((value >> (8 * j)) & 0xff);
  const hex = (n, len) => n.toString(16).padStart(len, '0');
  const dataHex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return '0x934d06ea' + hex(tokenId, 64) + hex(0x40, 64) + hex(bytes.length, 64) + dataHex.padEnd(64, '0');
}
/* Decode hasil eth_call eval: ABI bytes = offset(32B) + length(32B) + data (1 byte 0x00/0x01). */
function decodeEvalResult(hex) {
  const h = String(hex || '').replace(/^0x/, '');
  if (h.length < 128) return null;
  const len = parseInt(h.slice(64, 128), 16);
  if (!len || h.length < 128 + len * 2) return null;
  const data = h.slice(128, 128 + len * 2);
  return parseInt(data.slice(-2), 16) & 1;
}
/* Output yang diharapkan dari calldata contoh di file (field `calldataExpected`,
   mis. "0x00 (bytes [0x00])"). Format lama (decode.expected) tetap didukung. */
function expectedOutputOf(entry) {
  if (entry.calldataExpected) {
    const m = String(entry.calldataExpected).match(/0x([0-9a-fA-F]+)/);
    if (m) return parseInt(m[1], 16) & 1;
  }
  if (entry.decode && typeof entry.decode === 'object' && entry.decode.expected) {
    const m = String(entry.decode.expected).match(/0x([0-9a-fA-F]+)/);
    if (m) return parseInt(m[1], 16) & 1;
  }
  return null;
}
/* eth_call eval LIVE ke processor sirkuit (failover 3 RPC, timeout 8 dtk). */
async function liveEval(circuit, value) {
  const addr = circuit.processorAddress || (state.circuits.processor || {}).address;
  if (!addr) throw new Error('alamat processor tidak ada di data');
  const data = buildEvalCalldata(circuit, value);
  const { result, rpc } = await rpcCall('eth_call', [{ to: addr, data }, 'latest']);
  const out = decodeEvalResult(result);
  if (out == null) throw new Error('hasil eth_call tidak bisa di-decode: ' + String(result).slice(0, 40));
  return { out, rpc, raw: result };
}
/* Cari entri sirkuit di circuits.json berdasarkan canonical (mis. '1.268.tape'). */
function circuitByCanonical(canonical) {
  if (!state.circuitsLoaded) return null;
  return (state.circuits.circuits || []).find((c) => c.canonical === canonical) || null;
}

/* Sirkuit yang dipasangkan ke satu level:
   1) `level.circuit` (canonical) -> entri itu, relation dari level.
   2) `backing: 'nand'` -> primitif NAND 1.268.tape sebagai backing (bukan target).
   3) Legacy: field `level` di data, HANYA kalau bentuk truth table-nya cocok
      dengan level (mencegah ViperX 16-input nempel ke level OR/XOR).
   4) Contoh lokal (level 1/2/4) kalau data belum dimuat. */
function circuitForLevel(level) {
  if (state.circuitsLoaded) {
    if (level.circuit) {
      const found = circuitByCanonical(level.circuit);
      if (found) return { entry: found, source: 'onchain', relation: level.relation || 'exact' };
    }
    if (level.backing === 'nand') {
      const nand = circuitByCanonical('1.268.tape');
      if (nand) return { entry: nand, source: 'onchain', relation: 'primitive' };
    }
    const legacy = (state.circuits.circuits || []).find((c) => c.level === level.id);
    if (legacy && legacy.truthTable) {
      const keys = Object.keys(legacy.truthTable);
      const wantLen = level.sequential ? level.inputs.length + 1 : level.inputs.length;
      if (keys.length > 0 && keys.every((k) => k.length === wantLen)) {
        return { entry: legacy, source: 'onchain', relation: 'exact' };
      }
    }
  }
  if (level.example && FALLBACK_EXAMPLES[level.example]) {
    return { entry: FALLBACK_EXAMPLES[level.example], source: 'lokal' };
  }
  return { entry: null, source: 'lokal' };
}

/* Tabel kebenaran target untuk level: dari truthTable onchain kalau bentuknya
   cocok DAN relasinya 'exact', kalau tidak dari fungsi lokal. Mengembalikan
   {table, source, circuit, relation}. */
function targetFor(level) {
  const { entry, source, relation } = circuitForLevel(level);
  const nIn = level.inputs.length;
  const nOut = level.outputs.length;
  if (entry && relation === 'exact' && entry.truthTable && typeof entry.truthTable === 'object') {
    const keys = Object.keys(entry.truthTable);
    const wantLen = level.sequential ? nIn + 1 : nIn; // sekuensial: kunci = Q0 + input
    const ok = keys.length > 0 && keys.every((k) => k.length === wantLen && /^[01]+$/.test(k))
      && keys.every((k) => String(entry.truthTable[k]).length === nOut);
    if (ok) return { table: entry.truthTable, source: 'onchain', circuit: entry, relation };
  }
  // Bangun tabel lokal dari fungsi target.
  const table = {};
  if (level.sequential) {
    for (const q0 of [0, 1]) {
      for (let i = 0; i < (1 << nIn); i++) {
        const bits = nIn ? i.toString(2).padStart(nIn, '0') : '';
        const inp = bits.split('').map(Number);
        table[q0 + bits] = String(level.fnSeq(q0, inp));
      }
    }
  } else {
    for (let i = 0; i < (1 << nIn); i++) {
      const bits = i.toString(2).padStart(nIn, '0');
      const inp = bits.split('').map(Number);
      table[bits] = level.fn(inp).join('');
    }
  }
  return { table, source: entry ? 'lokal' : 'lokal', circuit: entry || null, relation: relation || null };
}

/* ---------------- muat level ---------------- */
function loadLevel(id) {
  const level = findLevel(id);
  if (!level) return;
  state.level = level;
  state.nodes = [];
  state.wires = [];
  state.nextId = 1;
  state.pendingWire = null;
  state.deleteMode = false;
  $('#btn-del-gate').classList.remove('armed');
  $('#btn-del-gate').textContent = 'HAPUS GERBANG';
  $('#test-results').classList.add('hidden');
  $('#test-results').innerHTML = '';
  hideMsg();

  // Tata letak awal: input di kiri, output di kanan.
  // Level dengan >4 input (mis. boss 4-bit) memakai dua kolom input.
  const ws = $('#workspace');
  // Boss 4-bit butuh kanvas lebih lebar (35 gerbang) + lebih tinggi (4 baris).
  const canvasW = level.id === 10 ? 1450 : null;
  $('#canvas').style.width = canvasW ? canvasW + 'px' : '100%';
  ws.style.height = level.id === 10 ? '680px' : '520px';
  const W = canvasW || Math.max(ws.clientWidth || 900, 640);
  const inCols = level.inputs.length > 4 ? 2 : 1;
  const inPerCol = Math.ceil(level.inputs.length / inCols);
  const inGap = Math.min(96, Math.floor(400 / Math.max(1, inPerCol - 1 || 1)));
  level.inputs.forEach((inp, i) => {
    const col = Math.floor(i / inPerCol);
    const row = i % inPerCol;
    state.nodes.push({
      id: state.nextId++, type: 'input', label: inp.label, pinId: inp.id,
      x: 40 + col * 150, y: 40 + row * inGap, value: 0, fixed: true,
    });
  });
  const outGap = Math.min(96, Math.floor(400 / Math.max(1, level.outputs.length - 1 || 1)));
  level.outputs.forEach((out, i) => {
    state.nodes.push({
      id: state.nextId++, type: 'output', label: out.label, pinId: out.id,
      x: W - 160, y: 40 + i * outGap, fixed: true,
    });
  });

  $('#level-kicker').textContent = isChallenge(level) ? 'SIRKUIT ONCHAIN · TANTANGAN' : `LEVEL ${level.id} / 10`;
  $('#level-name').textContent = level.name;
  $('#side-level-title').textContent = isChallenge(level) ? level.name : `Level ${level.id} — ${level.name}`;
  $('#side-level-desc').textContent = level.desc;
  $('#side-par').textContent = level.par + (level.latchAllowed ? ' (NAND + 1 LATCH)' : '');
  $('#side-tip').textContent = 'Tip: ' + level.tip;
  $('#btn-add-latch').classList.toggle('hidden', !level.latchAllowed);
  $('#btn-tick').disabled = !level.sequential;
  $('#btn-tick').textContent = level.sequential ? 'TICK ⏱' : 'TICK ⏱';
  updateStarsHeader();
  // Layar harus aktif DULU sebelum render node/kabel, karena posisi pin
  // diukur lewat getBoundingClientRect (0 kalau elemen masih display:none).
  showScreen('screen-game');
  renderTargetTable();
  renderNodes();
  evaluateAndRender();
  updateProofPanel();
  verifyProofLive();
}
function updateStarsHeader() {
  const s = isChallenge(state.level) ? 0 : (state.progress.stars[state.level.id] || 0);
  $('#header-stars').textContent = '★'.repeat(s) + '☆'.repeat(3 - s);
  $('#side-used').textContent = gatesUsed();
}
function gatesUsed() {
  return state.nodes.filter((n) => n.type === 'nand' || n.type === 'latch').length;
}

/* ---------------- tabel target di sidebar ---------------- */
function renderTargetTable() {
  const level = state.level;
  const { table, source, circuit } = targetFor(level);
  const keys = Object.keys(table).sort();
  const inLabels = level.sequential ? ['Q₀'].concat(level.inputs.map((i) => i.label)) : level.inputs.map((i) => i.label);
  const outLabels = level.outputs.map((o) => o.label);
  let html = '<div class="scroll"><table><tr><th>' + inLabels.join('</th><th>') + '</th><th>→</th><th>' + outLabels.join('</th><th>') + '</th></tr>';
  const show = keys.length > 64 ? keys.slice(0, 8) : keys;
  show.forEach((k) => {
    html += '<tr><td>' + k.split('').join('</td><td>') + '</td><td>→</td><td>' + String(table[k]).split('').join('</td><td>') + '</td></tr>';
  });
  html += '</table></div>';
  if (keys.length > 64) html += `<p class="muted small">Menampilkan 8 dari ${keys.length} kombinasi — tombol UJI memeriksa semuanya.</p>`;
  $('#target-table').innerHTML = html;
  const src = (() => {
    if (!circuit) return 'Target lokal — sirkuit onchain untuk level ini belum ada di data (menunggu verifikasi).';
    if (source === 'onchain') {
      return `Target = tabel kebenaran LENGKAP sirkuit on-chain: ${esc(displayName(circuit))} (${esc(circuit.canonical || circuit.id)}) — ${keys.length} baris, terverifikasi on-chain.`;
    }
    if (circuit.note && /CONTOH LOKAL/.test(circuit.note)) {
      return `Target dari ${esc(circuit.note)}: ${esc(circuit.name || circuit.id)}`;
    }
    // Primitif NAND on-chain: target level adalah komposisi lokal darinya.
    return `Target = komposisi lokal dari primitif NAND on-chain ${esc(circuit.canonical || '1.268.tape')}. ${esc(level.backingText || level.backing || '')}`;
  })();
  $('#target-source').textContent = src;
  const bk = $('#side-backing');
  if (bk) bk.classList.add('hidden'); // backing sudah tercakup di #target-source — jangan duplikasi
}

/* ---------------- render node + kabel ---------------- */
function nodeById(id) { return state.nodes.find((n) => n.id === id); }
function wireInto(nodeId, pin) {
  return state.wires.find((w) => w.toNode === nodeId && w.toPin === pin);
}
function wireValue(w) {
  const src = nodeById(w.fromNode);
  if (!src) return 0;
  if (src.type === 'input') return src.value;
  if (src.type === 'nand') return src.out || 0;
  if (src.type === 'latch') return w.fromPin === 'Q' ? (src.q || 0) : (1 - (src.q || 0));
  return 0;
}
function inputPinValue(node, pin) {
  const w = wireInto(node.id, pin);
  return w ? wireValue(w) : 0;
}

function renderNodes() {
  const box = $('#nodes');
  box.innerHTML = '';
  state.nodes.forEach((n) => {
    const d = el('div', 'node ' + n.type + '-node');
    d.dataset.id = n.id;
    d.style.left = n.x + 'px';
    d.style.top = n.y + 'px';
    if (n.type === 'input') {
      d.innerHTML = `<div class="n-label">${esc(n.label)}</div><div class="n-val">${n.value}</div><div class="n-sub">saklar · klik untuk ubah</div>`;
      d.appendChild(makePin('out', 'out', 'out'));
    } else if (n.type === 'nand') {
      d.innerHTML = `<div class="n-label">NAND</div><div class="n-val">${n.out == null ? '–' : n.out}</div><div class="n-sub">¬(A ∧ B)</div>`;
      d.appendChild(makePin('in', 'a', 'A'));
      d.appendChild(makePin('in', 'b', 'B'));
      d.appendChild(makePin('out', 'out', 'Y'));
    } else if (n.type === 'latch') {
      d.innerHTML = `<div class="n-label">LATCH</div><div class="n-val">Q=${n.q == null ? '–' : n.q}</div><div class="n-sub">memori 1 bit · 4 transistor</div>`;
      d.appendChild(makePin('in', 'S', 'S'));
      d.appendChild(makePin('in', 'R', 'R'));
      d.appendChild(makePin('out', 'Q', 'Q'));
      d.appendChild(makePin('out', 'Qn', 'Q̄'));
    } else if (n.type === 'output') {
      d.innerHTML = `<div class="n-label">${esc(n.label)}</div><div class="lamp"></div><div class="n-sub">lampu output</div>`;
      d.appendChild(makePin('in', 'in', 'in'));
    }
    // Pin kiri (input) posisinya diatur vertikal lewat CSS inline di makePin.
    box.appendChild(d);
  });
  positionPins();
  attachNodeEvents();
  renderWires();
}

function makePin(kind, pin, label) {
  const p = el('div', 'pin ' + kind);
  p.dataset.pin = pin;
  p.dataset.kind = kind;
  p.title = (kind === 'out' ? 'Output ' : 'Input ') + label + ' — klik untuk mengabel';
  const lab = el('span', 'pin-label', esc(label));
  // Label pin ditaruh di luar node.
  if (kind === 'in') { lab.style.left = '-24px'; } else { lab.style.right = '-24px'; }
  p.appendChild(lab);
  return p;
}

/* Atur posisi vertikal pin-pin di dalam node (input di kiri, output di kanan). */
function positionPins() {
  document.querySelectorAll('#nodes .node').forEach((nodeEl) => {
    const ins = nodeEl.querySelectorAll('.pin.in');
    const outs = nodeEl.querySelectorAll('.pin.out');
    const h = nodeEl.offsetHeight || 80;
    ins.forEach((p, i) => { p.style.top = (h * (i + 1) / (ins.length + 1) - 8) + 'px'; });
    outs.forEach((p, i) => { p.style.top = (h * (i + 1) / (outs.length + 1) - 8) + 'px'; });
  });
}

function pinCenter(nodeId, pin) {
  const nodeEl = document.querySelector(`#nodes .node[data-id="${nodeId}"]`);
  const cv = $('#canvas').getBoundingClientRect();
  if (!nodeEl) return null;
  const pinEl = nodeEl.querySelector(`.pin[data-pin="${pin}"]`);
  if (!pinEl) return null;
  const r = pinEl.getBoundingClientRect();
  return { x: r.left - cv.left + r.width / 2, y: r.top - cv.top + r.height / 2 };
}

function wirePath(a, b) {
  const mx = (a.x + b.x) / 2;
  return `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
}

function renderWires() {
  const svg = $('#wires');
  svg.innerHTML = '';
  state.wires.forEach((w) => {
    const a = pinCenter(w.fromNode, w.fromPin);
    const b = pinCenter(w.toNode, w.toPin);
    if (!a || !b) return;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', wirePath(a, b));
    path.setAttribute('class', 'wire' + (wireValue(w) ? ' on' : ''));
    path.dataset.wireId = w.id;
    path.addEventListener('click', (ev) => {
      ev.stopPropagation();
      deleteWire(w.id);
      sfxClick();
    });
    path.addEventListener('pointerenter', () => { path.style.strokeWidth = '6'; });
    path.addEventListener('pointerleave', () => { path.style.strokeWidth = '3'; });
    svg.appendChild(path);
  });
  // Kabel yang sedang ditarik (pending) digambar ke posisi kursor.
  if (state.pendingWire && state.pendingPos) {
    const a = pinCenter(state.pendingWire.fromNode, state.pendingWire.fromPin);
    if (a) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', wirePath(a, state.pendingPos));
      path.setAttribute('class', 'wire pending');
      svg.appendChild(path);
    }
  }
}

function deleteWire(id) {
  state.wires = state.wires.filter((w) => w.id !== id);
  evaluateAndRender();
  showHint('Kabel dihapus.');
}

/* ---------------- interaksi node ---------------- */
function attachNodeEvents() {
  document.querySelectorAll('#nodes .node').forEach((nodeEl) => {
    const id = Number(nodeEl.dataset.id);
    const node = nodeById(id);
    nodeEl.addEventListener('pointerdown', (ev) => {
      if (ev.target.classList.contains('pin')) return; // pin ditangani sendiri
      ev.preventDefault();
      const startX = ev.clientX, startY = ev.clientY;
      const origX = node.x, origY = node.y;
      let moved = false;
      const move = (e2) => {
        const dx = e2.clientX - startX, dy = e2.clientY - startY;
        if (Math.abs(dx) + Math.abs(dy) > 5) moved = true;
        const maxX = ($('#canvas').offsetWidth || 900) - 130;
        const maxY = ($('#workspace').clientHeight || 520) - 90;
        node.x = Math.max(0, Math.min(maxX, origX + dx));
        node.y = Math.max(0, Math.min(maxY, origY + dy));
        nodeEl.style.left = node.x + 'px';
        nodeEl.style.top = node.y + 'px';
        renderWires();
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (!moved) {
          if (state.deleteMode && (node.type === 'nand' || node.type === 'latch')) {
            deleteGate(node.id);
          } else if (node.type === 'input') {
            node.value = 1 - node.value;
            sfxClick();
            evaluateAndRender();
          }
        }
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  });

  document.querySelectorAll('#nodes .pin').forEach((pinEl) => {
    pinEl.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      const nodeEl = pinEl.closest('.node');
      const nodeId = Number(nodeEl.dataset.id);
      const pin = pinEl.dataset.pin;
      const kind = pinEl.dataset.kind;
      if (kind === 'out') {
        state.pendingWire = { fromNode: nodeId, fromPin: pin };
        sfxClick();
        showHint('Kabel dimulai — sekarang klik pin input tujuan (klik di tempat kosong untuk batal).');
      } else {
        if (state.pendingWire) {
          connectWire(state.pendingWire.fromNode, state.pendingWire.fromPin, nodeId, pin);
        } else {
          // Klik pin input yang sudah terisi = hapus kabelnya.
          const w = wireInto(nodeId, pin);
          if (w) { deleteWire(w.id); }
        }
      }
      renderNodes();
    });
  });
}

function connectWire(fromNode, fromPin, toNode, toPin) {
  if (fromNode === toNode) { showMsg('Tidak bisa mengabel node ke dirinya sendiri.'); state.pendingWire = null; return; }
  const existing = wireInto(toNode, toPin);
  if (existing) state.wires = state.wires.filter((w) => w.id !== existing.id);
  state.wires.push({ id: state.nextId++, fromNode, fromPin, toNode, toPin });
  state.pendingWire = null;
  sfxWire();
  evaluateAndRender();
  showHint('Kabel tersambung. Klik kabel untuk menghapusnya.');
}

function deleteGate(id) {
  state.nodes = state.nodes.filter((n) => n.id !== id);
  state.wires = state.wires.filter((w) => w.fromNode !== id && w.toNode !== id);
  sfxClick();
  evaluateAndRender();
  showHint('Gerbang dihapus.');
}

/* ---------------- evaluasi sinyal ----------------
   Propagasi iteratif sampai stabil (maks 100 iterasi). Umpan-balik antar NAND
   tanpa LATCH tidak akan stabil -> ditolak dengan pesan jelas. LATCH menyimpan
   state dan hanya berubah saat tick. */
function evaluate(tick) {
  const level = state.level;
  let stable = true;
  // Inisialisasi output NAND yang belum pernah dievaluasi.
  state.nodes.forEach((n) => { if (n.type === 'nand' && n.out == null) n.out = 0; });
  for (let iter = 0; iter < 100; iter++) {
    let changed = false;
    state.nodes.forEach((n) => {
      if (n.type !== 'nand') return;
      const a = inputPinValue(n, 'a');
      const b = inputPinValue(n, 'b');
      const out = (a && b) ? 0 : 1;
      if (out !== n.out) { n.out = out; changed = true; }
    });
    if (!changed) break;
    if (iter === 99) stable = false;
  }
  if (tick) {
    let latchChanged = false;
    state.nodes.forEach((n) => {
      if (n.type !== 'latch') return;
      const s = inputPinValue(n, 'S');
      const r = inputPinValue(n, 'R');
      const qNext = s ? 1 : (r ? 0 : (n.q || 0));
      if (qNext !== (n.q || 0)) { n.q = qNext; latchChanged = true; }
    });
    if (latchChanged) {
      // Setelah tick, propagasi ulang sekali.
      for (let iter = 0; iter < 100; iter++) {
        let changed = false;
        state.nodes.forEach((n) => {
          if (n.type !== 'nand') return;
          const out = (inputPinValue(n, 'a') && inputPinValue(n, 'b')) ? 0 : 1;
          if (out !== n.out) { n.out = out; changed = true; }
        });
        if (!changed) break;
        if (iter === 99) stable = false;
      }
    }
  }
  const outputs = {};
  state.nodes.forEach((n) => {
    if (n.type === 'output') outputs[n.pinId] = inputPinValue(n, 'in');
  });
  const warnings = [];
  state.nodes.forEach((n) => {
    if (n.type === 'nand') {
      if (!wireInto(n.id, 'a')) warnings.push(`NAND (input A) belum tersambung — dianggap 0.`);
      if (!wireInto(n.id, 'b')) warnings.push(`NAND (input B) belum tersambung — dianggap 0.`);
    }
    if (n.type === 'output' && !wireInto(n.id, 'in')) warnings.push(`Lampu ${n.label} belum tersambung.`);
    if (n.type === 'latch') {
      if (!wireInto(n.id, 'S')) warnings.push('LATCH (S) belum tersambung — dianggap 0.');
      if (!wireInto(n.id, 'R')) warnings.push('LATCH (R) belum tersambung — dianggap 0.');
    }
  });
  state.lastEval = { stable, outputs, warnings };
  return state.lastEval;
}

function evaluateAndRender() {
  const res = evaluate(false);
  // Perbarui tampilan node: nilai NAND, Q latch, lampu, pin menyala.
  state.nodes.forEach((n) => {
    const nodeEl = document.querySelector(`#nodes .node[data-id="${n.id}"]`);
    if (!nodeEl) return;
    if (n.type === 'nand') {
      const v = nodeEl.querySelector('.n-val');
      if (v) v.textContent = n.out == null ? '–' : n.out;
    }
    if (n.type === 'latch') {
      const v = nodeEl.querySelector('.n-val');
      if (v) v.textContent = 'Q=' + (n.q == null ? '–' : n.q);
    }
    if (n.type === 'output') {
      const lamp = nodeEl.querySelector('.lamp');
      if (lamp) lamp.classList.toggle('on', !!res.outputs[n.pinId]);
    }
    // Pin output menyala kalau sinyalnya 1.
    nodeEl.querySelectorAll('.pin.out').forEach((p) => {
      const val = wireValue({ fromNode: n.id, fromPin: p.dataset.pin });
      p.classList.toggle('on', !!val);
    });
  });
  document.querySelectorAll('#nodes .pin').forEach((p) => {
    if (state.pendingWire) {
      const nodeEl = p.closest('.node');
      const isSrc = Number(nodeEl.dataset.id) === state.pendingWire.fromNode && p.dataset.pin === state.pendingWire.fromPin;
      p.classList.toggle('armed', isSrc);
    } else p.classList.remove('armed');
  });
  renderWires();
  updateStarsHeader();
  if (!res.stable) showMsg('Loop terdeteksi: sinyal tidak stabil (umpan-balik antar NAND tanpa LATCH). Pakai komponen LATCH untuk memori.');
  else if (res.warnings.length) showMsg(res.warnings[0]);
  else hideMsg();
}

/* ---------------- uji semua kombinasi ---------------- */
function readOutputs() {
  const out = {};
  state.level.outputs.forEach((o) => {
    const node = state.nodes.find((n) => n.type === 'output' && n.pinId === o.id);
    out[o.id] = node ? inputPinValue(node, 'in') : 0;
  });
  return state.level.outputs.map((o) => out[o.id]).join('');
}
function setInputs(bits) {
  state.level.inputs.forEach((inp, i) => {
    const node = state.nodes.find((n) => n.type === 'input' && n.pinId === inp.id);
    if (node) node.value = bits[i];
  });
}
function setLatchStates(q) {
  state.nodes.forEach((n) => { if (n.type === 'latch') n.q = q; });
}

function testAll() {
  const level = state.level;
  const { table } = targetFor(level);
  const rows = [];
  let pass = true;
  if (level.sequential) {
    for (const q0 of [0, 1]) {
      for (let i = 0; i < (1 << level.inputs.length); i++) {
        const bits = i.toString(2).padStart(level.inputs.length, '0');
        const inp = bits.split('').map(Number);
        setLatchStates(q0);
        setInputs(inp);
        evaluate(false);
        evaluate(true); // TICK: latch mengunci nilai baru
        const got = readOutputs();
        const exp = table[q0 + bits];
        const ok = got === exp;
        if (!ok) pass = false;
        rows.push({ inp: q0 + bits, exp, got, ok });
      }
    }
  } else {
    for (let i = 0; i < (1 << level.inputs.length); i++) {
      const bits = i.toString(2).padStart(level.inputs.length, '0');
      const inp = bits.split('').map(Number);
      setInputs(inp);
      const ev = evaluate(false);
      const got = ev.stable ? readOutputs() : '??';
      const exp = table[bits];
      const ok = got === exp;
      if (!ok) pass = false;
      rows.push({ inp: bits, exp, got, ok });
    }
  }
  evaluateAndRender();
  return { pass, rows, gates: gatesUsed() };
}

function renderTestResults(result) {
  const box = $('#test-results');
  const level = state.level;
  const fails = result.rows.filter((r) => !r.ok);
  const inLabels = level.sequential ? ['Q₀'].concat(level.inputs.map((i) => i.label)) : level.inputs.map((i) => i.label);
  let html = `<h4 class="${result.pass ? 'pass' : 'fail'}">${result.pass
    ? '✓ SEMUA ' + result.rows.length + ' KOMBINASI COCOK — LEVEL SELESAI!'
    : '✗ ' + fails.length + ' dari ' + result.rows.length + ' kombinasi TIDAK cocok'}</h4>`;
  const shown = result.pass
    ? result.rows.slice(0, 16)
    : fails.concat(result.rows.filter((r) => r.ok).slice(0, 8));
  html += '<div class="scroll"><table><tr><th>' + inLabels.join('</th><th>') + '</th><th>Target</th><th>Kamu</th><th></th></tr>';
  shown.forEach((r) => {
    html += `<tr><td>${r.inp.split('').join('</td><td>')}</td><td>${r.exp.split('').join('</td><td>')}</td><td>${String(r.got).split('').join('</td><td>')}</td><td class="${r.ok ? 'ok' : 'bad'}">${r.ok ? '✓' : '✗'}</td></tr>`;
  });
  html += '</table></div>';
  if (result.rows.length > shown.length) html += `<p class="muted small">Menampilkan ${shown.length} dari ${result.rows.length} baris.</p>`;
  if (!result.pass) html += '<p class="muted">Periksa baris ✗: input itu menghasilkan output yang salah. Telusuri kabel dari lampu yang salah kembali ke gerbangnya.</p>';
  box.innerHTML = html;
  box.classList.remove('hidden');
}

function completeLevel(result) {
  const level = state.level;
  if (isChallenge(level)) {
    // Tantangan onchain: tidak ada bintang/koin — hadiahnya bukti verifikasi.
    $('#win-stars').innerHTML = '✓';
    $('#win-text').innerHTML = `Kamu membangun ulang <b>${esc(displayName(circuitByCanonical(level.challengeOf)))}</b> dengan <b>${result.gates} gerbang</b> (par ${level.par}) — cocok di semua ${result.rows.length} baris truth table ASLI on-chain. Cek badge live-nya di mode SIRKUIT ONCHAIN.`;
    $('#btn-next-level').style.display = 'none';
    $('#win-modal').classList.remove('hidden');
    sfxWin();
    return;
  }
  const par = level.par;
  const stars = result.gates <= par ? 3 : (result.gates <= Math.ceil(par * 1.5) ? 2 : 1);
  const prev = state.progress.stars[level.id] || 0;
  state.progress.stars[level.id] = Math.max(prev, stars);
  state.progress.coins += stars * 10;
  saveProgress();
  refreshTitle();
  updateStarsHeader();
  $('#win-stars').innerHTML = '★'.repeat(stars) + '<span class="off">' + '☆'.repeat(3 - stars) + '</span>';
  $('#win-text').innerHTML = `<b>${esc(level.name)}</b> selesai dengan <b>${result.gates} gerbang</b> (par ${par}).<br>+${stars * 10} koin. Total koin: ${state.progress.coins}.`;
  $('#btn-next-level').style.display = level.id < 10 ? '' : 'none';
  $('#win-modal').classList.remove('hidden');
  sfxWin();
}

/* ---------------- panel bukti + verifikasi live ---------------- */
function updateProofPanel() {
  const level = state.level;
  const { entry, source, relation } = circuitForLevel(level);
  const proc = $('#proof-processor');
  const circ = $('#proof-circuit');
  const hash = $('#proof-hash');
  const block = $('#proof-block');
  if (entry && source === 'onchain' && state.circuits) {
    const p = (state.circuits.processors || []).find((x) => x.address === (entry.processorAddress || ''))
      || state.circuits.processor || {};
    const addr = p.address || entry.processorAddress || '';
    proc.innerHTML = addr
      ? `<a href="${EXPLORER}/address/${esc(addr)}" target="_blank" rel="noopener">${esc(addr)}</a>`
      : '—';
    const rel = relation === 'primitive'
      ? ' · PRIMITIF (target level = komposisi lokal)'
      : ' · TARGET PERSIS (truth table on-chain)';
    circ.textContent = (entry.canonical || entry.name || entry.id || '—') + rel;
    hash.textContent = shortHash(entry.netlistHash || entry.hash || '');
    block.textContent = entry.verifiedBlock ? '#' + entry.verifiedBlock + (entry.verifiedAt ? ' · ' + fmtDate(entry.verifiedAt) : '') : '—';
  } else if (entry && source === 'lokal') {
    proc.textContent = '— (menunggu data verifikasi)';
    circ.textContent = (entry.name || entry.id) + ' · ' + (entry.note || 'CONTOH LOKAL');
    hash.textContent = '— (contoh lokal, tanpa hash on-chain)';
    block.textContent = '—';
  } else {
    proc.textContent = '— (menunggu data verifikasi)';
    circ.textContent = 'sirkuit onchain — menunggu data verifikasi';
    hash.textContent = '—';
    block.textContent = '—';
  }
}

function setProofStatus(text, cls) {
  const s = $('#proof-status');
  s.textContent = text;
  s.className = 'proof-status' + (cls ? ' ' + cls : '');
}

/* Panggilan JSON-RPC dengan failover antar RPC + timeout. */
async function rpcCall(method, params) {
  let lastErr = null;
  for (const rpc of RPCS) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), RPC_TIMEOUT_MS);
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      if (j.error) throw new Error(j.error.message || 'RPC error');
      return { result: j.result, rpc };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('semua RPC gagal');
}

async function verifyProofLive() {
  const level = state.level;
  if (!level) return;
  const { entry, source, relation } = circuitForLevel(level);
  if (!entry || source !== 'onchain' || !state.circuits) {
    setProofStatus(
      entry && source === 'lokal'
        ? 'MODE CONTOH LOKAL — sirkuit ini contoh kecil di dalam game, BUKAN sirkuit on-chain. Data sirkuit asli (data/circuits.json) belum dimuat.'
        : 'OFFLINE — snapshot sirkuit on-chain belum tersedia (data/circuits.json belum dimuat). Game tetap jalan dari snapshot.',
      'local');
    return;
  }
  setProofStatus('Menghubungi RPC X Layer…', '');
  try {
    const blockRes = await rpcCall('eth_blockNumber', []);
    const blockNum = parseInt(blockRes.result, 16);
    const addr = entry.processorAddress || (state.circuits.processor || {}).address || '';
    if (entry.calldata && addr) {
      const callRes = await rpcCall('eth_call', [{ to: addr, data: entry.calldata }, 'latest']);
      const raw = String(callRes.result || '');
      const expected = expectedOutputOf(entry);
      const got = decodeEvalResult(raw);
      const match = expected == null || got == null ? null : got === expected;
      if (match === false) {
        setProofStatus(`HASIL LIVE BERBEDA @ blok #${blockNum} — eth_call mengembalikan output ${got}, tidak cocok dengan snapshot (diharapkan ${expected}). On-chain adalah sumber kebenaran; periksa data/circuits.json.`, 'offline');
      } else {
        setProofStatus(`TERVERIFIKASI LIVE @ blok #${blockNum} — eth_call ke processor mengembalikan output ${got}${match ? ' (cocok dengan snapshot)' : ''} via ${callRes.rpc.replace('https://', '')}.`, 'live');
      }
    } else if (addr) {
      const codeRes = await rpcCall('eth_getCode', [addr, 'latest']);
      if (codeRes.result && codeRes.result !== '0x') {
        setProofStatus(`TERVERIFIKASI LIVE @ blok #${blockNum} — kontrak processor ditemukan di X Layer (${codeRes.result.length - 2} byte kode, via ${codeRes.rpc.replace('https://', '')}). Sirkuit dievaluasi dari snapshot terverifikasi.`, 'live');
      } else {
        setProofStatus(`PERINGATAN @ blok #${blockNum} — alamat processor tidak punya kode di chain. Data snapshot mungkin salah; game tetap jalan dari snapshot.`, 'offline');
      }
    } else {
      setProofStatus(`RPC HIDUP @ blok #${blockNum}, tapi data sirkuit tidak membawa alamat processor/calldata — verifikasi penuh belum bisa.`, 'offline');
    }
  } catch (e) {
    const snapBlock = entry.verifiedBlock || '—';
    const snapDate = entry.verifiedAt ? fmtDate(entry.verifiedAt) : 'tanggal tidak tercatat';
    setProofStatus(`OFFLINE — RPC X Layer tidak terjangkau (${e.message || 'timeout'}). Menampilkan snapshot terakhir (blok #${snapBlock}, ${snapDate}). Game tetap jalan.`, 'offline');
  }
}

/* ---------------- pesan / hint ---------------- */
let msgTimer = null;
function showMsg(text) {
  const m = $('#workspace-msg');
  m.textContent = text;
  m.classList.remove('hidden');
  clearTimeout(msgTimer);
  msgTimer = setTimeout(hideMsg, 6000);
}
function hideMsg() { $('#workspace-msg').classList.add('hidden'); }
function showHint(text) { $('#palette-hint').textContent = text; }

/* ---------------- tambah gerbang ---------------- */
function addGate(type) {
  const ws = $('#workspace');
  const W = Math.max(ws.clientWidth || 900, 640);
  const cx = Math.round(W / 2 - 60);
  const cy = 200 + Math.floor(Math.random() * 60);
  if (type === 'nand') {
    state.nodes.push({ id: state.nextId++, type: 'nand', x: cx, y: cy, out: 0 });
  } else if (type === 'latch') {
    state.nodes.push({ id: state.nextId++, type: 'latch', x: cx, y: cy, q: 0 });
  }
  sfxClick();
  renderNodes();
  evaluateAndRender();
  showHint(type === 'nand' ? 'NAND ditambahkan. Sambung kedua inputnya, lalu outputnya ke lampu.' : 'LATCH ditambahkan. Sambung S dan R, lalu Q ke lampu. Tekan TICK untuk mengunci.');
}

/* ---------------- wiring events global ---------------- */
function initWorkspaceEvents() {
  const ws = $('#workspace');
  const cv = $('#canvas');
  ws.addEventListener('pointermove', (ev) => {
    if (!state.pendingWire) return;
    const r = cv.getBoundingClientRect();
    state.pendingPos = { x: ev.clientX - r.left, y: ev.clientY - r.top };
    renderWires();
  });
  ws.addEventListener('pointerdown', (ev) => {
    // Klik di ruang kosong membatalkan kabel yang sedang ditarik.
    if (state.pendingWire && (ev.target === ws || ev.target === cv)) {
      state.pendingWire = null;
      state.pendingPos = null;
      renderNodes();
      showHint('Kabel dibatalkan.');
    }
  });
  window.addEventListener('resize', () => { if (state.level) { positionPins(); renderWires(); } });
}

/* ---------------- tombol-tombol ---------------- */
function initButtons() {
  $('#btn-main').addEventListener('click', () => { sfxClick(); renderLevelGrid(); showScreen('screen-levels'); });
  $('#btn-howto').addEventListener('click', () => { sfxClick(); showScreen('screen-howto'); });
  $('#btn-levels').addEventListener('click', () => { sfxClick(); renderLevelGrid(); showScreen('screen-levels'); });
  $('#btn-onchain').addEventListener('click', () => { sfxClick(); renderOnchainList(); showScreen('screen-onchain'); });
  $('#btn-about').addEventListener('click', () => { sfxClick(); showScreen('screen-about'); });
  document.querySelectorAll('[data-back="title"]').forEach((b) =>
    b.addEventListener('click', () => { sfxClick(); refreshTitle(); showScreen('screen-title'); }));
  $('#btn-exit-level').addEventListener('click', () => { sfxClick(); refreshTitle(); renderLevelGrid(); showScreen('screen-levels'); });

  $('#btn-sound').addEventListener('click', () => {
    state.muted = !state.muted;
    state.progress.muted = state.muted;
    saveProgress();
    $('#btn-sound').textContent = state.muted ? 'SUARA: OFF' : 'SUARA: ON';
    if (!state.muted) sfxClick();
  });
  $('#btn-add-nand').addEventListener('click', () => addGate('nand'));
  $('#btn-add-latch').addEventListener('click', () => addGate('latch'));
  $('#btn-del-gate').addEventListener('click', () => {
    state.deleteMode = !state.deleteMode;
    $('#btn-del-gate').classList.toggle('armed', state.deleteMode);
    $('#btn-del-gate').textContent = state.deleteMode ? 'KLIK GERBANG UNTUK HAPUS (batal)' : 'HAPUS GERBANG';
    showHint(state.deleteMode ? 'Mode hapus: klik gerbang NAND/LATCH untuk membuangnya.' : 'Klik pin output lalu pin input untuk mengabel.');
  });
  $('#btn-tick').addEventListener('click', () => {
    const res = evaluate(true);
    sfxClick();
    evaluateAndRender();
    showHint(res.stable ? 'TICK — LATCH mengunci nilai baru dari S/R.' : 'Loop terdeteksi setelah TICK.');
  });
  $('#btn-test').addEventListener('click', () => {
    sfxClick();
    const result = testAll();
    renderTestResults(result);
    if (result.pass) completeLevel(result);
    else sfxFail();
  });
  $('#btn-reset-level').addEventListener('click', () => { sfxClick(); loadLevel(state.level.id); });
  $('#btn-clear-wires').addEventListener('click', () => {
    state.wires = [];
    sfxClick();
    evaluateAndRender();
    showHint('Semua kabel dihapus. Gerbang tetap di tempatnya.');
  });
  $('#btn-refresh-proof').addEventListener('click', () => { sfxClick(); verifyProofLive(); });
  $('#btn-next-level').addEventListener('click', () => {
    $('#win-modal').classList.add('hidden');
    loadLevel(Math.min(10, state.level.id + 1));
  });
  $('#btn-replay-level').addEventListener('click', () => {
    $('#win-modal').classList.add('hidden');
    loadLevel(state.level.id);
  });
  $('#btn-win-menu').addEventListener('click', () => {
    $('#win-modal').classList.add('hidden');
    refreshTitle();
    renderLevelGrid();
    showScreen('screen-levels');
  });
}

/* ---------------- mode SIRKUIT ONCHAIN ----------------
   6 sirkuit asli dari circuits.json: netlist + simulasi lokal vs eval LIVE.
   - Sirkuit kecil (NAND + 2-dari-3): semua baris truth table ditampilkan.
   - Threshold 16-input: 5 vektor uji terverifikasi + slider nilai + kuis tebak output.
   - Live eval = eth_call ke processor (failover 3 RPC, timeout 8 dtk). */
function onchainCircuits() {
  return state.circuitsLoaded ? (state.circuits.circuits || []) : [];
}
function processorOf(circuit) {
  const procs = (state.circuits && state.circuits.processors) || [];
  return procs.find((p) => p.address === circuit.processorAddress)
    || (state.circuits && state.circuits.processor) || {};
}
/* Nilai contoh dari calldata di file (untuk verifikasi live otomatis saat detail dibuka). */
function exampleValueOf(entry) {
  if (!entry.calldata) return null;
  try {
    const h = String(entry.calldata).replace(/^0x/, '');
    const len = parseInt(h.slice(136, 200), 16);
    const dataHex = h.slice(200, 200 + len * 2);
    let v = 0;
    for (let j = 0; j < len; j++) v |= parseInt(dataHex.slice(j * 2, j * 2 + 2), 16) << (8 * j);
    return v;
  } catch (e) { return null; }
}
function ocLiveKey(canonical, value) { return canonical + ':' + value; }

function renderOnchainList() {
  const list = $('#onchain-list');
  const detail = $('#onchain-detail');
  detail.classList.add('hidden');
  detail.innerHTML = '';
  state.oc.circuit = null;
  if (!state.circuitsLoaded) {
    list.innerHTML = `<div class="side-box"><p><b>Data sirkuit on-chain belum dimuat.</b></p>
      <p class="muted">Mode ini butuh <code>data/circuits.json</code> (snapshot terverifikasi 21 Nov 2026).
      File itu tidak ditemukan — game tetap jalan dalam mode contoh lokal. Kalau kamu membuka game dari folder yang benar, file itu ada.</p></div>`;
    return;
  }
  const circuits = onchainCircuits();
  list.innerHTML = '';
  circuits.forEach((c) => {
    const p = processorOf(c);
    const card = el('button', 'oc-card');
    const vec = isThreshold(c)
      ? '16 input · 5 vektor uji terverifikasi (spot-check)'
      : 'truth table lengkap ' + Object.keys(c.truthTable || {}).length + ' baris';
    card.innerHTML = `<div class="oc-canonical">${esc(c.canonical || c.id)}</div>
      <div class="oc-name">${esc(displayName(c))}</div>
      <div class="oc-meta">${esc(p.name || 'Processor')} · ${(c.netlist || []).length} gerbang NAND · ${vec}</div>
      <div class="oc-cta">LIHAT SIRKUIT →</div>`;
    card.addEventListener('click', () => { sfxClick(); openCircuitDetail(c.canonical); });
    list.appendChild(card);
  });
}

function openCircuitDetail(canonical) {
  const c = circuitByCanonical(canonical);
  if (!c) return;
  state.oc.circuit = c;
  state.oc.quiz = { total: 0, correct: 0, value: null, answered: false };
  renderCircuitDetail();
  $('#onchain-detail').classList.remove('hidden');
  $('#onchain-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  // Verifikasi live otomatis untuk 1 vektor contoh dari file.
  const ex = exampleValueOf(c);
  if (ex != null) runLiveForValues(c, [ex]);
}

function renderCircuitDetail() {
  const c = state.oc.circuit;
  if (!c) return;
  const p = processorOf(c);
  const n = c.inputs + 2;
  const gates = c.netlist || [];
  const netlistHtml = gates.map((g, i) =>
    `<div class="oc-gate"><span class="oc-gnum">G${i + 1}</span> NAND(w${g[0]}, w${g[1]}) <span class="oc-arrow">→</span> w${n + i}${i === gates.length - 1 ? ' <span class="oc-out">← OUTPUT</span>' : ''}</div>`).join('');
  const rows = detailVectors(c);
  const rowsHtml = rows.map((r) => {
    const local = simulateNetlist(c, r.value);
    const key = ocLiveKey(c.canonical, r.value);
    const live = state.oc.live[key];
    const liveCell = live
      ? (live.error ? `<span class="badge badge-err">GAGAL</span>` : esc(String(live.out)))
      : '<span class="muted">—</span>';
    const badge = live
      ? (live.error ? '<span class="badge badge-err">RPC GAGAL</span>'
        : (live.out === r.expected ? '<span class="badge badge-ok">COCOK</span>' : '<span class="badge badge-bad">TIDAK COCOK</span>'))
      : '<span class="badge badge-wait">BELUM DICEK</span>';
    return `<tr id="oc-row-${r.value}"><td>${esc(r.label)}</td><td>${r.expected}</td><td>${local}</td><td class="oc-live-cell">${liveCell}</td><td class="oc-badge-cell">${badge}</td></tr>`;
  }).join('');
  const isSmall = !isThreshold(c);
  const buildBtn = isSmall
    ? `<button class="btn btn-primary" id="oc-build">BANGUN SIRKUIT INI 🔧</button>
       <p class="muted small">Rangkai gerbang NAND di papan puzzle dan buktikan kamu bisa membangun ulang sirkuit on-chain ini — dicek ekshaustif terhadap truth table asli.</p>`
    : '';
  const thresholdUI = isThreshold(c) ? `
    <h4>COBA NILAI SENDIRI — 16 BIT</h4>
    <div class="oc-threshold">
      <label>Nilai mentah (0–65535): <input type="number" id="oc-num" min="0" max="65535" value="2000"> <input type="range" id="oc-slider" min="0" max="65535" value="2000"></label>
      <div class="oc-thr-rows">
        <div class="oc-thr-row"><span>Bit mentah (MSB→LSB)</span><b id="oc-bits" class="mono">—</b></div>
        <div class="oc-thr-row"><span>Nilai field (dari caring wires)</span><b id="oc-field" class="mono">—</b></div>
        <div class="oc-thr-row"><span>Output — simulasi lokal</span><b id="oc-local-out" class="mono">—</b></div>
        <div class="oc-thr-row"><span>Output — eval live on-chain</span><b id="oc-live-out" class="mono">—</b></div>
      </div>
      <div class="oc-thr-btns">
        <button class="btn btn-small" id="oc-random">NILAI ACAK 🎲</button>
        <button class="btn btn-small" id="oc-eval-live">EVAL LIVE NILAI INI</button>
      </div>
    </div>
    <h4>TEBAK OUTPUT — KUIS</h4>
    <div class="oc-quiz">
      <p>Nilai acak dipilih, kamu tebak outputnya 0 atau 1. Jawaban dari <b>eval live on-chain</b> (kalau RPC gagal, dari simulasi lokal — dilabeli).</p>
      <div class="oc-quiz-btns">
        <button class="btn btn-primary" id="oc-quiz-new">NILAI ACAK BARU</button>
        <button class="btn" id="oc-guess-0">TEBAK 0</button>
        <button class="btn" id="oc-guess-1">TEBAK 1</button>
      </div>
      <p id="oc-quiz-status" class="oc-quiz-status">Skor: <b id="oc-score">0 benar / 0 tebak</b></p>
    </div>` : '';
  $('#onchain-detail').innerHTML = `
    <div class="oc-detail">
      <button class="btn btn-small" id="oc-back">← SEMUA SIRKUIT</button>
      <h3>${esc(c.canonical || c.id)} — ${esc(displayName(c))}</h3>
      <div class="oc-facts">
        <div class="proof-row"><span>Processor</span><b><a href="${esc(p.explorer || EXPLORER + '/address/' + (p.address || ''))}" target="_blank" rel="noopener">${esc(p.name || '—')} · ${esc(p.address || '—')}</a></b></div>
        <div class="proof-row"><span>Gerbang NAND</span><b>${gates.length} (netlist ${c.netlistBytes || '?'} byte)</b></div>
        <div class="proof-row"><span>Hash netlist</span><b>${esc(c.netlistHash || '—')}</b></div>
        <div class="proof-row"><span>Terverifikasi</span><b>blok #${c.verifiedBlock || '—'} · ${esc(c.verifiedAt || '—')}</b></div>
        <div class="proof-row"><span>Fungsi</span><b>${esc(c.function || '—')}</b></div>
      </div>
      ${isThreshold(c) ? '<p class="muted small">⚠️ Truth table sirkuit ini TIDAK ekshaustif (2<sup>16</sup> baris tidak mungkin dicantumkan): 5 baris di bawah adalah spot-check yang terverifikasi on-chain. Aturan threshold-nya diverifikasi lewat simulasi ekshaustif atas caring wires + 20 spot-check on-chain, 0 mismatch.</p>' : '<p class="muted small">✓ Truth table lengkap — semua baris dievaluasi on-chain (0 mismatch vs simulator).</p>'}
      <h4>NETLIST — DAFTAR GERBANG (wire 0 = 0, wire 1 = 1)</h4>
      <div class="oc-netlist">${netlistHtml}</div>
      <h4>HASIL: SIMULASI LOKAL vs EVAL LIVE ON-CHAIN</h4>
      <div class="scroll"><table class="oc-table">
        <tr><th>${isThreshold(c) ? 'Nilai field / mentah' : 'Input'}</th><th>Diharapkan</th><th>Simulasi lokal</th><th>Eval live</th><th>Badge</th></tr>
        ${rowsHtml}
      </table></div>
      <div class="oc-actions">
        <button class="btn" id="oc-verify-live">VERIFIKASI LIVE SEMUA BARIS</button>
        <span id="oc-live-summary" class="muted small"></span>
      </div>
      ${buildBtn}
      ${thresholdUI}
    </div>`;
  $('#oc-back').addEventListener('click', () => { sfxClick(); renderOnchainList(); });
  $('#oc-verify-live').addEventListener('click', () => {
    sfxClick();
    runLiveForValues(c, rows.map((r) => r.value));
  });
  if (isSmall) {
    $('#oc-build').addEventListener('click', () => {
      sfxClick();
      if (c.canonical === '1.268.tape') loadLevel('oc-nand');
      else if (c.canonical === '3.268.tape') loadLevel(7);
    });
  }
  if (isThreshold(c)) initThresholdUI(c);
}

/* Baris vektor untuk tabel detail: sirkuit kecil = semua baris truth table,
   threshold = 5 sample terverifikasi (dengan label nilai field + mentah). */
function detailVectors(c) {
  if (!isThreshold(c)) {
    return Object.keys(c.truthTable || {}).sort().map((k) => ({
      label: k.split('').join(' '), value: valueFromKey(k), expected: parseInt(String(c.truthTable[k]), 10),
    }));
  }
  return (c.samples || []).map((s) => ({
    label: `field ${s.fieldValue} · mentah ${s.inputBits16}`,
    value: valueFromKey(s.inputBits16), expected: parseInt(s.out, 10),
  }));
}

async function runLiveForValues(c, values) {
  // Cegah dua run bersamaan (auto-run saat detail dibuka + klik manual):
  // run kedua diabaikan, tombol nonaktif selama run berjalan.
  if (state.oc.running) return { ok: 0, bad: 0, fail: 0, skipped: true };
  state.oc.running = true;
  const btn = document.getElementById('oc-verify-live');
  if (btn) btn.disabled = true;
  const summary = $('#oc-live-summary');
  let ok = 0, bad = 0, fail = 0;
  try {
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      const key = ocLiveKey(c.canonical, v);
      const row = document.getElementById('oc-row-' + v);
      try {
        const res = await liveEval(c, v);
        state.oc.live[key] = { out: res.out, rpc: res.rpc };
        const exp = detailVectors(c).find((r) => r.value === v);
        const match = exp ? res.out === exp.expected : null;
        if (match === true) ok++; else if (match === false) bad++;
        if (row) {
          row.querySelector('.oc-live-cell').textContent = String(res.out);
          row.querySelector('.oc-badge-cell').innerHTML = match === true
            ? '<span class="badge badge-ok">COCOK</span>'
            : (match === false ? '<span class="badge badge-bad">TIDAK COCOK</span>' : '<span class="badge badge-wait">—</span>');
        }
      } catch (e) {
        state.oc.live[key] = { error: String(e.message || e) };
        fail++;
        if (row) {
          row.querySelector('.oc-live-cell').innerHTML = '<span class="badge badge-err">GAGAL</span>';
          row.querySelector('.oc-badge-cell').innerHTML = '<span class="badge badge-err">RPC GAGAL</span>';
        }
      }
      if (summary) {
        summary.textContent = fail
          ? `Live: ${ok} cocok, ${bad} tidak cocok, ${fail} gagal (RPC tidak terjangkau — coba lagi) — ${i + 1}/${values.length} baris.`
          : (ok || bad ? `Live: ${ok} cocok, ${bad} tidak cocok — ${i + 1}/${values.length} baris.` : '');
      }
    }
  } finally {
    state.oc.running = false;
    if (btn) btn.disabled = false;
  }
  return { ok, bad, fail };
}

/* ---- UI threshold: slider + nilai + kuis tebak output ---- */
function initThresholdUI(c) {
  const num = $('#oc-num'), slider = $('#oc-slider');
  const update = () => {
    const v = Math.max(0, Math.min(65535, parseInt(num.value, 10) || 0));
    num.value = v; slider.value = v;
    $('#oc-bits').textContent = keyFromValue(v, 16);
    $('#oc-field').textContent = String(fieldValueOf(c, v));
    $('#oc-local-out').textContent = String(simulateNetlist(c, v));
    $('#oc-live-out').textContent = '— (tekan EVAL LIVE NILAI INI)';
  };
  num.addEventListener('input', update);
  slider.addEventListener('input', () => { num.value = slider.value; update(); });
  $('#oc-random').addEventListener('click', () => {
    sfxClick();
    num.value = Math.floor(Math.random() * 65536);
    update();
  });
  $('#oc-eval-live').addEventListener('click', async () => {
    sfxClick();
    const v = parseInt(num.value, 10) || 0;
    $('#oc-live-out').textContent = '…';
    try {
      const res = await liveEval(c, v);
      $('#oc-live-out').textContent = String(res.out) + ' ✓ live via ' + res.rpc.replace('https://', '');
    } catch (e) {
      $('#oc-live-out').textContent = 'RPC gagal — pakai simulasi lokal: ' + simulateNetlist(c, v);
    }
  });
  const newQuiz = () => {
    const v = Math.floor(Math.random() * 65536);
    state.oc.quiz.value = v;
    state.oc.quiz.answered = false;
    $('#oc-quiz-status').innerHTML = `Nilai acak: <b class="mono">${keyFromValue(v, 16)}</b> (mentah ${v} · field ${fieldValueOf(c, v)}). Tebak outputnya: 0 atau 1? &nbsp; Skor: <b>${state.oc.quiz.correct} benar / ${state.oc.quiz.total} tebak</b>`;
  };
  const guess = async (g) => {
    if (state.oc.quiz.value == null || state.oc.quiz.answered) return;
    state.oc.quiz.answered = true;
    sfxClick();
    const v = state.oc.quiz.value;
    let ans, src;
    try {
      const res = await liveEval(c, v);
      ans = res.out; src = 'eval LIVE on-chain';
    } catch (e) {
      ans = simulateNetlist(c, v); src = 'simulasi lokal (RPC gagal)';
    }
    state.oc.quiz.total++;
    const right = g === ans;
    if (right) state.oc.quiz.correct++;
    $('#oc-quiz-status').innerHTML = `${right ? '✓ BENAR!' : '✗ SALAH.'} Nilai ${v} (field ${fieldValueOf(c, v)}) → output <b>${ans}</b> (dari ${src}). Kamu menebak ${g}. &nbsp; Skor: <b>${state.oc.quiz.correct} benar / ${state.oc.quiz.total} tebak</b>`;
    if (right) sfxWin(); else sfxFail();
  };
  $('#oc-quiz-new').addEventListener('click', () => { sfxClick(); newQuiz(); });
  $('#oc-guess-0').addEventListener('click', () => guess(0));
  $('#oc-guess-1').addEventListener('click', () => guess(1));
  update();
  newQuiz();
}

/* ---------------- API untuk pengujian otomatis (dipakai verify.py) ---------------- */
window.__GT = {
  state, LEVELS, CHALLENGES,
  loadLevel, addGate, connectWire, setInputs, evaluate, testAll, gatesUsed,
  circuitForLevel, targetFor, loadCircuits,
  simulateNetlist, liveEval, buildEvalCalldata, circuitByCanonical,
  renderOnchainList, openCircuitDetail, detailVectors, runLiveForValues,
  exampleValueOf, fieldValueOf,
  placeGateAt(type, x, y) {
    const n = type === 'latch'
      ? { id: state.nextId++, type: 'latch', x, y, q: 0 }
      : { id: state.nextId++, type: 'nand', x, y, out: 0 };
    state.nodes.push(n);
    renderNodes();
    evaluateAndRender();
    return n.id;
  },
  renderAll() { renderNodes(); evaluateAndRender(); },
};

/* ---------------- boot ---------------- */
async function boot() {
  $('#btn-sound').textContent = state.muted ? 'SUARA: OFF' : 'SUARA: ON';
  initButtons();
  initWorkspaceEvents();
  await loadCircuits();
  refreshTitle();
  renderLevelGrid();
  showScreen('screen-title');
}
document.addEventListener('DOMContentLoaded', boot);
