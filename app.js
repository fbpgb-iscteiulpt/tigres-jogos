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
  // 1) tenta a API do GitHub (sempre fresca, sem cache de CDN) para a versão partilhada
  if (ghConfigured()) {
    try {
      const token = getToken();
      const headers = { Accept: "application/vnd.github+json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const r = await fetch(apiUrl() + "?ref=" + CONFIG.githubBranch + "&t=" + Date.now(), { cache: "no-store", headers });
      if (r.ok) {
        const payload = await r.json();
        const d = JSON.parse(b64decode(payload.content));
        state.source = "github";
        localStorage.setItem("tigres_cache", JSON.stringify(d));
        return d;
      }
    } catch (e) { /* API falhou — tenta raw */ }
    // 1b) fallback: raw público (pode estar em cache de CDN ~5 min)
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
function b64decode(b64) {
  return decodeURIComponent(escape(atob(String(b64).replace(/\s/g, ""))));
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
    const pHead = ["", "", "", "", "", "", "", "Convocado", "Titular", "Minutos", "Remates", "Desarmes", "Defesas", "Golos", "Assist.", "Passe fin.", "Faltas", "Passes err.", "Perdas", "Dribles OK", "Dribles falh.", "Cruz. OK", "Cruz. falh."];
    rows.push(pHead);
    for (let i = 0; i < maxLen; i++) {
      const ev = j.eventos[i] || {};
      const st = statKeys[i] ? [statKeys[i], j.matchStats[statKeys[i]].tigres, j.matchStats[statKeys[i]].adversario] : ["", "", ""];
      const p = j.players[i];
      const prow = p ? [p.nome, p.titular ? "X" : "", p.minutos, p.remates, p.desarmes, p.defesas, p.golos, p.assistencias, p.passeFinalizacao, p.faltas, p.passesErrados, p.perdasBola, p.driblesBemSucedidos, p.driblesFalhados, p.cruzamentosBemSucedidos, p.cruzamentosFalhados] : [];
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
      const a = (out.players[p.nome] ||= { nome: p.nome, jogos: 0, titular: 0, minutos: 0, golos: 0, assistencias: 0, remates: 0, desarmes: 0, defesas: 0, passeFinalizacao: 0, faltas: 0, passesErrados: 0, perdasBola: 0, driblesBemSucedidos: 0, driblesFalhados: 0, cruzamentosBemSucedidos: 0, cruzamentosFalhados: 0 });
      a.jogos++; if (p.titular) a.titular++;
      for (const k of ["minutos", "golos", "assistencias", "remates", "desarmes", "defesas", "passeFinalizacao", "faltas", "passesErrados", "perdasBola", "driblesBemSucedidos", "driblesFalhados", "cruzamentosBemSucedidos", "cruzamentosFalhados"]) a[k] += (+p[k] || 0);
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
  // Ranking por rácio: soma de "num" a dividir pela soma de (num+den) em todos os jogos.
  // Só conta jogadores com pelo menos 1 tentativa (num+den > 0).
  function rankingRatio(numKey, denKey, dir) {
    const rows = players.map((pl) => {
      const bem = pl.games.reduce((s, g) => s + (+g[numKey] || 0), 0);
      const fal = pl.games.reduce((s, g) => s + (+g[denKey] || 0), 0);
      const tent = bem + fal;
      if (tent <= 0) return null;
      return { nome: pl.nome, avg: bem / tent, bem, tent };
    }).filter(Boolean);
    rows.sort((a, b) => dir === "max" ? b.avg - a.avg || b.tent - a.tent || a.nome.localeCompare(b.nome) : a.avg - b.avg || b.tent - a.tent || a.nome.localeCompare(b.nome));
    return rows.slice(0, 3);
  }
  // Precisão de remate: remates à baliza (dos eventos) ÷ remates totais (stat).
  // Só conta jogadores com pelo menos 1 remate.
  function rankingPrecisaoRemate() {
    const onTarget = {};
    for (const j of data.jornadas) {
      for (const e of (j.eventos || [])) {
        if (e.acao === "Remate à baliza" && e.jogador) onTarget[e.jogador] = (onTarget[e.jogador] || 0) + 1;
      }
    }
    const rows = players.map((pl) => {
      const rem = pl.games.reduce((s, g) => s + (+g.remates || 0), 0);
      if (rem <= 0) return null;
      const ab = Math.min(onTarget[pl.nome] || 0, rem);
      return { nome: pl.nome, avg: ab / rem, bem: ab, tent: rem };
    }).filter(Boolean);
    rows.sort((a, b) => b.avg - a.avg || b.tent - a.tent || a.nome.localeCompare(b.nome));
    return rows.slice(0, 3);
  }
  return {
    consistency: ranking("passesErrados", "min", min40),
    keyPass: ranking("passeFinalizacao", "max", jogou),
    recovery: ranking("desarmes", "max", jogou),
    shooting: ranking("remates", "max", jogou),
    noX: ranking("perdasBola", "max", jogou),
    blindPasser: ranking("passesErrados", "max", jogou),
    foul: ranking("faltas", "max", jogou),
    drible: rankingRatio("driblesBemSucedidos", "driblesFalhados", "max"),
    peDeTijolo: rankingRatio("driblesBemSucedidos", "driblesFalhados", "min"),
    crossing: rankingRatio("cruzamentosBemSucedidos", "cruzamentosFalhados", "max"),
    precisaoRemate: rankingPrecisaoRemate(),
  };
}

/* ================= VIEWS ================= */
let viewCleanup = null; // função de limpeza da vista atual (listeners/intervalos)
function render() {
  if (typeof viewCleanup === "function") { viewCleanup(); viewCleanup = null; }
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === state.view));
  const app = $("#app");
  app.innerHTML = "";
  ({ epoca: viewEpoca, jornadas: viewJornadas, classificacao: viewClassificacao, jogadores: viewJogadores, comparar: viewComparar, equipa: viewEquipa, dicas: viewDicas, posse: viewPosse, nova: viewNova }[state.view])(app);
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

  // Top scorers / assists
  app.append(el("div", { class: "section-title" }, "Melhores marcadores"));
  app.append(topTable(A.playersArr, "golos", ["golos", "remates"], ["Golos", "Remates"]));

  app.append(el("div", { class: "section-title" }, "Mais Assistências"));
  app.append(topTable(A.playersArr, "assistencias", ["assistencias", "passeFinalizacao"], ["Assist.", "Passe fin."]));

  // Highlights da época ("kings")
  const K = computeKings(state.data);
  app.append(el("div", { class: "section-title" }, "Highlights da Época"));
  const kings = el("div", { class: "grid kings" });
  kings.append(
    kingCard("👑", "Consistency King", "Menos passes falhados por jogo", K.consistency, "unidade", "(mín. 40 min por jogo)"),
    kingCard("🎯", "Key Pass King", "Mais passes p/ finalização por jogo", K.keyPass, "unidade"),
    kingCard("🛡️", "Recovery King", "Mais desarmes por jogo", K.recovery, "unidade"),
    kingCard("🥅", "Shooting King", "Mais remates por jogo", K.shooting, "unidade"),
    kingCard("🎯", "Sniper — Precisão de remate", "Melhor % de remates à baliza", K.precisaoRemate, "unidade", "(remates à baliza ÷ remates)", fmtRatio),
    kingCard("🧱", 'No "X" King', "Mais perdas de bola por jogo", K.noX, "unidade"),
    kingCard("🙈", "The Blind Passer", "Mais passes falhados por jogo", K.blindPasser, "unidade"),
    kingCard("🥊", "The Foul King", "Mais faltas por jogo", K.foul, "unidade"),
    kingCard("⚡", "Drible King", "Melhor % de dribles conseguidos", K.drible, "unidade", "(dribles bem sucedidos ÷ efetuados)", fmtRatio),
    kingCard("🎯", "Crossing King", "Melhor % de cruzamentos conseguidos", K.crossing, "unidade", "(cruzamentos bem sucedidos ÷ efetuados)", fmtRatio),
    kingCard("🧿", "Pés de tijolo", "Pior % de dribles conseguidos", K.peDeTijolo, "unidade", "(mín. 1 drible efetuado)", fmtRatio),
  );
  app.append(kings);
}

// Formatação de valor para os cartões de rácio (percentagem)
function fmtRatio(r, isLeader) {
  const p = Math.round(r.avg * 100);
  return `${p}% (${r.bem}/${r.tent})`;
}

function kingCard(icon, title, subtitle, top3, unit, note, valFmt) {
  const card = el("div", { class: "card king" });
  card.append(el("div", { class: "king-title" }, el("span", { class: "king-icon" }, icon), el("span", {}, title)));
  card.append(el("div", { class: "king-sub" }, subtitle + (note ? " " + note : "")));
  if (!top3 || !top3.length) { card.append(el("div", { class: "empty" }, "Sem dados")); return card; }
  const leader = top3[0];
  const lead = el("div", { class: "king-leader", onclick: () => openPlayerModal(leader.nome) },
    el("span", { class: "king-name" }, leader.nome),
    el("span", { class: "king-val" }, valFmt ? valFmt(leader, true) : `${leader.avg.toFixed(1)} / jogo`));
  card.append(lead);
  const rest = top3.slice(1);
  if (rest.length) {
    const list = el("div", { class: "king-rest" });
    rest.forEach((r, i) => list.append(el("div", { class: "king-rest-row", onclick: () => openPlayerModal(r.nome) },
      el("span", { class: "king-rank" }, (i + 2) + "."),
      el("span", { class: "king-rname" }, r.nome),
      el("span", { class: "king-rval" }, valFmt ? valFmt(r, false) : `${r.avg.toFixed(1)}`))));
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

/* Data real da jornada: o intervalo ("3 / 4 Outubro") é o fim de semana Sábado / Domingo
   (1.º número = Sábado, 2.º = Domingo). A hora indica Sexta (21:30, = Sábado − 1),
   Sábado (restantes slots) ou Domingo (11:00 / 12:40). */
const MESES_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
function mesIdxPT(nome) { return MESES_PT.findIndex((x) => x.toLowerCase() === (nome || "").toLowerCase()); }
function anoDoMes(mesIdx) { return mesIdx >= 8 ? 2025 : 2026; } // Set–Dez → 2025, Jan–Jun → 2026
function dataJornada(range, hora) {
  const parts = String(range || "").split("/");
  if (parts.length < 2) return range || "";
  // 2.º número (Domingo) traz sempre o mês; o 1.º (Sábado) pode herdá-lo
  const mDom = parts[1].trim().match(/(\d{1,2})\s+([A-Za-zçÇãÃéÉíÍ]+)/);
  const mSab = parts[0].trim().match(/(\d{1,2})(?:\s+([A-Za-zçÇãÃéÉíÍ]+))?/);
  if (!mDom || !mSab) return range || "";
  const mesDom = mesIdxPT(mDom[2]);
  const mesSab = mSab[2] ? mesIdxPT(mSab[2]) : mesDom; // sem mês no 1.º → usa o do 2.º
  if (mesSab < 0 || mesDom < 0) return range || "";
  if (hora === "11:00" || hora === "12:40") {
    // Domingo — 2.º número
    return `Domingo, ${+mDom[1]} ${MESES_PT[mesDom]}`;
  }
  // Sábado — 1.º número
  const sab = new Date(anoDoMes(mesSab), mesSab, +mSab[1]);
  if (hora === "21:30") {
    // Sexta = Sábado − 1 (aritmética trata salto de mês)
    const sex = new Date(sab); sex.setDate(sex.getDate() - 1);
    return `Sexta, ${sex.getDate()} ${MESES_PT[sex.getMonth()]}`;
  }
  return `Sábado, ${sab.getDate()} ${MESES_PT[sab.getMonth()]}`;
}

function viewJornadas(app) {
  app.append(el("div", { class: "section-title" }, "Jornadas disputadas"));
  const jogadas = [...state.data.jornadas].sort((a, b) => b.numero - a.numero);
  const list = el("div", { class: "jlist" });
  if (!jogadas.length) list.append(el("div", { class: "empty" }, "Ainda sem jornadas registadas."));
  jogadas.forEach((j) => {
    const { gf, ga, res } = resultOf(j);
    const dataTxt = dataJornada(j.data, j.hora);
    const meta = [dataTxt, j.hora, j.casa === false ? "fora" : j.casa === true ? "casa" : null].filter(Boolean).join(" · ");
    const row = el("div", { class: "jrow", onclick: () => openJornadaModal(j.numero) },
      el("span", { class: "jnum" }, `Jornada ${j.numero}`, meta ? el("span", { class: "jdate" }, meta) : null),
      el("span", { class: "jteams" }, teamTag(state.data.meta.clube), el("span", { class: "vs" }, "vs"), teamTag(j.adversario)),
      el("span", { class: "jscore" }, `${gf ?? "?"}–${ga ?? "?"}`),
      el("span", { class: "badge " + (res === "?" ? "" : res) }, res === "w" ? "V" : res === "d" ? "E" : res === "l" ? "D" : "?"),
      videoLink(j.video),
    );
    list.append(row);
  });
  app.append(list);

  // Próximas jornadas (do calendário)
  const cal = state.data.calendario || [];
  const jogadasNums = new Set(state.data.jornadas.map((j) => j.numero));
  const futuras = cal.filter((f) => !jogadasNums.has(f.numero)).sort((a, b) => a.numero - b.numero);
  if (futuras.length) {
    app.append(el("div", { class: "section-title" }, "Próximas jornadas"));
    const fl = el("div", { class: "jlist" });
    futuras.forEach((f) => {
      const local = f.casa ? "casa" : "fora";
      const meta = [dataJornada(f.data, f.hora), f.hora, local].filter(Boolean).join(" · ");
      fl.append(el("div", { class: "jrow future" },
        el("span", { class: "jnum" }, `Jornada ${f.numero}`, el("span", { class: "jdate" }, meta)),
        el("span", { class: "jteams" }, teamTag(state.data.meta.clube), el("span", { class: "vs" }, "vs"), teamTag(f.adversario)),
        el("span", { class: "jscore muted" }, "–"),
        videoLink(f.video),
      ));
    });
    app.append(fl);
  }
}

/* Link para o vídeo do jogo (abre o YouTube em nova aba, sem abrir o modal) */
function videoLink(url) {
  if (!url) return null;
  return el("a", {
    class: "jvideo", href: url, target: "_blank", rel: "noopener",
    title: "Ver vídeo do jogo no YouTube",
    onclick: (e) => e.stopPropagation(),
  }, "▶ Vídeo");
}

/* Extrai o ID de 11 caracteres de um URL do YouTube (watch?v=, youtu.be/, embed/) */
function youtubeId(url) {
  if (!url) return null;
  const m = String(url).match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}
/* Caixa de vídeo embebido (responsiva, 16:9) */
function videoEmbed(url) {
  const id = youtubeId(url);
  if (!id) return null;
  const box = el("div", { class: "video-embed" });
  box.append(el("iframe", {
    src: `https://www.youtube.com/embed/${id}`,
    title: "Vídeo do jogo", frameborder: "0", allowfullscreen: "true",
    allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
  }));
  return box;
}

/* ================= CLASSIFICAÇÃO ================= */
function viewClassificacao(app) {
  const tabela = state.data.classificacao || [];
  app.append(el("div", { class: "section-title" }, "Classificação"));
  if (!tabela.length) { app.append(el("div", { class: "empty" }, "Sem classificação disponível.")); return; }
  const clube = state.data.meta.clube;
  const cols = [["pts", "Pts"], ["j", "J"], ["v", "V"], ["e", "E"], ["dd", "D"], ["gm", "GM"], ["gs", "GS"]];
  const t = el("table", { class: "pstat-table standings" });
  const h = el("tr", {}, el("th", { class: "rank" }, "#"), el("th", {}, "Equipa"));
  cols.forEach((c) => h.append(el("th", { class: "num" }, c[1])));
  h.append(el("th", { class: "num" }, "DIF"));
  h.append(el("th", { class: "num" }, "TD"));
  t.append(el("thead", {}, h));
  const tb = el("tbody");
  [...tabela].sort((a, b) => a.pos - b.pos).forEach((r) => {
    const isClube = r.equipa === clube;
    const tr = el("tr", isClube ? { class: "me" } : {},
      el("td", { class: "rank" }, r.pos),
      el("td", {}, teamTag(r.equipa)));
    cols.forEach((c) => tr.append(el("td", { class: "num" + (c[0] === "pts" ? " strong" : "") }, fmt(r[c[0]]))));
    const dif = (r.gm || 0) - (r.gs || 0);
    tr.append(el("td", { class: "num" }, (dif > 0 ? "+" : "") + dif));
    tr.append(el("td", { class: "num" }, fmt(r.td)));
    tb.append(tr);
  });
  t.append(tb);
  app.append(tableScroll(t));
  app.append(el("p", { class: "hint" }, "J=jogos, V=vitórias, E=empates, D=derrotas, GM=golos marcados, GS=golos sofridos, DIF=diferença de golos, TD=taça disciplina."));
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
    j.data ? el("span", { class: "chip" }, `Data: ${dataJornada(j.data, j.hora)}${j.hora ? " · " + j.hora : ""}${j.casa === false ? " (fora)" : j.casa === true ? " (casa)" : ""}`) : null,
    el("span", { class: "chip" }, `Tática: ${fmt(j.tatica)}`),
    el("span", { class: "chip" }, `Convocados: ${j.players.length}`)));
  if (j.video) {
    b.append(el("div", { class: "section-title" }, "Vídeo do jogo"));
    b.append(videoEmbed(j.video));
  }

  // Match stats compare
  b.append(el("div", { class: "section-title" }, "Estatísticas do jogo"));
  b.append(compareBlock(j.matchStats, j.adversario));

  // Player table
  b.append(el("div", { class: "section-title" }, "Jogadores"));
  const cols = [["minutos", "Min"], ["golos", "G"], ["assistencias", "A"], ["remates", "Rem"], ["desarmes", "Des"], ["defesas", "Def"], ["passeFinalizacao", "PF"], ["faltas", "Flt"], ["passesErrados", "PE"], ["perdasBola", "PB"], ["driblesBemSucedidos", "DB"], ["driblesFalhados", "DF"], ["cruzamentosBemSucedidos", "CB"], ["cruzamentosFalhados", "CF"]];
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
  b.append(el("p", { class: "hint" }, "Tit = titular (●) / suplente (○). PF=passe p/ finalização, PE=passes errados, PB=perdas de bola, DB=dribles bem sucedidos, DF=dribles falhados, CB=cruzamentos bem sucedidos, CF=cruzamentos falhados."));

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
  const cols = [["jogos", "J"], ["titular", "Tit"], ["minutos", "Min"], ["golos", "G"], ["assistencias", "A"], ["remates", "Rem"], ["desarmes", "Des"], ["defesas", "Def"], ["faltas", "Flt"], ["passesErrados", "PE"], ["perdasBola", "PB"], ["driblesBemSucedidos", "DB"], ["driblesFalhados", "DF"], ["cruzamentosBemSucedidos", "CB"], ["cruzamentosFalhados", "CF"]];
  let sortKey = "golos", desc = true;
  const t = el("table", { class: "pstat-table sticky-first" });
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
  app.append(el("p", { class: "hint" }, "Clica num cabeçalho para ordenar · clica num jogador para detalhe. J=jogos, Tit=titular, PE=passes errados, PB=perdas de bola, DB=dribles bem sucedidos, DF=dribles falhados, CB=cruzamentos bem sucedidos, CF=cruzamentos falhados."));
}

/* ================= ESTATÍSTICAS DA EQUIPA ================= */
// Soma de uma stat dos jogadores numa jornada
function sumPlayers(j, key) { return (j.players || []).reduce((s, p) => s + (+p[key] || 0), 0); }
// Valor de um matchStat da equipa (lado tigres)
function ms(j, key) { const v = j.matchStats?.[key]; return v && v.tigres != null ? +v.tigres : null; }
function msAdv(j, key) { const v = j.matchStats?.[key]; return v && v.adversario != null ? +v.adversario : null; }

function viewEquipa(app) {
  const js = [...state.data.jornadas].sort((a, b) => a.numero - b.numero);
  app.append(el("div", { class: "section-title" }, "Estatísticas da equipa"));
  if (!js.length) { app.append(el("div", { class: "empty" }, "Sem jornadas registadas.")); return; }

  // Cada métrica: label, função por jornada, "melhor" quando sobe (up) ou desce (down), casas decimais, sufixo
  const metricas = [
    { lbl: "Golos marcados", f: (j) => ms(j, "Resultado"), dir: "up" },
    { lbl: "Golos sofridos", f: (j) => msAdv(j, "Resultado"), dir: "down" },
    { lbl: "Remates", f: (j) => ms(j, "Remates"), dir: "up" },
    { lbl: "Remates à baliza", f: (j) => ms(j, "Remates à baliza"), dir: "up" },
    { lbl: "Precisão de remate", f: (j) => { const r = ms(j, "Remates"), b = ms(j, "Remates à baliza"); return r ? Math.round((b / r) * 100) : null; }, dir: "up", suf: "%" },
    { lbl: "Cantos", f: (j) => ms(j, "Cantos"), dir: "up" },
    { lbl: "Faltas cometidas", f: (j) => ms(j, "Faltas"), dir: "down" },
    { lbl: "Fora de jogo", f: (j) => ms(j, "Fora de jogo"), dir: "down" },
    { lbl: "Posse de bola", f: (j) => { const v = ms(j, "Posse de bola"); return v == null ? null : Math.round(v * 100); }, dir: "up", suf: "%" },
    { lbl: "Cruzamentos (equipa)", f: (j) => ms(j, "Cruzamentos"), dir: "up" },
    { lbl: "Cruzamentos bem sucedidos", f: (j) => sumPlayers(j, "cruzamentosBemSucedidos"), dir: "up" },
    { lbl: "Passes para finalização", f: (j) => sumPlayers(j, "passeFinalizacao"), dir: "up" },
    { lbl: "Passes errados", f: (j) => sumPlayers(j, "passesErrados"), dir: "down" },
    { lbl: "Perdas de bola", f: (j) => sumPlayers(j, "perdasBola"), dir: "down" },
    { lbl: "Desarmes", f: (j) => sumPlayers(j, "desarmes"), dir: "up" },
    { lbl: "Cartões vermelhos", f: (j) => ms(j, "Cartões Vermelhos"), dir: "down" },
    { lbl: "Golos por jornada (dif.)", f: (j) => { const g = ms(j, "Resultado"), s = msAdv(j, "Resultado"); return g == null || s == null ? null : g - s; }, dir: "up", sign: true },
  ];

  const grid = el("div", { class: "grid team-stats" });
  metricas.forEach((m) => {
    const serie = js.map((j) => ({ numero: j.numero, adversario: j.adversario, val: m.f(j) })).filter((x) => x.val != null);
    grid.append(teamStatCard(m, serie));
  });
  app.append(grid);
  app.append(el("p", { class: "hint" }, "Cada cartão mostra a média por jornada (número grande) e a evolução jornada a jornada. As setas indicam se variou para melhor (verde) ou pior (vermelho) face à jornada anterior."));
}

function teamStatCard(m, serie) {
  const card = el("div", { class: "card team-stat" });
  card.append(el("div", { class: "ts-title" }, m.lbl));
  if (!serie.length) { card.append(el("div", { class: "empty" }, "Sem dados")); return card; }
  const suf = m.suf || "";
  const avg = serie.reduce((s, x) => s + x.val, 0) / serie.length;
  const avgTxt = (m.suf === "%" ? Math.round(avg) : (Math.round(avg * 10) / 10)) + suf;
  card.append(el("div", { class: "ts-avg" }, avgTxt, el("span", { class: "ts-avg-lbl" }, "média/jornada")));

  // valores máximos para escala das barras
  const maxV = Math.max(...serie.map((x) => Math.abs(x.val)), 1);
  const rows = el("div", { class: "ts-rows" });
  serie.forEach((x, i) => {
    const prev = i > 0 ? serie[i - 1].val : null;
    let trend = "", arrow = "";
    if (prev != null && x.val !== prev) {
      const better = m.dir === "up" ? x.val > prev : x.val < prev;
      trend = better ? "up" : "down";
      arrow = x.val > prev ? "▲" : "▼";
    } else if (prev != null) { trend = "eq"; arrow = "="; }
    const disp = (m.sign && x.val > 0 ? "+" : "") + x.val + suf;
    const w = Math.round((Math.abs(x.val) / maxV) * 100);
    rows.append(el("div", { class: "ts-row" },
      el("span", { class: "ts-jn" }, "J" + x.numero),
      el("div", { class: "ts-bar" }, el("div", { class: "ts-fill", style: `width:${w}%` })),
      el("span", { class: "ts-val" }, disp),
      el("span", { class: "ts-trend " + trend }, arrow),
    ));
  });
  card.append(rows);
  return card;
}

/* ================= DICAS DE TREINO ================= */
function viewDicas(app) {
  const js = [...state.data.jornadas].sort((a, b) => a.numero - b.numero);
  const n = js.length || 1;
  const mean = (fn) => js.reduce((s, j) => s + (fn(j) || 0), 0) / n;
  // médias da época
  const gs = mean((j) => msAdv(j, "Resultado"));
  const gm = mean((j) => ms(j, "Resultado"));
  const rem = mean((j) => ms(j, "Remates"));
  const remB = mean((j) => ms(j, "Remates à baliza"));
  const posse = mean((j) => { const v = ms(j, "Posse de bola"); return v == null ? 0 : v * 100; });
  const pe = mean((j) => sumPlayers(j, "passesErrados"));
  const pb = mean((j) => sumPlayers(j, "perdasBola"));
  const des = mean((j) => sumPlayers(j, "desarmes"));
  const pf = mean((j) => sumPlayers(j, "passeFinalizacao"));
  const cruzOk = mean((j) => sumPlayers(j, "cruzamentosBemSucedidos"));
  const cruzTot = mean((j) => sumPlayers(j, "cruzamentosBemSucedidos") + sumPlayers(j, "cruzamentosFalhados"));
  const turnovers = pe + pb;
  const precisao = rem ? Math.round((remB / rem) * 100) : 0;
  const cruzPrec = cruzTot ? Math.round((cruzOk / cruzTot) * 100) : 0;
  const r1 = (x) => Math.round(x * 10) / 10;

  app.append(el("div", { class: "section-title" }, "Dicas de treino"));
  app.append(el("p", { class: "dicas-intro" }, "Sugestões de treino baseadas nas estatísticas reais da equipa. Com apenas 1 hora por semana (quinta-feira), o objetivo é treinar com foco, não treinar tudo ao mesmo tempo."));

  // ---- O que dizem os números ----
  app.append(el("h3", { class: "dicas-h" }, "O que dizem os números"));
  const sinais = [
    ["Perdas de posse", `~${r1(pe)} passes errados + ~${r1(pb)} perdas = ~${r1(turnovers)} por jogo`, "É o principal problema"],
    ["Posse de bola", `${Math.round(posse)}%`, "Passamos o jogo a correr atrás da bola"],
    ["Desarmes", `~${r1(des)} por jogo`, "Confirma: enorme carga defensiva, sempre sem bola"],
    ["Produção ofensiva", `${r1(rem)} remates, ${precisao}% à baliza, ${r1(pf)} passes p/ finalização, ${r1(gm)} golos`, "Cria-se pouco e o que se cria falha"],
    ["Cruzamentos", `${r1(cruzTot)} tentados, ${cruzPrec}% conseguidos`, "Uma tática que ainda não compensa"],
    ["Golos sofridos", `${r1(gs)} por jogo`, "Muitos vêm dessas perdas de bola → contra-ataques"],
  ];
  const st = el("table", { class: "dicas-table" });
  st.append(el("thead", {}, el("tr", {}, el("th", {}, "Sinal"), el("th", {}, "Números"), el("th", {}, "Leitura"))));
  const stb = el("tbody");
  sinais.forEach((row) => stb.append(el("tr", {}, el("td", { class: "sig" }, row[0]), el("td", { class: "nums" }, row[1]), el("td", {}, row[2]))));
  st.append(stb);
  app.append(tableScroll(st));
  app.append(el("p", { class: "dicas-note" }, "A história é uma cadeia ligada: perdemos a bola facilmente → não temos posse → defendemos constantemente → as perdas em zonas perigosas viram golos sofridos. Resolver a posse primeiro melhora quase tudo o resto."));

  // ---- Prioridade nº1 ----
  app.append(el("h3", { class: "dicas-h" }, "Prioridade n.º 1: manter a bola"));
  app.append(el("p", {}, "Com apenas 1 hora por semana, não treines dez coisas. A retenção de bola sob pressão é o que dá maior retorno — reduz as perdas, aumenta a posse, alivia a carga defensiva e cria mais tempo de ataque, tudo ao mesmo tempo."));

  // ---- Sessão de 1 hora ----
  app.append(el("h3", { class: "dicas-h" }, "Uma sessão de 1 hora (repetível)"));
  const sessao = [
    ["10 min", "Rondos (meínhos / keep-away)", "4x2 ou 5x2 num quadrado apertado, máximo 2 toques. É o melhor exercício para os nossos números — treina passe sob pressão, exatamente onde perdemos as bolas. Conta passes seguidos, torna-o competitivo."],
    ["20 min", "Jogo de posse posicional", "6x6 (+2 jogadores neutros que jogam sempre com quem tem a bola, logo 8x6). Objetivo: completar X passes = 1 ponto. Sem rematar. Obriga a valorizar a bola em vez de a forçar para a frente e perder."],
    ["20 min", "Transição + finalização", "Jogo reduzido (ex.: 7x7) com balizas a sério, mas com regra: ao recuperar a bola há ~6 segundos / 3 passes para rematar. Treina reagir depressa após recuperar e acertar na baliza (a nossa precisão e os golos precisam)."],
    ["10 min", "Jogo livre", "Para terminar — deixa-os jogar e divertirem-se."],
  ];
  const sl = el("div", { class: "dicas-session" });
  sessao.forEach((b) => sl.append(el("div", { class: "sess-block" },
    el("span", { class: "sess-time" }, b[0]),
    el("div", { class: "sess-body" }, el("strong", {}, b[1]), el("p", {}, b[2])),
  )));
  app.append(sl);

  // ---- Rotação semanal ----
  app.append(el("h3", { class: "dicas-h" }, "Roda o bloco temático (20 min) de semana para semana"));
  app.append(el("p", {}, "Mantém os rondos + jogo de posse constantes (são a nossa fraqueza central). Varia o foco do bloco de finalização:"));
  const rot = [
    ["Semana A — Qualidade de finalização", "Repetições de remate: primeiro acertar na baliza, depois potência. A precisão de " + precisao + "% e " + r1(gm) + " golos precisam de volume + técnica."],
    ["Semana B — Cruzamentos e ataque à área", `Só ${cruzPrec}% dos cruzamentos resultam, por isso treina a entrega (cruzamentos rasteiros e atrasados batem os altos neste escalão) e o timing das desmarcações para os receber.`],
    ["Semana C — Organização defensiva", `Como sofremos ${r1(gs)} golos por jogo, treina manter o bloco compacto e não entrar de rompante nos desarmes (${r1(des)} desarmes/jogo sugere que nos precipitamos) — temporizar, atrasar, encaminhar para fora.`],
  ];
  const rl = el("div", { class: "dicas-cards" });
  rot.forEach((r) => rl.append(el("div", { class: "card dica-card" }, el("strong", {}, r[0]), el("p", {}, r[1]))));
  app.append(rl);

  // ---- Mentalidade ----
  app.append(el("h3", { class: "dicas-h" }, "Uma ideia para o dia de jogo"));
  app.append(el("div", { class: "dica-highlight" },
    el("p", {}, el("strong", {}, "A bola é a melhor defesa. "), `Com a diferença de posse (${Math.round(posse)}%), cada passe certo mantido é um desarme que não temos de fazer. Premeia os passes seguros ("aborrecidos") no treino para que isso passe para os jogos.`)));

  app.append(el("p", { class: "dicas-foot" }, "Estas dicas atualizam-se automaticamente com os números da época. À medida que registas mais jornadas, o separador \u201cEstatísticas da equipa\u201d mostra se as perdas de bola estão mesmo a baixar — esse é o teu marcador de que o treino está a resultar."));
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

  // Perfil do jogador — médias por 80 min (mostra a "forma" do jogador)
  b.append(playerProfile(perJ));

  const cols = [["titular", "Tit"], ["minutos", "Min"], ["golos", "G"], ["assistencias", "A"], ["remates", "Rem"], ["desarmes", "Des"], ["defesas", "Def"], ["passeFinalizacao", "PF"], ["faltas", "Flt"], ["passesErrados", "PE"], ["perdasBola", "PB"], ["driblesBemSucedidos", "DB"], ["driblesFalhados", "DF"], ["cruzamentosBemSucedidos", "CB"], ["cruzamentosFalhados", "CF"]];
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

/* Perfil do jogador — barras de médias por 80 minutos, com escala de referência */
function playerProfile(perJ) {
  const minutos = perJ.reduce((s, p) => s + (+p.minutos || 0), 0);
  const wrap = el("div", { class: "profile" });
  wrap.append(el("div", { class: "profile-title" }, "Perfil por 80 min"));
  if (minutos <= 0) { wrap.append(el("div", { class: "empty" }, "Sem minutos jogados.")); return wrap; }
  const sum = (k) => perJ.reduce((s, p) => s + (+p[k] || 0), 0);
  const per80 = (k) => (sum(k) / minutos) * 80;
  const rows = el("div", { class: "profile-rows" });
  PERFIL_METRICS.forEach(([lbl, key, ref, neg]) => {
    const v = per80(key);
    const w = Math.max(0, Math.min(100, (v / ref) * 100));
    rows.append(el("div", { class: "pf-row" },
      el("span", { class: "pf-lbl" }, lbl),
      el("div", { class: "pf-bar" }, el("div", { class: "pf-fill" + (neg ? " neg" : ""), style: `width:${w}%` })),
      el("span", { class: "pf-val" }, (Math.round(v * 10) / 10).toString()),
    ));
  });
  wrap.append(rows);
  wrap.append(el("div", { class: "pf-note" }, `Média por 80 min ao longo de ${perJ.length} ${perJ.length === 1 ? "jogo" : "jogos"} (${minutos} min no total). Barras a vermelho = indicadores a reduzir.`));
  return wrap;
}

/* Métricas usadas no perfil e no comparador: [label, chave, máx referência, negativo?] */
const PERFIL_METRICS = [
  ["Golos", "golos", 2, false],
  ["Assistências", "assistencias", 2, false],
  ["Remates", "remates", 4, false],
  ["Passe p/ finalização", "passeFinalizacao", 3, false],
  ["Desarmes", "desarmes", 12, false],
  ["Defesas", "defesas", 6, false],
  ["Dribles conseguidos", "driblesBemSucedidos", 4, false],
  ["Cruzamentos conseguidos", "cruzamentosBemSucedidos", 3, false],
  ["Perdas de bola", "perdasBola", 6, true],
  ["Passes errados", "passesErrados", 8, true],
  ["Faltas", "faltas", 4, true],
];

/* ================= COMPARAR JOGADORES ================= */
function viewComparar(app) {
  app.append(el("div", { class: "section-title" }, "Comparar jogadores"));
  app.append(el("p", { class: "dicas-intro" }, "Escolhe 2 ou 3 jogadores para comparar os perfis por 80 minutos lado a lado. O melhor valor de cada indicador fica destacado (verde = bom; vermelho = indicador a reduzir)."));

  // Jogadores com minutos registados
  const agregados = {};
  state.data.jornadas.forEach((j) => j.players.forEach((p) => {
    const a = (agregados[p.nome] ||= { nome: p.nome, minutos: 0 });
    PERFIL_METRICS.forEach(([, k]) => { a[k] = (a[k] || 0) + (+p[k] || 0); });
    a.minutos += (+p.minutos || 0);
  }));
  const nomes = Object.values(agregados).filter((a) => a.minutos > 0).map((a) => a.nome).sort((x, y) => x.localeCompare(y));
  if (nomes.length < 2) { app.append(el("div", { class: "empty" }, "Precisas de pelo menos 2 jogadores com minutos registados.")); return; }

  // Seleção (3 dropdowns; o 3.º é opcional)
  const sel = [0, 1, 2].map((i) => {
    const s = el("select");
    s.append(el("option", { value: "" }, i < 2 ? "— escolher —" : "— (opcional) —"));
    nomes.forEach((n) => s.append(el("option", { value: n }, n)));
    if (i < nomes.length && i < 2) s.value = nomes[i];
    return s;
  });
  const picker = el("div", { class: "cmp-picker" },
    field("Jogador 1", sel[0]), field("Jogador 2", sel[1]), field("Jogador 3", sel[2]));
  app.append(picker);

  const out = el("div", { class: "cmp-out" });
  app.append(out);

  const per80 = (a, k) => a.minutos > 0 ? ((+a[k] || 0) / a.minutos) * 80 : 0;
  function build() {
    out.innerHTML = "";
    const chosen = sel.map((s) => s.value).filter(Boolean);
    const uniq = [...new Set(chosen)];
    if (uniq.length < 2) { out.append(el("div", { class: "empty" }, "Escolhe pelo menos 2 jogadores diferentes.")); return; }
    const players = uniq.map((n) => agregados[n]);

    // Cabeçalho com nomes + posição + minutos
    const header = el("div", { class: "cmp-grid cmp-head", style: `grid-template-columns:1.4fr repeat(${players.length},1fr)` });
    header.append(el("div", { class: "cmp-cell cmp-metric" }, "Por 80 min"));
    players.forEach((p) => {
      const pos = state.data.listas.posicoes?.[p.nome] || "";
      header.append(el("div", { class: "cmp-cell cmp-player", onclick: () => openPlayerModal(p.nome) },
        el("strong", {}, p.nome),
        el("span", { class: "cmp-sub" }, `${pos ? pos + " · " : ""}${p.minutos} min`)));
    });
    out.append(header);

    // Linhas de métricas
    PERFIL_METRICS.forEach(([lbl, key, ref, neg]) => {
      const vals = players.map((p) => per80(p, key));
      // melhor valor: menor se negativo, maior se positivo
      const best = neg ? Math.min(...vals) : Math.max(...vals);
      const anyNonZero = vals.some((v) => v > 0);
      const grid = el("div", { class: "cmp-grid", style: `grid-template-columns:1.4fr repeat(${players.length},1fr)` });
      grid.append(el("div", { class: "cmp-cell cmp-metric" }, lbl));
      vals.forEach((v) => {
        const w = Math.max(0, Math.min(100, (v / ref) * 100));
        const isBest = anyNonZero && v === best;
        const cell = el("div", { class: "cmp-cell" },
          el("div", { class: "cmp-bar" }, el("div", { class: "cmp-fill" + (neg ? " neg" : "") + (isBest ? " best" : ""), style: `width:${w}%` })),
          el("span", { class: "cmp-val" + (isBest ? " best" : "") }, (Math.round(v * 10) / 10).toString()));
        grid.append(cell);
      });
      out.append(grid);
    });
    out.append(el("p", { class: "pf-note" }, "Valores por 80 min ao longo da época. O destaque assinala o melhor em cada indicador (nos negativos, o mais baixo)."));
  }
  sel.forEach((s) => s.addEventListener("change", build));
  build();
}

/* ================= POSSE DE BOLA (cronómetros) =================
   Dois cronómetros (Tigres / Adversário). Arrancar um pára o outro.
   Atalhos de teclado configuráveis. Tempos finais + percentagens no fim. */
const posseState = {
  ms: { tigres: 0, adv: 0 }, // tempo acumulado em milissegundos
  active: null,              // 'tigres' | 'adv' | null
  since: 0,                  // timestamp em que o cronómetro ativo arrancou
};
function posseKeys() {
  let k = {};
  try { k = JSON.parse(localStorage.getItem("tigres_posse_keys") || "{}"); } catch (e) { k = {}; }
  return { tigres: k.tigres || "a", adv: k.adv || "l", pause: k.pause || " " };
}
function setPosseKeys(k) { localStorage.setItem("tigres_posse_keys", JSON.stringify(k)); }
function posseElapsed(side) {
  let v = posseState.ms[side];
  if (posseState.active === side) v += Date.now() - posseState.since;
  return v;
}
function posseBank() {
  if (posseState.active) { posseState.ms[posseState.active] += Date.now() - posseState.since; posseState.active = null; }
}
function posseActivate(side) {
  if (posseState.active === side) { posseBank(); return; } // tocar de novo = pausa
  posseBank();
  posseState.active = side;
  posseState.since = Date.now();
}
function fmtClock(ms) {
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const mm = String(m).padStart(2, "0"), ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
function keyLabel(k) { return k === " " ? "Espaço" : k.length === 1 ? k.toUpperCase() : k; }

function viewPosse(app) {
  const clube = state.data.meta.clube || "Tigres";
  app.append(el("div", { class: "section-title" }, "Posse de bola — cronómetros"));
  app.append(el("p", { class: "dicas-intro" }, "Enquanto revês o vídeo do jogo, usa os atalhos de teclado para cronometrar a posse de cada equipa. Arrancar um cronómetro pára automaticamente o outro. No fim tens os tempos e as percentagens."));

  const keys = posseKeys();

  const timers = el("div", { class: "posse-timers" });
  const makeCard = (side, nome) => {
    const clock = el("div", { class: "posse-clock" }, fmtClock(posseElapsed(side)));
    const pct = el("div", { class: "posse-pct" }, "");
    const keyTxt = el("strong", {}, keyLabel(keys[side]));
    const card = el("div", { class: "posse-card " + side },
      el("div", { class: "posse-team" }, nome),
      clock,
      pct,
      el("div", { class: "posse-key" }, "Atalho: ", keyTxt),
      el("button", { class: "btn posse-btn", onclick: () => { posseActivate(side); tick(); } }, "Iniciar / Pausar"),
    );
    card._clock = clock; card._pct = pct; card._keyTxt = keyTxt;
    return card;
  };
  const cTigres = makeCard("tigres", clube);
  const cAdv = makeCard("adv", "Adversário");
  timers.append(cTigres, cAdv);

  const status = el("div", { class: "posse-status" }, "");

  // Controlos
  const pauseBtn = el("button", { class: "btn ghost", onclick: () => { posseBank(); tick(); } }, `Pausar tudo (${keyLabel(keys.pause)})`);
  const resetBtn = el("button", { class: "btn danger", onclick: () => {
    if (confirm("Repor ambos os cronómetros a zero?")) { posseState.ms.tigres = 0; posseState.ms.adv = 0; posseState.active = null; tick(); }
  } }, "Repor a zero");
  const controls = el("div", { class: "posse-controls" }, pauseBtn, resetBtn);

  // Painel de vídeo (dropdown de jogo + embed) ao lado dos cronómetros
  const comVideo = (state.data.calendario || []).filter((c) => c.video).sort((a, b) => a.numero - b.numero);
  const videoPanel = el("div", { class: "posse-video" });
  if (comVideo.length) {
    const sel = el("select");
    comVideo.forEach((c) => sel.append(el("option", { value: c.video }, `Jornada ${c.numero} · ${c.casa ? clube + " vs " + c.adversario : c.adversario + " vs " + clube}`)));
    const holder = el("div", { class: "posse-video-holder" });
    const refresh = () => { holder.innerHTML = ""; const emb = videoEmbed(sel.value); if (emb) holder.append(emb); };
    sel.addEventListener("change", refresh);
    videoPanel.append(el("label", {}, "Vídeo do jogo"), sel, holder);
    refresh();
  } else {
    videoPanel.append(el("p", { class: "dicas-note" }, "Sem vídeos disponíveis para já. Quando houver, aparecem aqui para cronometrares ao lado."));
  }

  // Coluna dos cronómetros + estado + controlos
  const timerCol = el("div", { class: "posse-timercol" }, timers, status, controls);
  app.append(el("div", { class: "posse-main" }, videoPanel, timerCol));

  // Configurar atalhos
  const cfg = el("div", { class: "posse-cfg" });
  cfg.append(el("div", { class: "posse-cfg-title" }, "Atalhos de teclado"));
  const caps = {};
  let capturing = null; // 'tigres' | 'adv' | 'pause'
  const mkRow = (which, label) => {
    const val = el("button", { class: "key-cap" }, keyLabel(keys[which]));
    val.addEventListener("click", () => { capturing = which; val.textContent = "Prime uma tecla…"; val.classList.add("capturing"); });
    caps[which] = val;
    return el("div", { class: "posse-cfg-row" }, el("span", {}, label), val);
  };
  cfg.append(mkRow("tigres", clube), mkRow("adv", "Adversário"), mkRow("pause", "Pausar tudo"));
  cfg.append(el("p", { class: "dicas-note" }, "Clica num atalho e prime a tecla que queres. Evita teclas que uses para escrever."));
  app.append(cfg);

  // Gravar posse medida numa jornada existente (overwrite)
  const save = el("div", { class: "posse-save" });
  save.append(el("div", { class: "posse-cfg-title" }, "Guardar na jornada"));
  const jornadas = [...state.data.jornadas].sort((a, b) => a.numero - b.numero);
  if (!jornadas.length) {
    save.append(el("p", { class: "dicas-note" }, "Ainda não há jornadas registadas para gravar."));
  } else {
    const sel = el("select");
    jornadas.forEach((j) => sel.append(el("option", { value: j.numero }, `Jornada ${j.numero} vs ${j.adversario}`)));
    const info = el("p", { class: "dicas-note" }, "Substitui a posse de bola atual da jornada escolhida pelas percentagens medidas acima.");
    const saveMsg = el("div", { class: "posse-status" }, "");
    const doSave = (toGitHub) => async () => {
      const tT = posseElapsed("tigres"), tA = posseElapsed("adv"), tot = tT + tA;
      if (tot <= 0) { saveMsg.className = "posse-status"; saveMsg.style.color = "var(--loss)"; saveMsg.textContent = "❌ Sem tempo medido. Cronometra primeiro."; return; }
      const fracT = Math.round((tT / tot) * 100) / 100; // ex. 0.60
      const num = +sel.value;
      const j = state.data.jornadas.find((x) => x.numero === num);
      if (!j) return;
      j.matchStats = j.matchStats || {};
      j.matchStats["Posse de bola"] = { tigres: fracT, adversario: Math.round((1 - fracT) * 100) / 100 };
      state.data.meta.atualizado = new Date().toISOString();
      saveMsg.style.color = "";
      if (toGitHub) {
        try {
          saveMsg.textContent = "A guardar no GitHub…";
          await saveToGitHub(state.data, `Posse de bola — Jornada ${num}`);
          state.source = "github";
          saveMsg.className = "posse-status on";
          saveMsg.textContent = `✅ Posse guardada e partilhada na Jornada ${num} (${Math.round(fracT * 100)}% / ${Math.round((1 - fracT) * 100)}%).`;
        } catch (e) { saveMsg.className = "posse-status"; saveMsg.style.color = "var(--loss)"; saveMsg.textContent = "❌ " + e.message; }
      } else {
        localStorage.setItem("tigres_cache", JSON.stringify(state.data));
        state.source = "local";
        saveMsg.className = "posse-status on";
        saveMsg.textContent = `✅ Posse guardada localmente na Jornada ${num} (${Math.round(fracT * 100)}% / ${Math.round((1 - fracT) * 100)}%). Lembra-te de a enviar para o GitHub.`;
      }
    };
    const btnGh = el("button", { class: "btn", onclick: doSave(true) }, "Guardar no GitHub");
    const btnLocal = el("button", { class: "btn ghost", onclick: doSave(false) }, "Guardar localmente");
    if (!ghConfigured()) btnGh.disabled = true;
    save.append(field("Jornada", sel), info, el("div", { class: "btnrow" }, btnGh, btnLocal), saveMsg);
  }
  app.append(save);

  // Atualização visual
  function tick() {
    const tT = posseElapsed("tigres"), tA = posseElapsed("adv"), tot = tT + tA;
    cTigres._clock.textContent = fmtClock(tT);
    cAdv._clock.textContent = fmtClock(tA);
    const pT = tot > 0 ? Math.round((tT / tot) * 100) : 0;
    cTigres._pct.textContent = tot > 0 ? pT + "%" : "–";
    cAdv._pct.textContent = tot > 0 ? (100 - pT) + "%" : "–";
    cTigres.classList.toggle("running", posseState.active === "tigres");
    cAdv.classList.toggle("running", posseState.active === "adv");
    status.textContent = posseState.active === "tigres" ? `A contar: ${clube}` : posseState.active === "adv" ? "A contar: Adversário" : "Em pausa";
    status.className = "posse-status " + (posseState.active ? "on" : "");
  }

  const interval = setInterval(tick, 100);
  tick();

  // Teclado
  function onKey(e) {
    const k = (e.key || "").length === 1 ? e.key.toLowerCase() : e.key;
    if (capturing) {
      e.preventDefault();
      keys[capturing] = k;
      setPosseKeys(keys);
      caps[capturing].textContent = keyLabel(k);
      caps[capturing].classList.remove("capturing");
      cTigres._keyTxt.textContent = keyLabel(keys.tigres);
      cAdv._keyTxt.textContent = keyLabel(keys.adv);
      pauseBtn.textContent = `Pausar tudo (${keyLabel(keys.pause)})`;
      capturing = null;
      return;
    }
    if (k === keys.tigres) { e.preventDefault(); posseActivate("tigres"); tick(); }
    else if (k === keys.adv) { e.preventDefault(); posseActivate("adv"); tick(); }
    else if (k === keys.pause) { e.preventDefault(); posseBank(); tick(); }
  }
  document.addEventListener("keydown", onKey);

  // Limpeza ao sair da vista (o tempo continua guardado em posseState)
  viewCleanup = () => { clearInterval(interval); document.removeEventListener("keydown", onKey); posseBank(); };
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
  const statDefs = [["Resultado", "golos"], ["Remates", ""], ["Remates à baliza", ""], ["Cantos", ""], ["Faltas", ""], ["Fora de jogo", ""], ["Posse de bola", "%"], ["Cruzamentos", ""]];
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
  const pcols = [["minutos", "Min"], ["golos", "G"], ["assistencias", "A"], ["remates", "Rem"], ["desarmes", "Des"], ["defesas", "Def"], ["passeFinalizacao", "PF"], ["faltas", "Flt"], ["passesErrados", "PE"], ["perdasBola", "PB"], ["driblesBemSucedidos", "DB"], ["driblesFalhados", "DF"], ["cruzamentosBemSucedidos", "CB"], ["cruzamentosFalhados", "CF"]];
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
