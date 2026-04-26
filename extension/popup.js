const BASE_URL = "https://val2-h3cz.onrender.com";

// =========================
// 🔹 Helpers
// =========================
function $(id) {
    return document.getElementById(id);
}

function hasConsent() {
    return localStorage.getItem("consentGiven") === "true";
}

// =========================
// 🔹 Elements
// =========================
const keyInput = $("apiKey");
const consentBox = $("consentBox");
const mainUI = $("mainUI");
const startBtn = $("start");
const acceptBtn = $("acceptBtn");

// =========================
// 🔹 State
// =========================
let appState = {
    status: "",
    slots: "",
    notice: ""
};

// =========================
// 🔹 UI Switch
// =========================
function showConsent() {
    if (consentBox) consentBox.style.display = "block";
    if (mainUI) mainUI.style.display = "none";

    if (consentBox) consentBox.scrollIntoView();
}

function showMainUI() {
    if (consentBox) consentBox.style.display = "none";
    if (mainUI) mainUI.style.display = "block";
}

// =========================
// 🔹 INIT (FIXED BUG)
// =========================
if (!hasConsent()) {
    showConsent();
} else {
    showMainUI();
}

// =========================
// 🔹 Accept
// =========================
if (acceptBtn) {
    acceptBtn.onclick = () => {
        localStorage.setItem("consentGiven", "true");
        showMainUI();
    };
}

// =========================
// 🔹 Message Renderer
// =========================
function renderMessage(type = "info") {
    const box = $("messageBox");
    if (!box) return;

    box.style.display = "block";
    box.className = "";

    if (type === "success") box.classList.add("msg-success");
    if (type === "error") box.classList.add("msg-error");
    if (type === "info") box.classList.add("msg-info");

    let text = "";

    if (appState.status) text += appState.status + "\n\n";
    if (appState.slots !== "") text += "Verification Slots Left: " + appState.slots + "\n\n";
    if (appState.notice) text += "Notice: " + appState.notice;

    box.innerText = text.trim();
}

// =========================
// 🔹 Load Key
// =========================
if (keyInput) {
    keyInput.value = localStorage.getItem("apiKey") || "";
}

// =========================
// 🔹 Credits
// =========================
async function loadCredits() {
    if (!keyInput) return;

    const key = keyInput.value.trim();
    if (!key) return;

    try {
        const res = await fetch(`${BASE_URL}/credits?api_key=${key}`);
        const data = await res.json();

        if (!data.credits) {
            appState.status = "Invalid Inspection Key";
            appState.slots = "";
            renderMessage("error");
        } else {
            appState.status = "Key Verified";
            appState.slots = data.credits;
            renderMessage("success");
        }

    } catch {
        appState.status = "Server error";
        renderMessage("error");
    }
}

if (keyInput) {
    keyInput.addEventListener("change", () => {
        localStorage.setItem("apiKey", keyInput.value);
        loadCredits();
    });
}

// =========================
// 🔹 Notice
// =========================
async function loadNotice() {
    try {
        const res = await fetch(`${BASE_URL}/notice`);
        const data = await res.json();

        if (data.message) {
            appState.notice = data.message;
            renderMessage("info");
        }
    } catch {}
}

loadNotice();

// =========================
// 🔹 Cookie
// =========================
function getCookie(tabUrl) {
    return new Promise((resolve) => {
        chrome.cookies.get({
            url: tabUrl,
            name: "MoodleSession"
        }, resolve);
    });
}

// =========================
// 🔁 Poll
// =========================
async function pollResult(taskId) {
    for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 1500));

        try {
            const res = await fetch(`${BASE_URL}/result/${taskId}`);
            const data = await res.json();

            if (data.notice) appState.notice = data.notice;

            if (data.status === "done") {
                appState.status = "Verification Completed";
                renderMessage("success");

                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs[0]) chrome.tabs.reload(tabs[0].id);
                });

                return;
            }

            if (data.status === "error") {
                appState.status = data.error;
                renderMessage("error");
                return;
            }

        } catch {}
    }

    appState.status = "Processing...";
    renderMessage("info");
}

// =========================
// 🚀 MAIN
// =========================
async function startProcess() {

    // 🔥 FORCE CONSENT
    if (!hasConsent()) {
        showConsent();
        appState.status = "Please accept consent first";
        renderMessage("error");
        return;
    }

    appState.status = "Checking server...";
    renderMessage("info");

    try {
        const health = await fetch(`${BASE_URL}/health`);
        if (!health.ok) throw new Error();
    } catch {
        appState.status = "Server not reachable";
        renderMessage("error");
        return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url) {
        appState.status = "No active tab";
        renderMessage("error");
        return;
    }

    const url = new URL(tab.url);

    if (!url.hostname.endsWith("iitp.ac.in")) {
        appState.status = "Invalid site";
        renderMessage("error");
        return;
    }

    const cookie = await getCookie(tab.url);

    if (!cookie) {
        appState.status = "Session not found";
        renderMessage("error");
        return;
    }

    const cookieString = `MoodleSession=${cookie.value}`;

    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {

            const download = document.querySelector('a[title="Download configuration"]')?.href;

            const sebs = document.querySelector('a[href^="sebs://"]')?.href;

            return {
                page_url: window.location.href,
                download_url: download,
                launch_url: sebs
            };
        }
    }, async (resArr) => {

        const data = resArr?.[0]?.result;

        if (!data || (!data.download_url && !data.launch_url)) {
            appState.status = "No config found";
            renderMessage("error");
            return;
        }

        const body = {
            ...data,
            cookie: cookieString,
            api_key: keyInput?.value.trim()
        };

        try {
            const res = await fetch(`${BASE_URL}/submit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });

            const json = await res.json();

            if (json.notice) appState.notice = json.notice;

            if (!res.ok) {
                appState.status = json.detail;
                renderMessage("error");
                return;
            }

            if (json.mode === "exam") {
                appState.status = "Verification Passed";
                appState.slots = json.credits;
                renderMessage("success");
            } else {
                appState.status = "Developer Mode";
                renderMessage("info");
            }

            pollResult(json.task_id);

        } catch {
            appState.status = "API failed";
            renderMessage("error");
        }
    });
}

// =========================
// 🔘 Button
// =========================
if (startBtn) {
    startBtn.addEventListener("click", startProcess);
}