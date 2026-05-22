// ── Global state ─────────────────────────────────────────────────────────────
let lastPredictionContext = "";
let gscData = null;          // full parsed GSC response
let activeTab = "high";

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1 — KEYWORD PREDICTOR
// ═══════════════════════════════════════════════════════════════════════════
document.getElementById("predictForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await runPrediction();
});

async function runPrediction() {
  const btn     = document.getElementById("predictBtn");
  const btnText = btn.querySelector(".btn-text");
  const loader  = btn.querySelector(".btn-loader");

  const payload = {
    keyword:               document.getElementById("keyword").value || "Unknown Keyword",
    search_volume:         document.getElementById("search_volume").value,
    keyword_difficulty:    document.getElementById("keyword_difficulty").value,
    current_ranking:       document.getElementById("current_ranking").value,
    relevance_to_graphura: document.getElementById("relevance_to_graphura").value,
    competitor_presence:   document.getElementById("competitor_presence").value,
    content_type:          document.getElementById("content_type").value,
    search_intent:         document.querySelector('input[name="search_intent"]:checked').value,
  };

  if (!payload.search_volume || !payload.keyword_difficulty ||
      !payload.current_ranking || !payload.relevance_to_graphura) {
    showToast("Please fill in all required fields", "error");
    return;
  }

  btnText.classList.add("hidden");
  loader.classList.remove("hidden");
  btn.disabled = true;

  try {
    const res  = await fetch("/predict", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) showResult(data);
    else showToast("Prediction failed: " + data.error, "error");
  } catch {
    showToast("Network error. Please try again.", "error");
  } finally {
    btnText.classList.remove("hidden");
    loader.classList.add("hidden");
    btn.disabled = false;
  }
}

function showResult(data) {
  document.getElementById("resultEmpty").classList.add("hidden");
  document.getElementById("resultContent").classList.remove("hidden");

  document.getElementById("resultKeyword").textContent = data.keyword ? `"${data.keyword}"` : "";

  const badge = document.getElementById("resultBadge");
  badge.textContent = data.prediction;
  badge.className   = `result-badge ${data.color}`;

  document.getElementById("confidenceVal").textContent = `${data.confidence}%`;
  const fill = document.getElementById("confidenceFill");
  fill.style.width = "0%";
  setTimeout(() => { fill.style.width = `${data.confidence}%`; }, 50);

  const probContainer = document.getElementById("probBars");
  probContainer.innerHTML = "";
  const colorMap = { "High Opportunity": "high", "Medium Opportunity": "medium", "Low Opportunity": "low" };

  Object.entries(data.probabilities).forEach(([label, pct]) => {
    const cls = colorMap[label] || "medium";
    const row = document.createElement("div");
    row.className = "prob-bar-row";
    row.innerHTML = `
      <span class="prob-bar-label">${label}</span>
      <div class="prob-bar-track">
        <div class="prob-bar-fill ${cls}" style="width:0%" data-target="${pct}"></div>
      </div>
      <span class="prob-bar-val">${pct}%</span>`;
    probContainer.appendChild(row);
  });
  setTimeout(() => {
    document.querySelectorAll(".prob-bar-fill").forEach(el => {
      el.style.width = el.dataset.target + "%";
    });
  }, 100);

  lastPredictionContext = `
Keyword: "${data.keyword}"
Prediction: ${data.prediction} | Confidence: ${data.confidence}%
Probabilities: ${JSON.stringify(data.probabilities)}
Search Volume: ${document.getElementById("search_volume").value}
Keyword Difficulty: ${document.getElementById("keyword_difficulty").value}
Current Ranking: ${document.getElementById("current_ranking").value}
Content Type: ${document.getElementById("content_type").value}
Search Intent: ${document.querySelector('input[name="search_intent"]:checked').value}
Competitor Presence: ${document.getElementById("competitor_presence").value}
  `.trim();

  document.getElementById("resultPanel").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function resetForm() {
  document.getElementById("predictForm").reset();
  document.getElementById("resultContent").classList.add("hidden");
  document.getElementById("resultEmpty").classList.remove("hidden");
  lastPredictionContext = "";
}

function askAboutResult() {
  if (!lastPredictionContext) return;
  document.getElementById("assistant").scrollIntoView({ behavior: "smooth" });
  setTimeout(() => {
    document.getElementById("chatInput").value =
      "Explain this keyword prediction and give me actionable SEO recommendations";
    document.getElementById("chatInput").focus();
  }, 600);
}

function fillSample(keyword, volume, difficulty, ranking, relevance, competitor, contentType, intent) {
  document.getElementById("keyword").value              = keyword;
  document.getElementById("search_volume").value        = volume;
  document.getElementById("keyword_difficulty").value   = difficulty;
  document.getElementById("current_ranking").value      = ranking;
  document.getElementById("relevance_to_graphura").value = relevance;
  document.getElementById("competitor_presence").value  = competitor;
  document.getElementById("content_type").value         = contentType;
  const r = document.querySelector(`input[name="search_intent"][value="${intent}"]`);
  if (r) r.checked = true;
  document.getElementById("predictor").scrollIntoView({ behavior: "smooth" });
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2 — GSC DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════
const uploadZone  = document.getElementById("uploadZone");
const fileInput   = document.getElementById("gscFileInput");

// Drag & drop
uploadZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadZone.classList.add("drag-over");
});
uploadZone.addEventListener("dragleave", () => uploadZone.classList.remove("drag-over"));
uploadZone.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadZone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file) processGscFile(file);
});

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) processGscFile(fileInput.files[0]);
});

async function processGscFile(file) {
  document.getElementById("uploadInner").classList.add("hidden");
  document.getElementById("uploadLoading").classList.remove("hidden");

  const formData = new FormData();
  formData.append("file", file);

  try {
    const res  = await fetch("/upload-gsc", { method: "POST", body: formData });
    const data = await res.json();

    if (data.success) {
      gscData = data;
      renderDashboard(data);
      document.getElementById("uploadZone").classList.add("hidden");
      document.getElementById("gscDashboard").classList.remove("hidden");
    } else {
      showToast("Upload failed: " + data.error, "error");
      resetUploadZone();
    }
  } catch (err) {
    showToast("Network error during upload.", "error");
    resetUploadZone();
  }
}

function resetUploadZone() {
  document.getElementById("uploadInner").classList.remove("hidden");
  document.getElementById("uploadLoading").classList.add("hidden");
  fileInput.value = "";
}

function resetDashboard() {
  gscData = null;
  document.getElementById("gscDashboard").classList.add("hidden");
  document.getElementById("uploadZone").classList.remove("hidden");
  resetUploadZone();
  document.getElementById("aiSummaryContent").innerHTML =
    '<p class="muted-text">Click "Generate Summary" to get an AI-powered strategic analysis of your GSC data.</p>';
}

function renderDashboard(data) {
  renderKPIs(data.summary);
  // Accuracy badge
  const badge = document.getElementById("accuracyBadge");
  if (data.summary.accuracy_info) {
    badge.classList.remove("hidden");
    badge.innerHTML = `✅ Model Accuracy vs your labels: <strong>${data.summary.accuracy_info.accuracy}%</strong> &nbsp;·&nbsp; compared ${data.summary.accuracy_info.total_compared} keywords`;
  } else {
    badge.classList.add("hidden");
  }
  renderOppBreakdown(data.summary.opportunity_counts);
  renderChartBars("ctrChart",        data.difficulty_distribution, "Diff");
  renderChartBars("posChart",        data.volume_distribution,     "Vol");
  renderChartBars("intentChart",     data.intent_distribution,     "");
  renderChartBars("contentChart",    data.content_distribution,    "");
  renderChartBars("competitorChart", data.competitor_distribution, "");
  renderTab(activeTab);
  setupTabs();
}

function renderKPIs(summary) {
  const kpis = [
    { icon: "🔑", value: summary.total_keywords.toLocaleString(), label: "Total Keywords" },
    { icon: "🔊", value: summary.avg_volume.toLocaleString(),     label: "Avg Search Volume" },
    { icon: "⚔️",  value: summary.avg_difficulty,                 label: "Avg Difficulty" },
    { icon: "📍", value: summary.avg_ranking,                     label: "Avg Ranking" },
    { icon: "⭐", value: summary.avg_relevance + "/10",           label: "Avg Relevance" },
    { icon: "🚀", value: (summary.opportunity_counts["High Opportunity"] || 0), label: "High Opp." },
  ];
  document.getElementById("kpiGrid").innerHTML = kpis.map(k => `
    <div class="kpi-card">
      <div class="kpi-icon">${k.icon}</div>
      <div class="kpi-value">${k.value}</div>
      <div class="kpi-label">${k.label}</div>
    </div>`).join("");
}

function renderOppBreakdown(counts) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const items = [
    { label: "🚀 High Opportunity", key: "High Opportunity", cls: "high" },
    { label: "📈 Medium Opportunity", key: "Medium Opportunity", cls: "medium" },
    { label: "⚠️ Low Opportunity",  key: "Low Opportunity",  cls: "low" },
  ];
  document.getElementById("oppBreakdown").innerHTML = items.map(item => {
    const count = counts[item.key] || 0;
    const pct   = Math.round(count / total * 100);
    return `
      <div class="opp-row">
        <span class="opp-label">${item.label}</span>
        <div class="opp-track">
          <div class="opp-fill ${item.cls}" style="width:0%" data-target="${pct}"></div>
        </div>
        <span class="opp-count">${count}</span>
      </div>`;
  }).join("");
  setTimeout(() => {
    document.querySelectorAll(".opp-fill").forEach(el => {
      el.style.width = el.dataset.target + "%";
    });
  }, 100);
}

function renderChartBars(containerId, buckets, unit) {
  const max = Math.max(...Object.values(buckets), 1);
  document.getElementById(containerId).innerHTML = Object.entries(buckets).map(([label, val]) => {
    const pct = Math.round(val / max * 100);
    return `
      <div class="chart-bar-row">
        <span class="chart-bar-label">${label}</span>
        <div class="chart-bar-track">
          <div class="chart-bar-fill" style="width:0%" data-target="${pct}"></div>
        </div>
        <span class="chart-bar-val">${val}</span>
      </div>`;
  }).join("");
  setTimeout(() => {
    document.querySelectorAll(`#${containerId} .chart-bar-fill`).forEach(el => {
      el.style.width = el.dataset.target + "%";
    });
  }, 150);
}

function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeTab = btn.dataset.tab;
      renderTab(activeTab);
    });
  });
}

function renderTab(tab) {
  if (!gscData) return;
  const tabMap = {
    high:      { data: gscData.top_high_opportunity, title: "Top High Opportunity Keywords (by model confidence)" },
    medium:    { data: gscData.top_medium,           title: "Top Medium Opportunity Keywords" },
    quickwins: { data: gscData.quick_wins,           title: "Quick Wins — High Opportunity + Low Difficulty (< 50)" },
    lowdiff:   { data: gscData.low_difficulty,       title: "Low Difficulty Gems (difficulty < 30, sorted by volume)" },
  };
  const { data, title } = tabMap[tab] || tabMap.high;
  renderKeywordTable(data, title);
}

function renderKeywordTable(rows, title) {
  if (!rows || rows.length === 0) {
    document.getElementById("tabContent").innerHTML =
      '<p class="muted-text" style="padding:20px">No keywords in this category.</p>';
    return;
  }
  const hasActual = rows[0].actual_label !== undefined;
  document.getElementById("tabContent").innerHTML = `
    <p style="font-size:0.8rem;color:var(--text-dim);margin-bottom:12px">${title} — ${rows.length} keywords</p>
    <div style="overflow-x:auto">
    <table class="kw-table">
      <thead><tr>
        <th>#</th><th>Keyword</th><th>Volume</th><th>Difficulty</th>
        <th>Ranking</th><th>Intent</th><th>Relevance</th>
        <th>Prediction</th><th>Confidence</th>
        ${hasActual ? "<th>Actual</th>" : ""}
      </tr></thead>
      <tbody>
        ${rows.map((r, i) => `
          <tr>
            <td style="color:var(--text-dim)">${i + 1}</td>
            <td><span class="kw-query" title="${r.keyword}">${r.keyword}</span></td>
            <td>${r.search_volume.toLocaleString()}</td>
            <td>
              <div class="score-bar-wrap">
                <div class="score-mini-bar"><div class="score-mini-fill" style="width:${r.keyword_difficulty}%"></div></div>
                <span style="font-size:0.78rem;color:var(--text-dim)">${r.keyword_difficulty}</span>
              </div>
            </td>
            <td>${r.current_ranking}</td>
            <td><span style="font-size:0.78rem;color:var(--text-muted)">${r.search_intent}</span></td>
            <td style="text-align:center">${r.relevance}/10</td>
            <td><span class="opp-badge ${r.predicted_color}">${r.predicted_label.replace(" Opportunity","")}</span></td>
            <td style="font-size:0.82rem;color:var(--text-muted)">${r.confidence}%</td>
            ${hasActual ? `<td><span class="opp-badge ${r.actual_label.toLowerCase().includes('high') ? 'high' : r.actual_label.toLowerCase().includes('medium') ? 'medium' : 'low'}">${r.actual_label.replace(" Opportunity","")}</span></td>` : ""}
          </tr>`).join("")}
      </tbody>
    </table></div>`;
}

async function generateAiSummary() {
  if (!gscData) return;
  const el = document.getElementById("aiSummaryContent");
  el.innerHTML = '<div style="display:flex;align-items:center;gap:10px"><div class="spinner" style="width:24px;height:24px;border-width:2px"></div><span style="color:var(--text-muted)">Generating AI analysis...</span></div>';

  await sendChatMessage(
    "Provide a comprehensive strategic SEO analysis of this GSC data. Include: 1) Key findings, 2) Top 5 priority actions, 3) Content recommendations, 4) Quick wins to implement this week. Be specific and actionable.",
    gscData.ai_context,
    (reply) => {
      el.innerHTML = formatMarkdown(reply);
    }
  );
}

function askGscAI(question) {
  if (!gscData) return;
  document.getElementById("assistant").scrollIntoView({ behavior: "smooth" });
  setTimeout(() => {
    document.getElementById("chatInput").value = question;
    // Pre-load GSC context into chat
    lastPredictionContext = gscData.ai_context;
    document.getElementById("chatInput").focus();
  }, 600);
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3 — AI CHAT ASSISTANT
// ═══════════════════════════════════════════════════════════════════════════
document.getElementById("chatInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

async function sendMessage() {
  const input   = document.getElementById("chatInput");
  const message = input.value.trim();
  if (!message) return;
  input.value = "";

  // Build context: prefer GSC data if available, else prediction context
  const context = gscData ? gscData.ai_context : lastPredictionContext;

  appendMessage("user", escapeHtml(message));
  const typingId = showTyping();

  await sendChatMessage(message, context, (reply) => {
    removeTyping(typingId);
    appendMessage("bot", formatMarkdown(reply));
  });
}

async function sendChatMessage(message, context, callback) {
  try {
    const res  = await fetch("/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, context }),
    });
    const data = await res.json();
    callback(data.success ? data.reply : "Sorry, I couldn't process that. Please try again.");
  } catch {
    callback("Connection error. Please check your network and try again.");
  }
}

function sendSuggestion(btn) {
  document.getElementById("chatInput").value = btn.textContent.replace(/^[\s\S]{1,3}(?=\w)/, "").trim();
  sendMessage();
}

function appendMessage(role, html) {
  const box = document.getElementById("chatBox");
  const div = document.createElement("div");
  div.className = `chat-msg ${role}`;
  div.innerHTML = `
    <div class="msg-avatar">${role === "bot" ? "🤖" : "👤"}</div>
    <div class="msg-bubble">${html}</div>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function showTyping() {
  const box = document.getElementById("chatBox");
  const id  = "typing-" + Date.now();
  const div = document.createElement("div");
  div.className = "chat-msg bot";
  div.id = id;
  div.innerHTML = `
    <div class="msg-avatar">🤖</div>
    <div class="msg-bubble">
      <div class="typing-indicator">
        <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
      </div>
    </div>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return id;
}

function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4 — UTILITIES
// ═══════════════════════════════════════════════════════════════════════════
function formatMarkdown(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")  // escape first
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, "<code style='background:var(--bg3);padding:1px 5px;border-radius:4px;font-size:0.85em'>$1</code>")
    .replace(/^#### (.+)$/gm, "<h4 style='margin:10px 0 4px;font-size:0.9rem'>$1</h4>")
    .replace(/^### (.+)$/gm, "<h3 style='margin:12px 0 6px;font-size:1rem'>$1</h3>")
    .replace(/^## (.+)$/gm, "<h3 style='margin:14px 0 6px'>$1</h3>")
    .replace(/^# (.+)$/gm, "<h2 style='margin:16px 0 8px'>$1</h2>")
    .replace(/^[\*\-] (.+)$/gm, "<li>$1</li>")
    .replace(/^(\d+)\. (.+)$/gm, "<li>$2</li>")
    .replace(/(<li>[\s\S]*?<\/li>)/g, (m) => `<ul style='padding-left:18px;margin:6px 0'>${m}</ul>`)
    .replace(/\n\n/g, "</p><p style='margin-bottom:8px'>")
    .replace(/\n/g, "<br/>")
    .replace(/^(.+)$/, "<p style='margin-bottom:8px'>$1</p>");
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function showToast(msg, type = "info") {
  const toast = document.createElement("div");
  toast.style.cssText = `
    position:fixed;bottom:24px;right:24px;z-index:9999;
    padding:12px 20px;border-radius:10px;font-size:0.88rem;font-weight:500;
    background:${type === "error" ? "#ef4444" : "#6366f1"};color:#fff;
    box-shadow:0 4px 20px rgba(0,0,0,0.4);transition:opacity 0.3s;`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = "0"; setTimeout(() => toast.remove(), 300); }, 3500);
}

// Navbar scroll highlight
const sections = document.querySelectorAll("section[id]");
const navLinks  = document.querySelectorAll(".nav-links a");
window.addEventListener("scroll", () => {
  let current = "";
  sections.forEach(s => { if (window.scrollY >= s.offsetTop - 100) current = s.id; });
  navLinks.forEach(a => {
    a.style.color = a.getAttribute("href") === `#${current}` ? "#e2e8f0" : "";
  });
});
