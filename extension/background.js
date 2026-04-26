chrome.commands.onCommand.addListener((command) => {
    if (command === "start-action") {

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];

            chrome.tabs.sendMessage(tab.id, {
                action: "START"
            });
        });
    }
});