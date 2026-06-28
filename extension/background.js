// background.js — Omni Extension Service Worker

// ── Context menu setup ────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "omni-capture",
    title: "📋 Capture conversation for Omni",
    contexts: ["page"],
    documentUrlPatterns: [
      "https://claude.ai/*",
      "https://chatgpt.com/*",
      "https://chat.openai.com/*",
      "https://gemini.google.com/*",
      "https://grok.com/*",
      "https://chat.deepseek.com/*",
      "https://www.perplexity.ai/*",
      "https://copilot.microsoft.com/*",
      "https://aistudio.google.com/*"
    ]
  });

  chrome.contextMenus.create({
    id: "omni-transfer",
    title: "🔀 Transfer to another AI...",
    contexts: ["page"],
    documentUrlPatterns: [
      "https://claude.ai/*",
      "https://chatgpt.com/*",
      "https://chat.openai.com/*",
      "https://gemini.google.com/*",
      "https://grok.com/*",
      "https://chat.deepseek.com/*",
      "https://www.perplexity.ai/*",
      "https://copilot.microsoft.com/*",
      "https://aistudio.google.com/*"
    ]
  });
});

// ── Keyboard commands ─────────────────────────────────────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "open-omni") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.windowId) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    }
  }
  if (command === "capture-conversation") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await captureFromTab(tab.id);
    }
  }
});

// ── Context menu clicks ───────────────────────────────────────────────────────
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === "omni-capture") {
    await captureFromTab(tab.id);
  }

  if (info.menuItemId === "omni-transfer") {
    await captureFromTab(tab.id);
    if (tab.windowId) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    }
  }
});

// ── Extension icon click → open side panel ───────────────────────────────────
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.windowId) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

// ── Message handler ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "CAPTURE_REQUEST") {
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) { sendResponse({ error: "No active tab" }); return; }
      const result = await captureFromTab(tab.id);
      sendResponse(result);
    })();
    return true; // keep channel open for async
  }

  if (msg.type === "TRANSFER_REQUEST") {
    (async () => {
      const result = await runTransfer(msg.payload);
      sendResponse(result);
    })();
    return true;
  }

  if (msg.type === "OPEN_TAB") {
    chrome.tabs.create({ url: msg.url });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "OPEN_SIDEPANEL_WITH_TARGET") {
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.windowId) {
        await chrome.storage.session.set({ omni_prefill_target: msg.targetModel });
        await chrome.sidePanel.open({ windowId: tab.windowId });
      }
      sendResponse({ ok: true });
    })();
    return true;
  }
});

// ── Core: capture conversation from current tab ───────────────────────────────
async function captureFromTab(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractConversationFromPage
    });

    const captured = results?.[0]?.result;
    if (!captured || !captured.text) {
      return { error: "Could not extract conversation from this page." };
    }

    // Persist to storage so sidepanel can read it
    await chrome.storage.session.set({
      omni_captured: {
        text: captured.text,
        source: captured.source,
        url: captured.url,
        capturedAt: Date.now(),
        messageCount: captured.messageCount
      }
    });

    // Notify sidepanel if open
    chrome.runtime.sendMessage({
      type: "CONVERSATION_CAPTURED",
      payload: captured
    }).catch(() => {}); // sidepanel may not be open

    return { ok: true, captured };
  } catch (err) {
    return { error: err.message || "Capture failed" };
  }
}

// ── Core: run AI transfer (calls user's configured API) ───────────────────────
async function runTransfer({ conversation, sourceModel, targetModel, targetStyle, intent, apiKey, apiProvider }) {
  if (!apiKey) {
    return { error: "No API key configured. Open Omni settings to add one." };
  }

  const targetGuidance = {
    ChatGPT: "Use a clear system-style preamble. ChatGPT responds well to numbered context blocks, explicit role framing, and concrete next-step instructions.",
    Claude: "Use XML-style tags like <context>, <decisions>, <task>. Claude excels with structured tags, careful reasoning prompts, and natural language.",
    Gemini: "Use a structured markdown layout with headings. Gemini handles long context well; be explicit about which sources to trust.",
    "Microsoft Copilot": "Be concise and business-oriented. Frame the continuation in terms of deliverables and action items.",
    Perplexity: "Frame as a research continuation. Specify which facts are already established and what new information is needed.",
    Grok: "Direct, conversational tone. State the context plainly and ask the next question or task.",
    DeepSeek: "Technical, precise framing. Use code-fenced blocks for any code-related context and explicit task statements.",
    "Google AI Studio": "Use structured markdown. Specify context clearly with section headers.",
    Other: "Summarize context clearly and state the next task explicitly."
  };

  const styleGuide = targetGuidance[targetModel] || targetGuidance["Other"];
  const userIntentLine = intent?.trim() ? `\n\nUser's stated next step (prioritize this): ${intent.trim()}` : "";

  const systemPrompt = `You are the Context Engine inside Omni, a universal AI conversation bridge. Your job is to take a raw conversation a user had with one AI assistant and produce an optimized continuation prompt for a different AI assistant, so the new model can pick up exactly where the previous one left off.

Rules:
- Preserve all material facts, decisions, constraints, code snippets, file names, identifiers, and unresolved questions.
- Drop pleasantries, restated questions, model refusals, repetition, and ungrounded speculation.
- Compress aggressively without losing reasoning continuity.
- Never invent facts that are not in the source conversation.
- Output ONLY the final prompt the user will paste into the new AI. No meta commentary, no "Here is the prompt", no markdown code fences around the whole output.

The continuation prompt MUST contain these sections, tuned to the target model's preferred style:
1. A brief framing line stating this is a continued conversation transferred from ${sourceModel}.
2. Project / topic summary (2-5 sentences).
3. Key decisions and constraints already agreed upon (bulleted).
4. Relevant artifacts: code, file names, data, links (only those present in the source).
5. Open questions / what was being worked on when the conversation paused.
6. The explicit next task for the new AI to perform.

Target model: ${targetModel}.
Style guidance for ${targetModel}: ${styleGuide}`;

  const userMessage = `Source AI: ${sourceModel}\nTarget AI: ${targetModel}${userIntentLine}\n\n--- BEGIN SOURCE CONVERSATION ---\n${conversation}\n--- END SOURCE CONVERSATION ---\n\nProduce the optimized continuation prompt now.`;

  try {
    // Determine API endpoint based on provider
    let endpoint, headers, body;

    if (apiProvider === "openai" || apiProvider === "chatgpt") {
      endpoint = "https://api.openai.com/v1/chat/completions";
      headers = { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` };
      body = JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
        max_tokens: 2000,
        temperature: 0.3
      });
    } else if (apiProvider === "anthropic" || apiProvider === "claude") {
      endpoint = "https://api.anthropic.com/v1/messages";
      headers = {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      };
      body = JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }]
      });
    } else if (apiProvider === "gemini") {
      endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
      headers = { "Content-Type": "application/json" };
      body = JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        generationConfig: { maxOutputTokens: 2000, temperature: 0.3 }
      });
    } else if (apiProvider === "groq") {
      endpoint = "https://api.groq.com/openai/v1/chat/completions";
      headers = { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` };
      body = JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
        max_tokens: 2000,
        temperature: 0.3
      });
    } else {
      return { error: `Unknown API provider: ${apiProvider}` };
    }

    const resp = await fetch(endpoint, { method: "POST", headers, body });
    if (!resp.ok) {
      const errText = await resp.text();
      return { error: `API error ${resp.status}: ${errText.slice(0, 300)}` };
    }

    const data = await resp.json();
    let outputText = "";

    if (apiProvider === "gemini") {
      outputText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } else if (apiProvider === "anthropic" || apiProvider === "claude") {
      outputText = data.content?.[0]?.text || "";
    } else {
      outputText = data.choices?.[0]?.message?.content || "";
    }

    if (!outputText) return { error: "Empty response from AI." };

    const sourceChars = conversation.length;
    const outputChars = outputText.length;
    const compression = sourceChars > 0 ? Math.max(0, Math.round((1 - outputChars / sourceChars) * 100)) : 0;

    // Save to history
    await saveToHistory({ sourceModel, targetModel, prompt: outputText, compression, intent });

    return {
      ok: true,
      prompt: outputText.trim(),
      stats: { sourceChars, outputChars, compressionPercent: compression }
    };
  } catch (err) {
    return { error: err.message || "Transfer failed" };
  }
}

// ── History persistence ───────────────────────────────────────────────────────
async function saveToHistory({ sourceModel, targetModel, prompt, compression, intent }) {
  const { omni_history = [] } = await chrome.storage.local.get("omni_history");
  const entry = {
    id: Date.now(),
    sourceModel,
    targetModel,
    prompt,
    compression,
    intent: intent || "",
    createdAt: new Date().toISOString()
  };
  // Keep last 50
  const updated = [entry, ...omni_history].slice(0, 50);
  await chrome.storage.local.set({ omni_history: updated });
}

// ── Page scraper (injected into AI tabs) ─────────────────────────────────────
// ── Page scraper (injected into AI tabs) ─────────────────────────────────────
// IMPORTANT: This function runs IN the page context via executeScript.
// No closures over background.js variables — must be fully self-contained.
function extractConversationFromPage() {
  const url = location.href;
  const host = location.hostname;
  const MAX_CHARS = 100_000;

  // ── Platform detection ───────────────────────────────────────────────────
  let source = "Unknown AI";
  if (host.includes("claude.ai"))                source = "Claude";
  else if (host.includes("chatgpt.com") ||
           host.includes("openai.com"))           source = "ChatGPT";
  else if (host.includes("gemini.google.com"))   source = "Gemini";
  else if (host.includes("grok.com"))            source = "Grok";
  else if (host.includes("deepseek.com"))        source = "DeepSeek";
  else if (host.includes("perplexity.ai"))       source = "Perplexity";
  else if (host.includes("copilot.microsoft.com")) source = "Microsoft Copilot";
  else if (host.includes("aistudio.google.com")) source = "Google AI Studio";

  // ── Helpers ──────────────────────────────────────────────────────────────

  // Strip UI chrome noise that appears in innerText of AI chat pages
  const UI_NOISE = [
    /^(copy|copied|like|dislike|regenerate|retry|edit|share|report|flag|delete|pin|bookmark|thumbs up|thumbs down|good response|bad response|report a problem)$/i,
    /^\d+\s*(tokens?|chars?|words?)(\s+used)?$/i,
    /^(loading|thinking|generating|typing)\.{0,3}$/i,
  ];

  function cleanText(raw) {
    if (!raw) return "";
    return raw
      .split("\n")
      .filter(line => {
        const t = line.trim();
        if (!t) return false;
        return !UI_NOISE.some(re => re.test(t));
      })
      .join("\n")
      .trim();
  }

  // Deduplicate: skip if same text already added
  const seenTexts = new Set();
  function addMessage(messages, role, rawText) {
    const text = cleanText(rawText);
    if (!text || text.length < 3) return;
    const key = role + "::" + text.slice(0, 120);
    if (seenTexts.has(key)) return;
    seenTexts.add(key);
    messages.push({ role, text });
  }

  // Extract code blocks preserving language tag from a DOM element
  function getTextWithCode(el) {
    if (!el) return "";
    // Clone so we can annotate without affecting the page
    const clone = el.cloneNode(true);
    // Mark code blocks with language
    clone.querySelectorAll("pre code, pre").forEach(code => {
      const lang = code.className?.match(/language-(\w+)/)?.[1] || "";
      const marker = lang ? `\`\`\`${lang}` : "```";
      code.prepend(document.createTextNode(marker + "\n"));
      code.append(document.createTextNode("\n```"));
    });
    return clone.innerText || clone.textContent || "";
  }

  const messages = [];

  // ── Claude ────────────────────────────────────────────────────────────────
  if (source === "Claude") {
    // Primary: data-testid attributes
    const allTurns = Array.from(
      document.querySelectorAll('[data-testid="human-turn"], [data-testid="assistant-turn"]')
    );

    if (allTurns.length > 0) {
      allTurns.forEach(el => {
        const isHuman = el.getAttribute("data-testid") === "human-turn";
        addMessage(messages, isHuman ? "Human" : "Claude", getTextWithCode(el));
      });
    }

    // Fallback A: class-based
    if (messages.length === 0) {
      document.querySelectorAll(".font-user-message, .font-claude-message").forEach(el => {
        const isHuman = el.classList.contains("font-user-message");
        addMessage(messages, isHuman ? "Human" : "Claude", getTextWithCode(el));
      });
    }

    // Fallback B: walk main container, classify by avatar or role indicator
    if (messages.length === 0) {
      const container = document.querySelector("main") || document.body;
      const candidates = Array.from(container.querySelectorAll("div[class]")).filter(el => {
        const cls = el.className || "";
        return (cls.includes("message") || cls.includes("turn") || cls.includes("bubble")) &&
               el.children.length < 20 && (el.innerText?.trim().length > 10);
      });
      candidates.forEach(el => {
        const cls = (el.className || "").toLowerCase();
        const isHuman = cls.includes("human") || cls.includes("user");
        addMessage(messages, isHuman ? "Human" : "Claude", getTextWithCode(el));
      });
    }
  }

  // ── ChatGPT ───────────────────────────────────────────────────────────────
  else if (source === "ChatGPT") {
    // Primary: data-message-author-role (most reliable)
    const turns = document.querySelectorAll("[data-message-author-role]");
    if (turns.length > 0) {
      turns.forEach(el => {
        const role = el.getAttribute("data-message-author-role");
        addMessage(messages, role === "user" ? "Human" : "ChatGPT", getTextWithCode(el));
      });
    }

    // Fallback A: article elements with role metadata
    if (messages.length === 0) {
      document.querySelectorAll("article[data-testid^='conversation-turn']").forEach(el => {
        const isUser = el.querySelector("img[alt='You']") !== null ||
                       !!el.querySelector("[class*='user']");
        addMessage(messages, isUser ? "Human" : "ChatGPT", getTextWithCode(el));
      });
    }

    // Fallback B: markdown divs — alternating pattern
    if (messages.length === 0) {
      const mdBlocks = Array.from(document.querySelectorAll("div.markdown, [class*='prose']"));
      mdBlocks.forEach((el, i) => {
        // Even = assistant, odd = user in ChatGPT's typical layout
        // But look for sibling context instead
        const parent = el.closest("[data-testid], article");
        const role = parent?.getAttribute("data-testid")?.includes("user") ? "Human" : "ChatGPT";
        addMessage(messages, role, getTextWithCode(el));
      });
    }
  }

  // ── Gemini ────────────────────────────────────────────────────────────────
  else if (source === "Gemini") {
    // Primary: custom elements
    const userEls = document.querySelectorAll("user-query");
    const aiEls = document.querySelectorAll("model-response");

    if (userEls.length > 0 || aiEls.length > 0) {
      // Interleave by DOM position
      const allEls = Array.from(document.querySelectorAll("user-query, model-response"));
      allEls.forEach(el => {
        const isUser = el.tagName.toLowerCase() === "user-query";
        // For model-response, skip "Related questions" section
        if (!isUser) {
          const responseContent = el.querySelector(".response-content, [class*='response']") || el;
          // Strip related questions
          const clone = responseContent.cloneNode(true);
          clone.querySelectorAll("[class*='related'], [class*='suggestions']").forEach(n => n.remove());
          addMessage(messages, "Gemini", getTextWithCode(clone));
        } else {
          addMessage(messages, "Human", getTextWithCode(el.querySelector("p, .query-text") || el));
        }
      });
    }

    // Fallback A: class-based
    if (messages.length === 0) {
      document.querySelectorAll(".query-text").forEach(el =>
        addMessage(messages, "Human", el.innerText?.trim())
      );
      document.querySelectorAll(".model-response-text, .response-text").forEach(el =>
        addMessage(messages, "Gemini", getTextWithCode(el))
      );
    }

    // Fallback B: message-content elements with role attribute
    if (messages.length === 0) {
      document.querySelectorAll("[class*='message-content'], [role='region']").forEach(el => {
        const text = getTextWithCode(el);
        if (text.length > 20) addMessage(messages, "Gemini", text);
      });
    }
  }

  // ── Grok ──────────────────────────────────────────────────────────────────
  else if (source === "Grok") {
    // Tailwind hashed classes — match by substring since they change with builds
    // Strategy: find the scroll container, then walk direct children
    const scrollContainer =
      document.querySelector("[class*='overflow-y-auto']") ||
      document.querySelector("main") ||
      document.body;

    // Try role-indicating class substrings
    const allDivs = Array.from(scrollContainer.querySelectorAll("div[class]"));

    // Grok uses patterns like "UserMessage", "AssistantMessage" or "message-user"
    const userPattern = /usermessage|user[-_]?message|human[-_]?message/i;
    const aiPattern = /assistantmessage|assistant[-_]?message|bot[-_]?message|ai[-_]?message/i;

    let matched = false;
    allDivs.forEach(el => {
      const cls = el.className || "";
      if (userPattern.test(cls)) {
        addMessage(messages, "Human", getTextWithCode(el));
        matched = true;
      } else if (aiPattern.test(cls)) {
        addMessage(messages, "Grok", getTextWithCode(el));
        matched = true;
      }
    });

    // Fallback: find message bubbles by structure (large text blocks inside scroll area)
    if (!matched || messages.length === 0) {
      // Walk top-level children of scroll container, alternating
      const topChildren = Array.from(scrollContainer.children);
      let roleToggle = "Human"; // Grok typically starts with user message
      topChildren.forEach(el => {
        const text = getTextWithCode(el);
        if (text.length < 10) return;
        // Skip nav, header, footer
        if (["NAV","HEADER","FOOTER","BUTTON","INPUT"].includes(el.tagName)) return;
        addMessage(messages, roleToggle, text);
        roleToggle = roleToggle === "Human" ? "Grok" : "Human";
      });
    }
  }

  // ── DeepSeek ──────────────────────────────────────────────────────────────
  else if (source === "DeepSeek") {
    // Primary: role attribute
    const roleDivs = document.querySelectorAll("[class*='bubble'], [class*='message']");
    if (roleDivs.length > 0) {
      roleDivs.forEach(el => {
        const cls = el.className || "";
        const isUser = /user|human/i.test(cls);
        const isAI = /assistant|bot|ds-|deepseek/i.test(cls);
        if (!isUser && !isAI) return;

        // Handle DeepSeek's thinking/reasoning blocks
        const thinkBlock = el.querySelector("[class*='think'], [class*='reasoning'], details");
        let fullText = "";
        if (thinkBlock) {
          const thinkText = cleanText(thinkBlock.innerText || "");
          if (thinkText) fullText += `[DeepSeek Reasoning]: ${thinkText}\n\n`;
          // Remove from clone before getting main text
          const clone = el.cloneNode(true);
          clone.querySelectorAll("[class*='think'], [class*='reasoning'], details").forEach(n => n.remove());
          fullText += getTextWithCode(clone);
        } else {
          fullText = getTextWithCode(el);
        }

        addMessage(messages, isUser ? "Human" : "DeepSeek", fullText);
      });
    }

    // Fallback: data-role or aria attributes
    if (messages.length === 0) {
      document.querySelectorAll("[data-role], [aria-label]").forEach(el => {
        const role = el.getAttribute("data-role") || el.getAttribute("aria-label") || "";
        const isUser = /user|human/i.test(role);
        addMessage(messages, isUser ? "Human" : "DeepSeek", getTextWithCode(el));
      });
    }
  }

  // ── Perplexity ────────────────────────────────────────────────────────────
  else if (source === "Perplexity") {
    // Perplexity's layout: alternating query/answer blocks in a grid or flex container
    // User queries are in bold headers or query containers
    // AI answers are in prose divs

    // Primary: data-testid
    const queryEls = document.querySelectorAll("[data-testid*='query'], [class*='UserMessage']");
    const answerEls = document.querySelectorAll("[data-testid*='answer'], [class*='AnswerBody'], [class*='prose']");

    if (queryEls.length > 0) {
      // Interleave by DOM order
      const allEls = Array.from(
        document.querySelectorAll("[data-testid*='query'], [class*='UserMessage'], [data-testid*='answer'], [class*='AnswerBody']")
      ).filter(el => {
        // Filter out nested duplicates
        const par = el.parentElement;
        return !par?.matches("[data-testid*='query'], [class*='UserMessage'], [data-testid*='answer'], [class*='AnswerBody']");
      });

      allEls.forEach(el => {
        const cls = (el.className || "") + (el.getAttribute("data-testid") || "");
        const isUser = /query|UserMessage/i.test(cls);
        // Skip source citations and related questions
        const clone = el.cloneNode(true);
        clone.querySelectorAll("[class*='source'], [class*='citation'], [class*='related']").forEach(n => n.remove());
        addMessage(messages, isUser ? "Human" : "Perplexity", getTextWithCode(clone));
      });
    }

    // Fallback: prose blocks — filter by minimum length to skip UI noise
    if (messages.length === 0) {
      // Look for alternating structure inside main content area
      const main = document.querySelector("main, [class*='col'], [class*='content']") || document.body;
      // User query often appears as h1 or strong text
      main.querySelectorAll("h1, h2, [class*='query']").forEach(el => {
        const t = cleanText(el.innerText || "");
        if (t.length > 5 && t.length < 500) addMessage(messages, "Human", t);
      });
      // Answers are long prose blocks
      main.querySelectorAll(".prose, [class*='answer'], [class*='markdown']").forEach(el => {
        const clone = el.cloneNode(true);
        clone.querySelectorAll("[class*='source'], [class*='related']").forEach(n => n.remove());
        const t = cleanText(clone.innerText || "");
        if (t.length > 50) addMessage(messages, "Perplexity", getTextWithCode(clone));
      });
    }
  }

  // ── Microsoft Copilot ─────────────────────────────────────────────────────
  else if (source === "Microsoft Copilot") {
    // Primary: cib-chat-turn custom elements
    const turns = document.querySelectorAll("cib-chat-turn");
    if (turns.length > 0) {
      turns.forEach(turn => {
        // Each turn has a user message and a bot response
        const userEl = turn.querySelector(".user-message, [class*='user']") ||
                       turn.shadowRoot?.querySelector(".user-message");
        const botEl  = turn.querySelector(".response-message, cib-message-group, [class*='bot'], [class*='response']") ||
                       turn.shadowRoot?.querySelector("[class*='response']");
        if (userEl) addMessage(messages, "Human", getTextWithCode(userEl));
        if (botEl)  addMessage(messages, "Microsoft Copilot", getTextWithCode(botEl));
      });
    }

    // Fallback A: class-based without shadow DOM
    if (messages.length === 0) {
      document.querySelectorAll("[class*='user-message'], [class*='userMessage']").forEach(el =>
        addMessage(messages, "Human", getTextWithCode(el))
      );
      document.querySelectorAll("[class*='bot-message'], [class*='botMessage'], [class*='assistant']").forEach(el =>
        addMessage(messages, "Microsoft Copilot", getTextWithCode(el))
      );
    }

    // Fallback B: role attribute
    if (messages.length === 0) {
      document.querySelectorAll("[role='row'], [role='listitem']").forEach(el => {
        const text = cleanText(el.innerText || "");
        if (text.length < 10) return;
        const isUser = el.querySelector("img[alt*='user' i], [class*='user']") !== null;
        addMessage(messages, isUser ? "Human" : "Microsoft Copilot", text);
      });
    }
  }

  // ── Google AI Studio ──────────────────────────────────────────────────────
  else if (source === "Google AI Studio") {
    // Primary: ms-chunk and ms-prompt-chunk custom elements
    const chunks = document.querySelectorAll("ms-chunk, ms-prompt-chunk, ms-model-response");
    if (chunks.length > 0) {
      chunks.forEach(el => {
        const tag = el.tagName.toLowerCase();
        const cls = (el.className || "").toLowerCase();
        const isUser = tag.includes("prompt") || cls.includes("user") || cls.includes("input");
        addMessage(messages, isUser ? "Human" : "AI Studio", getTextWithCode(el));
      });
    }

    // Fallback: .chunk elements with role class
    if (messages.length === 0) {
      document.querySelectorAll(".chunk, .turn").forEach(el => {
        const cls = (el.className || "").toLowerCase();
        const isUser = cls.includes("user") || cls.includes("input") || cls.includes("prompt");
        addMessage(messages, isUser ? "Human" : "AI Studio", getTextWithCode(el));
      });
    }

    // Fallback B: mat-card or similar Angular Material components
    if (messages.length === 0) {
      document.querySelectorAll("mat-card, [class*='message']").forEach(el => {
        const cls = (el.className || "").toLowerCase();
        const text = getTextWithCode(el);
        if (text.length < 10) return;
        const isUser = cls.includes("user") || cls.includes("human") || cls.includes("prompt");
        addMessage(messages, isUser ? "Human" : "AI Studio", text);
      });
    }
  }

  // ── Generic fallback for unknown/unmatched pages ───────────────────────────
  if (messages.length === 0) {
    const roleSelectors = [
      { sel: "[role='user'], [data-role='user'], [aria-label*='user' i]", role: "Human" },
      { sel: "[role='assistant'], [data-role='assistant'], [aria-label*='assistant' i]", role: source },
      { sel: "[class*='user-message'], [class*='userMessage'], [class*='human-message']", role: "Human" },
      { sel: "[class*='assistant-message'], [class*='ai-message'], [class*='bot-message']", role: source },
    ];
    roleSelectors.forEach(({ sel, role }) => {
      document.querySelectorAll(sel).forEach(el => {
        addMessage(messages, role, getTextWithCode(el));
      });
    });
  }

  // ── Guard: nothing found ──────────────────────────────────────────────────
  if (messages.length === 0) {
    return {
      text: null,
      source,
      url,
      messageCount: 0,
      truncated: false,
      error: "No conversation found on this page. Make sure you are on an active chat (not the homepage). Scroll up to load older messages, then try again."
    };
  }

  // ── Format as transcript ──────────────────────────────────────────────────
  let text = messages.map(m => `${m.role}: ${m.text}`).join("\n\n");

  // ── Truncate if over limit (keep tail — most recent context) ─────────────
  let truncated = false;
  if (text.length > MAX_CHARS) {
    text = "[Note: conversation truncated to most recent context due to length]\n\n" +
           text.slice(text.length - MAX_CHARS);
    truncated = true;
  }

  return { text, source, url, messageCount: messages.length, truncated };
}
