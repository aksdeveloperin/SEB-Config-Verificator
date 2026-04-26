const BASE_URL = "https://val2-h3cz.onrender.com";

const statusEl = document.getElementById("status");
const metaEl = document.getElementById("meta");
const keyInput = document.getElementById("apiKey");

// =========================
// 🔹 Save API key
// =========================
keyInput.value = localStorage.getItem("apiKey") || "";

keyInput.addEventListener("input", () => {
    localStorage.setItem("apiKey", keyInput.value);
});

// =========================
// 🔹 Status UI
// =========================
function setStatus(msg, type = "") {
    statusEl.className = type;
    statusEl.innerText = msg;
}

// =========================
// 🔹 Get Cookie (Promise)
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
// 🔁 Poll result
// =========================
async function pollResult(taskId) {
    for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 1500));

        try {
            const res = await fetch(`${BASE_URL}/result/${taskId}`);
            const data = await res.json();

            if (data.status === "done") {
                setStatus("SUCCESS: Completed", "success");
                console.log("Result:", data.result);

                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    chrome.tabs.reload(tabs[0].id);
                });

                return;
            }

            if (data.status === "error") {
                setStatus(`ERROR: ${data.error}`, "error");
                return;
            }

        } catch (err) {
            console.error(err);
        }
    }

    setStatus("Still processing...", "loading");
}

// =========================
// 🚀 MAIN LOGIC
// =========================
async function startProcess() {
    setStatus("Checking server...", "loading");

    // 🔹 Health check
    try {
        const health = await fetch(`${BASE_URL}/health`);
        if (!health.ok) throw new Error();
    } catch {
        setStatus("ERROR: Server not reachable", "error");
        return;
    }

    setStatus("Working...", "loading");

    // 🔹 Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // 🔒 Restrict to IITP only
    const url = new URL(tab.url);
    if (!url.hostname.endsWith("iitp.ac.in")) {
        setStatus("ERROR: Only works on IITP site", "error");
        return;
    }

    // 🔹 Get correct cookie
    const cookie = await getCookie(tab.url);

    if (!cookie) {
        setStatus("ERROR: Cookie not found", "error");
        return;
    }

    const cookieString = `MoodleSession=${cookie.value}`;
    console.log("Using cookie:", cookieString);

    // 🔹 Extract page data
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {

            function extractLinks() {
                let download = null;
                let launch = null;

                // 🔹 Download config
                const downloadEl = document.querySelector(
                    'a[title="Download configuration"]'
                );

                if (downloadEl) {
                    download = downloadEl.href;
                }

                // 🔹 SEB launch links
                const sebsLinks = document.querySelectorAll('a[href^="sebs://"]');

                if (sebsLinks.length > 0) {

                    for (let el of sebsLinks) {
                        const text = (el.innerText || "").toLowerCase();

                        if (text.includes("launch")) {
                            launch = el.href;
                            break;
                        }
                    }

                    if (!launch) {
                        launch = sebsLinks[0].href;
                    }
                }

                return {
                    page_url: window.location.href,
                    download_url: download,
                    launch_url: launch
                };
            }

            return extractLinks();
        }
    }, async (results) => {

        if (!results || !results[0]) {
            setStatus("ERROR: Script failed", "error");
            return;
        }

        const data = results[0].result;

        if (!data.download_url && !data.launch_url) {
            setStatus("ERROR: No config found", "error");
            return;
        }

        const apiKey = keyInput.value.trim();

        const body = {
            site_url: data.page_url,
            download_url: data.download_url,
            launch_url: data.launch_url,
            cookie: cookieString
        };

        if (apiKey) body.api_key = apiKey;

        console.log("REQUEST BODY:", body);

        // 🔹 Send to backend
        try {
            const res = await fetch(`${BASE_URL}/submit`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(body)
            });

            const json = await res.json();

            if (!res.ok) {
                setStatus(`ERROR: ${json.detail}`, "error");
                return;
            }

            // 🔹 Mode display
            if (json.mode === "peak") {
                setStatus("Peak Mode", "success");
                metaEl.innerText = `Credits left: ${json.credits}`;
            } else {
                setStatus("Normal Mode", "success");
                metaEl.innerText = "";
            }

            // 🔁 Poll result
            pollResult(json.task_id);

        } catch (err) {
            console.error(err);
            setStatus("ERROR: API failed", "error");
        }
    });
}

// =========================
// 🔘 Button click
// =========================
document.getElementById("start").addEventListener("click", startProcess);

// =========================
// ⌨️ Shortcut trigger
// =========================
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "START") {
        startProcess();
    }
});