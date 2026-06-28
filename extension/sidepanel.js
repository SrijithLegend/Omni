// sidepanel.js — Omni Extension Side Panel Logic

const TARGET_URLS = {
  "ChatGPT": "https://chatgpt.com/",
  "Claude": "https://claude.ai/new",
  "Gemini": "https://gemini.google.com/app",
  "Microsoft Copilot": "https://copilot.microsoft.com/",
  "Perplexity": "https://www.perplexity.ai/",
  "Grok": "https://grok.com/",
  "DeepSeek": "https://chat.deepseek.com/",
  "Google AI Studio": "https://aistudio.google.com/prompts/new_chat"
};

// ── State ────────────────────────────────────────────────────────────────────
let currentResult = null;
let currentTargetModel = "ChatGPT";

// ── DOM refs ─────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const conversationInput = $("conversation-input");
const sourceModelSelect = $("source-model");
const targetModelSelect = $("target-model");
const intentInput = $("intent-input");
const btnTransfer = $("btn-transfer");
const btnCapture = $("btn-capture");
const btnCopy = $("btn-copy");
const btnOpenTarget = $("btn-open-target");
const outputSection = $("output-section");
const outputText = $("output-text");
const outputStats = $("output-stats");
const errorSection = $("error-section");
const errorText = $("error-text");
const loadingOverlay = $("loading-overlay");
const captureStatus = $("capture-status");
const captureTextEl = $("capture-text");
const charCount = $("char-count");
const transferHint = $("transfer-hint");
const apiKeyInput = $("api-key-input");
const apiProvider = $("api-provider");
const saveStatus = $("save-status");

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  await loadSettings();
  await checkForCaptured();
  setupEventListeners();
  await loadHistory();
}

async function loadSettings() {
  const data = await chrome.storage.local.get(["omni_api_key", "omni_api_provider"]);
  if (data.omni_api_key) apiKeyInput.value = data.omni_api_key;
  if (data.omni_api_provider) apiProvider.value = data.omni_api_provider;
  // Check for prefilled target from rate-limit banner quick-pick
  const session = await chrome.storage.session.get("omni_prefill_target");
  if (session.omni_prefill_target) {
    const opt = Array.from(targetModelSelect.options).find(o => o.value === session.omni_prefill_target);
    if (opt) targetModelSelect.value = session.omni_prefill_target;
    await chrome.storage.session.remove("omni_prefill_target");
    // Switch to transfer tab and highlight
    switchTab("transfer");
  }
  updateTransferButton();
}

async function checkForCaptured() {
  const data = await chrome.storage.session.get("omni_captured");
  if (data.omni_captured) {
    applyCaptured(data.omni_captured);
  }
}

function applyCaptured(captured) {
  if (!captured?.text) return;
  conversationInput.value = captured.text;
  updateCharCount();
  captureStatus.className = "capture-status success";
  captureStatus.querySelector("svg").innerHTML = `<path d="m5 12 5 5 9-9"/>`;
  const truncNote = captured.truncated ? " ⚠️ truncated" : "";
  captureTextEl.textContent = `${captured.messageCount} messages captured from ${captured.source}${truncNote}`;
  if (captured.source && captured.source !== "Unknown AI") {
    // Try to set the select value; silently ignore if not found
    const opt = Array.from(sourceModelSelect.options).find(o => o.value === captured.source);
    if (opt) sourceModelSelect.value = captured.source;
  }
  if (captured.truncated) {
    transferHint.textContent = "⚠️ Conversation was truncated — only the most recent portion was used.";
    transferHint.style.color = "#f59e0b";
  }
  updateTransferButton();
}

// ── Event Listeners ───────────────────────────────────────────────────────────
function setupEventListeners() {
  // Tabs
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  $("btn-settings").addEventListener("click", () => switchTab("settings"));
  $("btn-history").addEventListener("click", () => switchTab("history"));

  // Conversation input
  conversationInput.addEventListener("input", () => {
    updateCharCount();
    updateTransferButton();
  });

  // Capture
  btnCapture.addEventListener("click", captureCurrentTab);

  // Transfer
  btnTransfer.addEventListener("click", runTransfer);

  // Copy
  btnCopy.addEventListener("click", copyResult);

  // Open target
  btnOpenTarget.addEventListener("click", () => {
    const url = TARGET_URLS[currentTargetModel];
    if (url) chrome.runtime.sendMessage({ type: "OPEN_TAB", url });
  });

  // Settings save
  $("btn-save-key").addEventListener("click", saveSettings);

  // Toggle key visibility
  $("btn-toggle-key").addEventListener("click", () => {
    apiKeyInput.type = apiKeyInput.type === "password" ? "text" : "password";
  });

  // Clear history
  $("btn-clear-history").addEventListener("click", clearHistory);

  // Listen for captures from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "CONVERSATION_CAPTURED") {
      applyCaptured(msg.payload);
    }
  });
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(tabId) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tabId));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.toggle("active", c.id === `tab-${tabId}`));
  if (tabId === "history") loadHistory();
}

// ── Capture ───────────────────────────────────────────────────────────────────
async function captureCurrentTab() {
  btnCapture.disabled = true;
  btnCapture.textContent = "Capturing…";
  captureStatus.className = "capture-status";
  captureTextEl.textContent = "Scanning page…";

  chrome.runtime.sendMessage({ type: "CAPTURE_REQUEST" }, (response) => {
    btnCapture.disabled = false;
    btnCapture.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/><path d="m9 15 2 2 4-4"/></svg> Capture tab`;

    if (chrome.runtime.lastError || response?.error) {
      captureStatus.className = "capture-status error";
      captureTextEl.textContent = response?.error || "Failed — try on an AI chat page";
    } else {
      applyCaptured(response.captured);
    }
  });
}

// ── Transfer ──────────────────────────────────────────────────────────────────
async function runTransfer() {
  const conversation = conversationInput.value.trim();
  const sourceModel = sourceModelSelect.value;
  const targetModel = targetModelSelect.value;
  const intent = intentInput.value.trim();

  const { omni_api_key: apiKey, omni_api_provider: provider } = await chrome.storage.local.get([
    "omni_api_key", "omni_api_provider"
  ]);

  hideOutput();
  hideError();
  showLoading("Compressing context…");
  currentTargetModel = targetModel;

  chrome.runtime.sendMessage({
    type: "TRANSFER_REQUEST",
    payload: { conversation, sourceModel, targetModel, intent, apiKey, apiProvider: provider || "anthropic" }
  }, (response) => {
    hideLoading();
    if (chrome.runtime.lastError || response?.error) {
      showError(response?.error || "Transfer failed. Check your API key in Settings.");
    } else {
      showOutput(response);
      loadHistory(); // refresh history tab
    }
  });
}

// ── Output ────────────────────────────────────────────────────────────────────
function showOutput({ prompt, stats }) {
  currentResult = prompt;
  outputText.textContent = prompt;
  outputStats.textContent = `${stats.outputChars.toLocaleString()} chars · ${stats.compressionPercent}% smaller`;
  btnOpenTarget.innerHTML = `Open ${currentTargetModel} <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
  outputSection.classList.remove("hidden");
  outputSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function hideOutput() { outputSection.classList.add("hidden"); }

function showError(msg) {
  errorText.textContent = msg;
  errorSection.classList.remove("hidden");
}

function hideError() { errorSection.classList.add("hidden"); }

async function copyResult() {
  if (!currentResult) return;
  await navigator.clipboard.writeText(currentResult);
  const orig = btnCopy.innerHTML;
  btnCopy.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m5 12 5 5 9-9"/></svg> Copied!`;
  setTimeout(() => { btnCopy.innerHTML = orig; }, 2000);
}

// ── Loading ───────────────────────────────────────────────────────────────────
function showLoading(msg = "Working…") {
  $("loading-text").textContent = msg;
  loadingOverlay.classList.remove("hidden");
}

function hideLoading() { loadingOverlay.classList.add("hidden"); }

// ── Helpers ───────────────────────────────────────────────────────────────────
function updateCharCount() {
  const n = conversationInput.value.length;
  charCount.textContent = `${n.toLocaleString()} chars`;
}

function updateTransferButton() {
  const hasContent = conversationInput.value.trim().length >= 20;
  btnTransfer.disabled = !hasContent;
  if (!hasContent) {
    transferHint.textContent = "Needs a configured API key and 20+ chars of conversation.";
  } else {
    transferHint.textContent = "Configured API key required. Set one in Settings.";
  }
}

// ── History ───────────────────────────────────────────────────────────────────
async function loadHistory() {
  const { omni_history = [] } = await chrome.storage.local.get("omni_history");
  const list = $("history-list");

  if (omni_history.length === 0) {
    list.innerHTML = `<div class="empty-state muted">No transfers yet. Use the Transfer tab to get started.</div>`;
    return;
  }

  list.innerHTML = omni_history.map(item => `
    <div class="history-item" data-id="${item.id}" data-prompt="${encodeURIComponent(item.prompt)}">
      <div class="history-header">
        <div class="history-models">
          <span>${item.sourceModel}</span>
          <svg class="history-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          <span>${item.targetModel}</span>
          ${item.compression > 0 ? `<span class="muted text-xs">(${item.compression}% smaller)</span>` : ""}
        </div>
        <span class="history-date">${formatDate(item.createdAt)}</span>
      </div>
      ${item.intent ? `<div class="history-preview">${escHtml(item.intent)}</div>` : `<div class="history-preview">${escHtml(item.prompt.slice(0, 80))}…</div>`}
    </div>
  `).join("");

  // Click to restore
  list.querySelectorAll(".history-item").forEach(el => {
    el.addEventListener("click", () => {
      const prompt = decodeURIComponent(el.dataset.prompt);
      currentResult = prompt;
      outputText.textContent = prompt;
      outputStats.textContent = "From history";
      outputSection.classList.remove("hidden");
      switchTab("transfer");
    });
  });
}

async function clearHistory() {
  await chrome.storage.local.remove("omni_history");
  await loadHistory();
}

function formatDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
  return d.toLocaleDateString();
}

function escHtml(str) {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// ── Settings ──────────────────────────────────────────────────────────────────
async function saveSettings() {
  const key = apiKeyInput.value.trim();
  const provider = apiProvider.value;
  await chrome.storage.local.set({ omni_api_key: key, omni_api_provider: provider });
  saveStatus.textContent = "✅ Saved";
  updateTransferButton();
  setTimeout(() => { saveStatus.textContent = ""; }, 2500);
}

// ── Boot ──────────────────────────────────────────────────────────────────────
init();
