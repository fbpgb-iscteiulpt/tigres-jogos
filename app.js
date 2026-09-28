/* ============================================================
   Tigres — Análise de Jogos
   App 100% no browser. Lê data.json; escreve via GitHub API.
   ============================================================ */

/* ---------- CONFIG: preenche depois de criares o repositório ---------- */
const CONFIG = {
  // Ex: "franciscobranco"  (o teu utilizador GitHub)
  githubOwner: "fbpgb-iscteiulpt",
  // Ex: "tigres-jogos"     (nome do repositório)
  githubRepo: "tigres-jogos",
  // Ramo (normalmente "main")
  githubBranch: "main",
  // Caminho do ficheiro de dados dentro do repo
  dataPath: "data.json",
};
/* --------------------------------------------------------------------- */

const state = {
  data: null,
  view: "epoca",
  source: "local", // 'github' | 'local' | 'seed'
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return n;
};
const fmt = (n) => (n === null || n === undefined || n === "" ? "–" : n);
const pct = (n) => (n === null || n === undefined ? "–" : Math.round(n * 100) + "%");

/* ---------- Logos das equipas ---------- */
const LOGO_OVERRIDES = { "Milionários": "mfc" };
function teamSlug(name) {
  if (LOGO_OVERRIDES[name]) return LOGO_OVERRIDES[name];
  return (name || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // tira acentos
    .replace(/[^a-z0-9]/g, "");
}
function initials(name) {
  const parts = (name || "").trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}
// Devolve um elemento com o logo (ou emblema com iniciais se a imagem falhar)
function teamLogo(name, big = false) {
  const wrap = el("span");
  const img = el("img", { class: "team-logo" + (big ? " lg" : ""), src: `logos/${teamSlug(name)}.png`, alt: name });
  img.addEventListener("error", () => {
    const fb = el("span", { class: "team-fallback" + (big ? " lg" : ""), title: name }, initials(name));
    img.replaceWith(fb);
  });
  wrap.append(img);
  return wrap;
}
// Elemento "logo + nome"
function teamTag(name, big = false) {
  return el("span", { class: "team" }, teamLogo(name, big), el("span", {}, name));
}

/* ---------- Cores das equipas (para as barras de estatísticas) ---------- */
const TEAM_COLORS = {
  "Tigres": "#1b2f6b",       // azul do logo
  "Purrianos": "#e0392a",    // vermelho
  "CDUL": "#ffffff",         // branco
  "Briosa": "#ffffff",       // branco
  "Pé Leve": "#ffffff",      // branco
  "Incríveis": "#e8b12b",    // amarelo
  "Madeira": "#c98a0f",      // amarelo torrado
  "Olímpico": "#1a1a1a",     // preto
  "AQA": "#2e336c",          // azul (branco vs Tigres)
  "VDR": "#194a92",          // azul (branco vs Tigres)
  "Milionários": "#c0a040",  // dourado
  "Canarinhos": "#e0b400",   // amarelo
  "Cosmos": "#c0201f",       // vermelho
  "SD76": "#834a86",         // roxo
  "Vips": "#ffffff",         // branco
  "Laranjada": "#e07a1a",    // laranja
  "Madeirinha": "#1f8a44",   // verde
  "Leões": "#1f8a5a",        // verde
};
// Equipas azuis que ficam brancas quando jogam contra os Tigres (para não confundir)
const WHITE_VS_TIGRES = new Set(["AQA", "VDR"]);
function teamColor(name, vsTigres = false) {
  if (vsTigres && WHITE_VS_TIGRES.has(name)) return "#ffffff";
  return TEAM_COLORS[name] || "#9fb2cf";
}
function isWhite(c) { c = c.toLowerCase(); return c === "#fff" || c === "#ffffff"; }
function fillStyle(widthPct, color) {
  const outline = isWhite(color) ? ";box-shadow:inset 0 0 0 1px var(--navy)" : "";
  return `width:${widthPct}%;background:${color}${outline}`;
}

/* ================= PERSISTENCE ================= */
const ghConfigured = () => CONFIG.githubOwner && CONFIG.githubRepo;
const rawUrl = () =>
  `https://raw.githubusercontent.com/${CONFIG.githubOwner}/${CONFIG.githubRepo}/${CONFIG.githubBranch}/${CONFIG.dataPath}?t=${Date.now()}`;
const apiUrl = () =>
  `https://api.github.com/repos/${CONFIG.githubOwner}/${CONFIG.githubRepo}/contents/${CONFIG.dataPath}`;

const getToken = () => localStorage.getItem("tigres_gh_token") || "";
const setToken = (t) => localStorage.setItem("tigres_gh_token", t);

async function loadData() {
  // 1) tenta GitHub (raw público) para ter a versão mais recente partilhada
  if (ghConfigured()) {
    try {
      const r = await fetch(rawUrl(), { cache: "no-store" });
      if (r.ok) {
        const d = await r.json();
        state.source = "github";
        localStorage.setItem("tigres_cache", JSON.stringify(d));
        return d;
      }
    } catch (e) { /* offline / ainda não existe */ }
  }
  // 2) cache local (última versão vista)
  const cached = localStorage.getItem("tigres_cache");
  if (cached) { state.source = "local"; return JSON.parse(cached); }
  // 3) seed que veio no repositório
  const r = await fetch("data.json", { cache: "no-store" });
  state.source = ghConfigured() ? "local" : "seed";
  return await r.json();
}

// Guarda no GitHub (commit). Requer token com permissão Contents:write.
async function saveToGitHub(data, msg) {
  const token = getToken();
  if (!ghConfigured()) throw new Error("GitHub não configurado (edita CONFIG no app.js).");
  if (!token) throw new Error("Sem token. Abre 'Nova Jornada' → Definições e cola o teu token.");
  // obter SHA atual
  let sha;
  const head = await fetch(apiUrl() + "?ref=" + CONFIG.githubBranch, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (head.ok) sha = (await head.json()).sha;
  const body = {
    message: msg || "Atualizar dados Tigres",
    content: b64encode(JSON.stringify(data, null, 2)),
    branch: CONFIG.githubBranch,
    ...(sha ? { sha } : {}),
  };
  const put = await fetch(apiUrl(), {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    body: JSON.stringify(body),
  });
  if (!put.ok) {
    const err = await put.json().catch(() => ({}));
    throw new Error("Falha ao gravar no GitHub: " + (err.message || put.status));
  }
  localStorage.setItem("tigres_cache", JSON.stringify(data));
  return true;
}
function b64encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

// Exportar Excel (.xlsx) — ficheiro SpreadsheetML simples que o Excel abre
function exportExcel() {
  const data = state.data;
  const sheets = [];
  data.jornadas.forEach((j) => {
    const rows = [];
    rows.push(["Ação", "Jogador", "", "Estatística", data.meta.clube, j.adversario]);
    const statKeys = Object.keys(j.matchStats || {});
    const maxLen = Math.max(j.eventos.length, j.players.length, statKeys.length);
    // Cabeçalho jogadores
    const pHead = ["", "", "", "", "", "", "", "Convocado", "Titular", "Minutos", "Remates", "Desarmes", "Defesas", "Golos", "Assist.", "Passe fin.", "Faltas", "Passes err.", "Perdas"];
    rows.push(pHead);
    for (let i = 0; i < maxLen; i++) {
      const ev = j.eventos[i] || {};
      const st = statKeys[i] ? [statKeys[i], j.matchStats[statKeys[i]].tigres, j.matchStats[statKeys[i]].adversario] : ["", "", ""];
      const p = j.players[i];
      const prow = p ? [p.nome, p.titular ? "X" : "", p.minutos, p.remates, p.desarmes, p.defesas, p.golos, p.assistencias, p.passeFinalizacao, p.faltas, p.passesErrados, p.perdasBola] : [];
      rows.push([ev.acao || "", ev.jogador || "", "", st[0], st[1], st[2], "", ...prow]);
    }
    sheets.push({ name: `${j.numero}a Jornada`, rows });
  });
  const xml = buildSpreadsheetML(sheets);
  const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
  const a = el("a", { href: URL.createObjectURL(blob), download: "AnaliseJogos_Tigres.xls" });
  document.body.append(a); a.click(); a.remove();
}
function buildSpreadsheetML(sheets) {
  const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const cell = (v) => {
    if (v === "" || v === null || v === undefined) return "<Cell/>";
    const isNum = typeof v === "number";
    return `<Cell><Data ss:Type="${isNum ? "Number" : "String"}">${esc(v)}</Data></Cell>`;
  };
  const body = sheets.map((s) =>
    `<Worksheet ss:Name="${esc(s.name)}"><Table>` +
    s.rows.map((r) => `<Row>${r.map(cell).join("")}</Row>`).join("") +
    `</Table></Worksheet>`
  ).join("");
  return `<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${body}</Workbook>`;
}

/* ================= AGGREGATIONS ================= */
function resultOf(j) {
  const r = j.matchStats?.Resultado;
  if (!r || r.tigres == null || r.adversario == null) return { gf: null, ga: null, res: "?" };
  const gf = +r.tigres, ga = +r.adversario;
  return { gf, ga, res: gf > ga ? "w" : gf < ga ? "l" : "d" };
}
function seasonAgg(data) {
  const out = {
    jogos: data.jornadas.length, v: 0, e: 0, d: 0, gf: 0, ga: 0,
    players: {}, results: [],
  };
  for (const j of data.jornadas) {
    const { gf, ga, res } = resultOf(j);
    if (res === "w") out.v++; else if (res === "d") out.e++; else if (res === "l") out.d++;
    if (gf != null) { out.gf += gf; out.ga += ga; }
    out.results.push({ numero: j.numero, adversario: j.adversario, gf, ga, res });
    for (const p of j.players) {
      const a = (out.players[p.nome] ||= { nome: p.nome, jogos: 0, titular: 0, minutos: 0, golos: 0, assistencias: 0, remates: 0, desarmes: 0, defesas: 0, passeFinalizacao: 0, faltas: 0, passesErrados: 0, perdasBola: 0 });
      a.jogos++; if (p.titular) a.titular++;
      for (const k of ["minutos", "golos", "assistencias", "remates", "desarmes", "defesas", "passeFinalizacao", "faltas", "passesErrados", "perdasBola"]) a[k] += (+p[k] || 0);
    }
  }
  out.playersArr = Object.values(out.players);
  return out;
}

/* Prémios por jogo ("kings") — médias por jogo com base nas participações */
function computeKings(data) {
  const P = {};
  for (const j of data.jornadas) {
    for (const p of j.players) (P[p.nome] ||= []).push(p);
  }
  const players = Object.entries(P).map(([nome, games]) => ({ nome, games }));
  // metric = stat key; dir 'max'|'min'; filter = quais jogos contam
  function ranking(metric, dir, filter) {
    const rows = players.map((pl) => {
      const gs = pl.games.filter(filter);
      if (!gs.length) return null;
      const total = gs.reduce((s, g) => s + (+g[metric] || 0), 0);
      return { nome: pl.nome, avg: total / gs.length, jogos: gs.length };
    }).filter(Boolean);
    rows.sort((a, b) => dir === "max" ? b.avg - a.avg || a.nome.localeCompare(b.nome) : a.avg - b.avg || a.nome.localeCompare(b.nome));
    return rows.slice(0, 3);
  }
  const jogou = (g) => (+g.minutos || 0) > 0;       // participou
  const min40 = (g) => (+g.minutos || 0) >= 40;     // ≥40 minutos
  return {
    consistency: ranking("passesErrados", "min", min40),
    keyPass: ranking("passeFinalizacao", "max", jogou),
    recovery: ranking("desarmes", "max", jogou),
    shooting: ranking("remates", "max", jogou),
    noX: ranking("perdasBola", "max", jogou),
    blindPasser: ranking("passesErrados", "max", jogou),
  };
}

/* ================= VIEWS ================= */
function render() {
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === state.view));
  const app = $("#app");
  app.innerHTML = "";
  ({ epoca: viewEpoca, jornadas: viewJornadas, jogadores: viewJogadores, nova: viewNova }[state.view])(app);
  const s = state.source;
  $("#syncStatus").className = "status " + (s === "github" ? "ok" : s === "seed" ? "err" : "local");
  $("#syncStatus").title = s === "github" ? "Ligado ao GitHub (dados partilhados)" : s === "seed" ? "Dados iniciais (não partilhado ainda)" : "Cache local";
  $("#footerInfo").textContent = `${state.data.meta.clube} · ${state.data.jornadas.length} jornadas · atualizado ${new Date(state.data.meta.atualizado).toLocaleDateString("pt-PT")}`;
}

function viewEpoca(app) {
  const A = seasonAgg(state.data);
  app.append(el("div", { class: "section-title" }, "Resumo da época"));
  const cards = el("div", { class: "grid cards" });
  cards.append(
    statCard(`${A.v}-${A.e}-${A.d}`, "V–E–D", `${A.jogos} jogos`),
    statCard(`${A.gf}`, "Golos marcados"),
    statCard(`${A.ga}`, "Golos sofridos"),
    statCard(`${A.gf - A.ga > 0 ? "+" : ""}${A.gf - A.ga}`, "Diferença"),
  );
  app.append(cards);

  app.append(el("div", { class: "section-title" }, "Resultados"));
  const rec = el("div", { class: "record" });
  A.results.forEach((r) =>
    rec.append(el("span", { class: "pill " + (r.res === "?" ? "" : r.res) },
      `J${r.numero} vs ${r.adversario}: ${r.gf ?? "?"}-${r.ga ?? "?"}`)));
  app.append(rec);

  // Top scorers / assists / minutes
  app.append(el("div", { class: "section-title" }, "Melhores marcadores"));
  app.append(topTable(A.playersArr, "golos", ["golos", "assistencias", "remates"], ["Golos", "Assist.", "Remates"]));

  app.append(el("div", { class: "section-title" }, "Assistências"));
  app.append(topTable(A.playersArr, "assistencias", ["assistencias", "passeFinalizacao", "golos"], ["Assist.", "Passe fin.", "Golos"]));

  app.append(el("div", { class: "section-title" }, "Mais minutos"));
  app.append(topTable(A.playersArr, "minutos", ["minutos", "jogos", "titular"], ["Minutos", "Jogos", "Titular"]));

  // Prémios da época ("kings")
  const K = computeKings(state.data);
  app.append(el("div", { class: "section-title" }, "Prémios da época"));
  const kings = el("div", { class: "grid kings" });
  kings.append(
    kingCard("👑", "Consistency King", "Menos passes falhados por jogo", K.consistency, "unidade", "(mín. 40 min por jogo)"),
    kingCard("🎯", "Key Pass King", "Mais passes p/ finalização por jogo", K.keyPass, "unidade"),
    kingCard("🛡️", "Recovery King", "Mais desarmes por jogo", K.recovery, "unidade"),
    kingCard("🥅", "Shooting King", "Mais remates por jogo", K.shooting, "unidade"),
    kingCard("🧱", 'No "X" King', "Mais perdas de bola por jogo", K.noX, "unidade"),
    kingCard("🙈", "The Blind Passer", "Mais passes falhados por jogo", K.blindPasser, "unidade"),
  );
  app.append(kings);
}

function kingCard(icon, title, subtitle, top3, unit, note) {
  const card = el("div", { class: "card king" });
  card.append(el("div", { class: "king-title" }, el("span", { class: "king-icon" }, icon), el("span", {}, title)));
  card.append(el("div", { class: "king-sub" }, subtitle + (note ? " " + note : "")));
  if (!top3 || !top3.length) { card.append(el("div", { class: "empty" }, "Sem dados")); return card; }
  const leader = top3[0];
  const lead = el("div", { class: "king-leader", onclick: () => openPlayerModal(leader.nome) },
    el("span", { class: "king-name" }, leader.nome),
    el("span", { class: "king-val" }, `${leader.avg.toFixed(1)} / jogo`));
  card.append(lead);
  const rest = top3.slice(1);
  if (rest.length) {
    const list = el("div", { class: "king-rest" });
    rest.forEach((r, i) => list.append(el("div", { class: "king-rest-row", onclick: () => openPlayerModal(r.nome) },
      el("span", { class: "king-rank" }, (i + 2) + "."),
      el("span", { class: "king-rname" }, r.nome),
      el("span", { class: "king-rval" }, `${r.avg.toFixed(1)}`))));
    card.append(list);
  }
  return card;
}

function statCard(big, lbl, sub) {
  return el("div", { class: "card stat" },
    el("span", { class: "big" }, big),
    el("span", { class: "lbl" }, lbl),
    sub ? el("span", { class: "sub" }, sub) : null);
}

function topTable(players, sortKey, cols, colLabels, limit = 8) {
  const rows = [...players].filter((p) => (p[sortKey] || 0) > 0).sort((a, b) => b[sortKey] - a[sortKey]).slice(0, limit);
  const t = el("table");
  const head = el("tr", {}, el("th", { class: "rank" }, "#"), el("th", {}, "Jogador"));
  colLabels.forEach((c) => head.append(el("th", { class: "num" }, c)));
  t.append(el("thead", {}, head));
  const tb = el("tbody");
  if (!rows.length) tb.append(el("tr", {}, el("td", { colspan: cols.length + 2, class: "empty" }, "Sem dados ainda")));
  rows.forEach((p, i) => {
    const tr = el("tr", {}, el("td", { class: "rank" }, i + 1), el("td", {}, p.nome));
    cols.forEach((c) => tr.append(el("td", { class: "num" }, fmt(p[c]))));
    tr.addEventListener("click", () => openPlayerModal(p.nome));
    t.append(tr);
    tb.append(tr);
  });
  t.append(tb);
  return t;
}

function viewJornadas(app) {
  app.append(el("div", { class: "section-title" }, "Jornadas"));
  const list = el("div", { class: "jlist" });
  [...state.data.jornadas].sort((a, b) => b.numero - a.numero).forEach((j) => {
    const { gf, ga, res } = resultOf(j);
    const row = el("div", { class: "jrow", onclick: () => openJornadaModal(j.numero) },
      el("span", { class: "jnum" }, `Jornada ${j.numero}`),
      el("span", { class: "jteams" }, teamTag(state.data.meta.clube), el("span", { class: "vs" }, "vs"), teamTag(j.adversario)),
      el("span", { class: "jscore" }, `${gf ?? "?"}–${ga ?? "?"}`),
      el("span", { class: "badge " + (res === "?" ? "" : res) }, res === "w" ? "V" : res === "d" ? "E" : res === "l" ? "D" : "?"),
    );
    list.append(row);
  });
  app.append(list);
}

function openJornadaModal(numero) {
  const j = state.data.jornadas.find((x) => x.numero === numero);
  const b = $("#modalBody"); b.innerHTML = "";
  const { gf, ga } = resultOf(j);
  b.append(el("h2", {},
    `Jornada ${j.numero}: `,
    teamTag(state.data.meta.clube, true),
    el("span", {}, ` ${gf ?? "?"}–${ga ?? "?"} `),
    teamTag(j.adversario, true)));
  b.append(el("div", { class: "chips" },
    el("span", { class: "chip" }, `Tática: ${fmt(j.tatica)}`),
    el("span", { class: "chip" }, `Convocados: ${j.players.length}`)));

  // Match stats compare
  b.append(el("div", { class: "section-title" }, "Estatísticas do jogo"));
  b.append(compareBlock(j.matchStats, j.adversario));

  // Player table
  b.append(el("div", { class: "section-title" }, "Jogadores"));
  const cols = [["minutos", "Min"], ["golos", "G"], ["assistencias", "A"], ["remates", "Rem"], ["desarmes", "Des"], ["defesas", "Def"], ["passeFinalizacao", "PF"], ["faltas", "Flt"], ["passesErrados", "PE"], ["perdasBola", "PB"]];
  const t = el("table", { class: "pstat-table" });
  const h = el("tr", {}, el("th", {}, "Jogador"), el("th", {}, "Tit"));
  cols.forEach((c) => h.append(el("th", { class: "num" }, c[1])));
  t.append(el("thead", {}, h));
  [...j.players]
    .sort((a, b) => (b.titular ? 1 : 0) - (a.titular ? 1 : 0) || (b.minutos || 0) - (a.minutos || 0))
    .forEach((p) => {
      const tr = el("tr", {}, el("td", {}, p.nome), el("td", {}, p.titular ? "●" : "○"));
      cols.forEach((c) => tr.append(el("td", { class: "num" }, fmt(p[c[0]]))));
      t.append(tr);
    });
  b.append(tableScroll(t));
  b.append(el("p", { class: "hint" }, "Tit = titular (●) / suplente (○). PF=passe p/ finalização, PE=passes errados, PB=perdas de bola."));

  // Events summary
  const evCount = {};
  j.eventos.forEach((e) => { evCount[e.acao] = (evCount[e.acao] || 0) + 1; });
  b.append(el("div", { class: "section-title" }, `Eventos registados (${j.eventos.length})`));
  const chips = el("div", { class: "chips" });
  Object.entries(evCount).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => chips.append(el("span", { class: "chip" }, `${k}: ${v}`)));
  b.append(chips);
  showModal();
}

function compareBlock(ms, adversario) {
  const wrap = el("div", { class: "cmp" });
  wrap.append(el("div", { class: "cmp-head" },
    teamTag(state.data.meta.clube), teamTag(adversario)));
  const colL = teamColor(state.data.meta.clube);
  const colR = teamColor(adversario, true); // vsTigres = true (é sempre contra os Tigres)
  const order = ["Resultado", "Remates", "Remates à baliza", "Cantos", "Faltas", "Fora de jogo", "Posse de bola"];
  const keys = order.filter((k) => ms && k in ms).concat(Object.keys(ms || {}).filter((k) => !order.includes(k)));
  keys.forEach((k) => {
    const v = ms[k]; let a = v.tigres, c = v.adversario;
    const isPct = k === "Posse de bola";
    const dispA = isPct ? pct(a) : fmt(a), dispC = isPct ? pct(c) : fmt(c);
    const na = +a || 0, nc = +c || 0, tot = na + nc || 1;
    const row = el("div", { class: "cmprow" });
    row.append(el("span", { class: "lbl" }, k));
    const line = el("div", { style: "display:grid;grid-template-columns:52px 1fr 52px;align-items:center;gap:10px" },
      el("span", { class: "v l" }, dispA),
      el("div", { class: "bar" },
        el("div", { class: "fill-l", style: fillStyle((na / tot) * 100, colL) }),
        el("div", { class: "fill-r", style: fillStyle((nc / tot) * 100, colR) })),
      el("span", { class: "v r" }, dispC));
    row.append(line);
    wrap.append(row);
  });
  return wrap;
}

function viewJogadores(app) {
  const A = seasonAgg(state.data);
  app.append(el("div", { class: "section-title" }, "Jogadores — totais da época"));
  const cols = [["jogos", "J"], ["titular", "Tit"], ["minutos", "Min"], ["golos", "G"], ["assistencias", "A"], ["remates", "Rem"], ["desarmes", "Des"], ["defesas", "Def"], ["faltas", "Flt"], ["passesErrados", "PE"], ["perdasBola", "PB"]];
  let sortKey = "golos", desc = true;
  const t = el("table", { class: "pstat-table" });
  const build = () => {
    t.innerHTML = "";
    const h = el("tr", {}, el("th", {}, "Jogador"));
    cols.forEach((c) => {
      const th = el("th", { class: "num sortable" }, c[1] + (sortKey === c[0] ? (desc ? " ▾" : " ▴") : ""));
      th.addEventListener("click", () => { if (sortKey === c[0]) desc = !desc; else { sortKey = c[0]; desc = true; } build(); });
      h.append(th);
    });
    t.append(el("thead", {}, h));
    const tb = el("tbody");
    [...A.playersArr].sort((a, b) => desc ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]).forEach((p) => {
      const tr = el("tr", { onclick: () => openPlayerModal(p.nome) }, el("td", {}, p.nome));
      cols.forEach((c) => tr.append(el("td", { class: "num" }, fmt(p[c[0]]))));
      tb.append(tr);
    });
    t.append(tb);
  };
  build();
  app.append(tableScroll(t));
  app.append(el("p", { class: "hint" }, "Clica num cabeçalho para ordenar · clica num jogador para detalhe. J=jogos, Tit=titular, PE=passes errados, PB=perdas de bola."));
}

function openPlayerModal(nome) {
  const b = $("#modalBody"); b.innerHTML = "";
  const pos = state.data.listas.posicoes?.[nome];
  b.append(el("h2", {}, nome));
  if (pos) b.append(el("div", { class: "chips" }, el("span", { class: "chip" }, pos)));
  const perJ = [];
  state.data.jornadas.forEach((j) => {
    const p = j.players.find((x) => x.nome === nome);
    if (p) perJ.push({ numero: j.numero, adversario: j.adversario, ...p });
  });
  if (!perJ.length) { b.append(el("p", { class: "empty" }, "Sem participações registadas.")); showModal(); return; }
  const cols = [["titular", "Tit"], ["minutos", "Min"], ["golos", "G"], ["assistencias", "A"], ["remates", "Rem"], ["desarmes", "Des"], ["defesas", "Def"], ["passeFinalizacao", "PF"], ["faltas", "Flt"], ["passesErrados", "PE"], ["perdasBola", "PB"]];
  const t = el("table", { class: "pstat-table" });
  const h = el("tr", {}, el("th", {}, "Jornada"));
  cols.forEach((c) => h.append(el("th", { class: "num" }, c[1])));
  t.append(el("thead", {}, h));
  const tot = {};
  perJ.forEach((p) => {
    const tr = el("tr", {}, el("td", {}, `J${p.numero} vs ${p.adversario}`));
    cols.forEach((c) => {
      const v = c[0] === "titular" ? (p.titular ? "●" : "○") : p[c[0]];
      if (c[0] !== "titular") tot[c[0]] = (tot[c[0]] || 0) + (+p[c[0]] || 0);
      tr.append(el("td", { class: "num" }, fmt(v)));
    });
    t.append(tr);
  });
  const trT = el("tr", { style: "font-weight:700" }, el("td", {}, "Total"));
  cols.forEach((c) => trT.append(el("td", { class: "num" }, c[0] === "titular" ? perJ.filter(p => p.titular).length : fmt(tot[c[0]]))));
  t.append(trT);
  b.append(tableScroll(t));
  showModal();
}

/* ================= NOVA JORNADA (form) ================= */
function viewNova(app) {
  const L = state.data.listas;
  const nextNum = Math.max(0, ...state.data.jornadas.map((j) => j.numero)) + 1;
  app.append(el("div", { class: "section-title" }, `Registar Jornada ${nextNum}`));

  if (!ghConfigured()) {
    app.append(el("div", { class: "note", html: "<strong>App ainda não ligada ao GitHub.</strong> Podes preencher e <em>Exportar Excel</em>, mas para partilhar com os teus amigos tens de configurar o repositório (ver instruções no fim). Enquanto isso, os dados novos ficam guardados só neste browser." }));
  }

  const form = el("div");
  // Meta
  const meta = el("div", { class: "form-grid" });
  const advSel = selectFrom(L.equipas.filter((e) => e !== state.data.meta.clube), "Adversário");
  const numInput = el("input", { type: "number", value: nextNum, id: "f_num" });
  const nrJog = el("input", { type: "number", value: 16, id: "f_nrjog" });
  const tatica = el("input", { type: "text", value: "5-4-1", id: "f_tatica" });
  meta.append(
    field("Jornada nº", numInput),
    field("Adversário", advSel),
    field("Nº de jogadores", nrJog),
    field("Tática inicial", tatica));
  form.append(meta);

  // Match stats
  form.append(el("div", { class: "section-title" }, "Estatísticas do jogo"));
  const statDefs = [["Resultado", "golos"], ["Remates", ""], ["Remates à baliza", ""], ["Cantos", ""], ["Faltas", ""], ["Fora de jogo", ""], ["Posse de bola", "%"]];
  const statGrid = el("div", { class: "form-grid" });
  const statInputs = {};
  statDefs.forEach(([k, hint]) => {
    const ti = el("input", { type: "number", step: hint === "%" ? "1" : "1", placeholder: hint === "%" ? "% ex: 55" : state.data.meta.clube });
    const ci = el("input", { type: "number", step: "1", placeholder: hint === "%" ? "% ex: 45" : "adversário" });
    statInputs[k] = { ti, ci, isPct: hint === "%" };
    const wrap = el("div", {},
      el("label", {}, k + (hint === "%" ? " (%)" : "")),
      el("div", { style: "display:grid;grid-template-columns:1fr 1fr;gap:8px" }, ti, ci));
    statGrid.append(wrap);
  });
  form.append(statGrid);
  form.append(el("p", { class: "hint" }, `Esquerda = ${state.data.meta.clube} · Direita = adversário. Posse de bola em % (ex: 55 e 45).`));

  // Players
  form.append(el("div", { class: "section-title" }, "Jogadores (marca os que jogaram)"));
  const pcols = [["minutos", "Min"], ["golos", "G"], ["assistencias", "A"], ["remates", "Rem"], ["desarmes", "Des"], ["defesas", "Def"], ["passeFinalizacao", "PF"], ["faltas", "Flt"], ["passesErrados", "PE"], ["perdasBola", "PB"]];
  const pt = el("table", { class: "pstat-table" });
  const ph = el("tr", {}, el("th", {}, "Conv."), el("th", {}, "Jogador"), el("th", {}, "Tit."));
  pcols.forEach((c) => ph.append(el("th", { class: "num" }, c[1])));
  pt.append(el("thead", {}, ph));
  const playerRows = [];
  L.jogadores.forEach((nome) => {
    const conv = el("input", { type: "checkbox" });
    const tit = el("input", { type: "checkbox" });
    const inputs = {};
    const tr = el("tr", {}, el("td", {}, conv), el("td", {}, nome), el("td", {}, tit));
    pcols.forEach((c) => {
      const inp = el("input", { type: "number", min: "0", style: "width:56px" });
      inputs[c[0]] = inp;
      tr.append(el("td", { class: "num" }, inp));
    });
    pt.append(tr);
    playerRows.push({ nome, conv, tit, inputs });
  });
  form.append(tableScroll(pt));
  form.append(el("p", { class: "hint" }, "Só os jogadores com 'Conv.' marcado são guardados. Deixa os campos vazios como 0."));

  // Events
  form.append(el("div", { class: "section-title" }, "Eventos do jogo (opcional)"));
  const evWrap = el("div");
  const addEventRow = (acao = "", jogador = "") => {
    const aSel = selectFrom(L.acontecimentos, "Ação", acao);
    const jSel = selectFrom(["", ...L.jogadores], "Jogador (opcional)", jogador);
    const del = el("button", { class: "btn ghost small", type: "button" }, "✕");
    const row = el("div", { class: "event-row" }, aSel, jSel, del);
    del.addEventListener("click", () => row.remove());
    evWrap.append(row);
  };
  form.append(evWrap);
  const addBtn = el("button", { class: "btn ghost small", type: "button", onclick: () => addEventRow() }, "+ Adicionar evento");
  form.append(el("div", { class: "btnrow" }, addBtn));

  // Actions
  const msg = el("p", { class: "hint" });
  const collect = () => {
    const numero = +numInput.value;
    const adversario = advSel.value;
    if (!adversario) { throw new Error("Escolhe o adversário."); }
    const matchStats = {};
    for (const [k, o] of Object.entries(statInputs)) {
      let t = o.ti.value === "" ? null : +o.ti.value;
      let c = o.ci.value === "" ? null : +o.ci.value;
      if (o.isPct) { t = t == null ? null : t / 100; c = c == null ? null : c / 100; }
      matchStats[k] = { tigres: t, adversario: c };
    }
    const players = playerRows.filter((r) => r.conv.checked).map((r) => {
      const o = { nome: r.nome, titular: r.tit.checked };
      for (const [k, inp] of Object.entries(r.inputs)) o[k] = inp.value === "" ? 0 : +inp.value;
      return o;
    });
    const eventos = $$(".event-row", evWrap).map((row) => {
      const [a, j] = $$("select", row);
      return a.value ? { acao: a.value, jogador: j.value || null } : null;
    }).filter(Boolean);
    return { numero, equipa: state.data.meta.clube, adversario, nrJogadores: +nrJog.value, tatica: tatica.value, matchStats, players, eventos };
  };

  const saveGh = el("button", { class: "btn", type: "button" }, "Guardar e partilhar");
  const saveLocal = el("button", { class: "btn ghost", type: "button" }, "Guardar só neste browser");
  const exp = el("button", { class: "btn ghost", type: "button" }, "Exportar Excel");
  const settingsBtn = el("button", { class: "btn ghost small", type: "button" }, "⚙ Definições / Token");

  saveGh.addEventListener("click", async () => {
    try {
      const j = collect();
      upsertJornada(j);
      msg.textContent = "A guardar no GitHub…";
      await saveToGitHub(state.data, `Jornada ${j.numero} vs ${j.adversario}`);
      state.source = "github";
      msg.textContent = "✅ Guardado e partilhado! Os teus amigos já veem a jornada.";
      state.view = "jornadas"; render();
    } catch (e) {
      // reverte se falhou o commit
      msg.style.color = "var(--loss)"; msg.textContent = "❌ " + e.message;
    }
  });
  saveLocal.addEventListener("click", () => {
    try {
      const j = collect(); upsertJornada(j);
      localStorage.setItem("tigres_cache", JSON.stringify(state.data));
      state.source = "local";
      state.view = "jornadas"; render();
    } catch (e) { msg.style.color = "var(--loss)"; msg.textContent = "❌ " + e.message; }
  });
  exp.addEventListener("click", () => { try { collect(); } catch {} exportExcel(); });
  settingsBtn.addEventListener("click", openSettingsModal);

  form.append(el("div", { class: "btnrow" }, saveGh, saveLocal, exp, settingsBtn), msg);
  app.append(form);
}

function upsertJornada(j) {
  const idx = state.data.jornadas.findIndex((x) => x.numero === j.numero);
  if (idx >= 0) state.data.jornadas[idx] = j; else state.data.jornadas.push(j);
  state.data.jornadas.sort((a, b) => a.numero - b.numero);
  state.data.meta.atualizado = new Date().toISOString();
}

function openSettingsModal() {
  const b = $("#modalBody"); b.innerHTML = "";
  b.append(el("h2", {}, "Definições"));
  b.append(el("div", { class: "note", html: `<strong>Repositório:</strong> ${ghConfigured() ? CONFIG.githubOwner + "/" + CONFIG.githubRepo : "❌ não configurado (edita CONFIG no ficheiro app.js)"}` }));
  b.append(el("label", {}, "Token do GitHub (fica guardado só neste browser)"));
  const tok = el("input", { type: "password", value: getToken(), placeholder: "github_pat_..." });
  b.append(tok);
  b.append(el("p", { class: "hint", html: "Cria em GitHub → Settings → Developer settings → Fine-grained tokens, com permissão <strong>Contents: Read and write</strong> só neste repositório. Sem token consegues ver tudo, mas não gravar." }));
  const save = el("button", { class: "btn", onclick: () => { setToken(tok.value.trim()); closeModal(); } }, "Guardar token");
  const clear = el("button", { class: "btn danger", onclick: () => { localStorage.removeItem("tigres_gh_token"); closeModal(); } }, "Apagar token");
  b.append(el("div", { class: "btnrow" }, save, clear));
  showModal();
}

/* ================= helpers UI ================= */
function tableScroll(table) {
  return el("div", { class: "table-scroll" }, table);
}
function field(label, input) { return el("div", {}, el("label", {}, label), input); }
function selectFrom(arr, ph, val = "") {
  const s = el("select");
  if (ph) s.append(el("option", { value: "" }, ph));
  arr.forEach((o) => s.append(el("option", { value: o, ...(o === val ? { selected: "selected" } : {}) }, o || "—")));
  s.value = val;
  return s;
}
function showModal() { $("#modalBackdrop").hidden = false; }
function closeModal() { $("#modalBackdrop").hidden = true; }

/* menu lateral (mobile) */
function openNav() { $("#nav").classList.add("open"); $("#navBackdrop").hidden = false; }
function closeNav() { $("#nav").classList.remove("open"); $("#navBackdrop").hidden = true; }

/* ================= boot ================= */
async function boot() {
  try {
    state.data = await loadData();
  } catch (e) {
    $("#app").innerHTML = `<div class="empty">Erro ao carregar dados: ${e.message}</div>`;
    return;
  }
  $$(".tab").forEach((t) => t.addEventListener("click", () => { state.view = t.dataset.view; closeNav(); render(); }));
  $("#modalClose").addEventListener("click", closeModal);
  $("#modalBackdrop").addEventListener("click", (e) => { if (e.target.id === "modalBackdrop") closeModal(); });
  $("#menuBtn").addEventListener("click", openNav);
  $("#navClose").addEventListener("click", closeNav);
  $("#navBackdrop").addEventListener("click", closeNav);
  render();
}
boot();
