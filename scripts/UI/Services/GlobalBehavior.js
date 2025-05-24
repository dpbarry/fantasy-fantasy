import HackService from "./HackService.js";

export default function setupGlobalBehavior(core) {
    let settingsClicks = 0;

    const settingsButton = document.querySelector("#settings-button");
    if (!settingsButton) return;

    settingsButton.addEventListener("click", () => {
        if (++settingsClicks >= 5) {
            HackService.show(core);
            settingsClicks = 0;
        }
    });
}