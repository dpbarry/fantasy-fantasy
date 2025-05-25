import InputService from "./InputService.js";
import {delay} from "../../Utils.js";

export default class HackService {
    static #sequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown'];
    static #currentIndex = 0;
    static #lastKeyTime = 0;
    static #consoleElement = null;
    static #isInitialized = false;


    static {
        const style = document.createElement('style');
        style.textContent = `
        .dev-console {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.95);
                border: 1px solid var(--accent);
                border-radius: 4px;
                z-index: 9999;
                box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
                padding: 5px;
                margin: 0;
                width: 30vw;
                min-width: fit-content;
        }
            
        .dev-console-input {
                width: 300px;
                padding: 4px 2px;
                color: var(--accent);
                font-family: vinque, serif;
                font-size: 1.33rem;
                outline: none;
                background: transparent;
                border: none;
                caret-color: var(--accent);
        }
            
        .dev-console.visible {
                display: block;
                animation: fadeInConsole 0.15s;
        }
            
        .dev-console-feedback {
                color: var(--baseColor);
                font-size: 0.9rem;
                height: fit-content;
                opacity: 0;
                transition: opacity 0.05s;
        }
        
        .dev-console-feedback.visible {
            opacity: 0.75;
        }

            
        @keyframes fadeInConsole {
                from { opacity: 0; transform: translate(-50%, -60%); }
                to { opacity: 1; transform: translate(-50%, -50%); }
            }
        `;
        document.head.appendChild(style);
    }

    static initialize(core) {
        if (this.#isInitialized) return;
        this.#isInitialized = true;

        this.#consoleElement = document.createElement('dialog');
        this.#consoleElement.className = 'dev-console';

        const input = document.createElement('div');
        input.contentEditable = "true";
        input.className = 'dev-console-input';
        input.setAttribute('spellcheck', 'false');

        this.#consoleElement.appendChild(input);

        const feedback = document.createElement('div');
        feedback.className = 'dev-console-feedback';

        this.#consoleElement.appendChild(feedback);


        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hide();
                return;
            }

            const now = Date.now();
            if (now - this.#lastKeyTime > 1000) {
                this.#currentIndex = 0;
            }
            this.#lastKeyTime = now;

            if (e.key === this.#sequence[this.#currentIndex]) {
                this.#currentIndex++;
                if (this.#currentIndex === this.#sequence.length) {
                    this.show(core);
                    this.#currentIndex = 0;
                }
            } else {
                this.#currentIndex = 0;
                if (e.key === this.#sequence[0]) {
                    this.#currentIndex = 1;
                }
            }
        });
    }


    static async show(core) {
        if (!document.body.contains(this.#consoleElement)) {
            document.body.appendChild(this.#consoleElement);
        }

        this.#consoleElement.show();
        this.#consoleElement.classList.add('visible');


        const input = this.#consoleElement.querySelector('.dev-console-input');
        input.textContent = '';
        input.focus();
        input.onblur = () => input.focus();

        const cueWrapper = document.createElement('div');
        cueWrapper.style.cssText = 'position: absolute; right: 0; bottom: -2.75rem;';
        this.#consoleElement.appendChild(cueWrapper);

        const escCue = InputService.getCue('Escape', () => this.hide());
        cueWrapper.appendChild(escCue);
        escCue.classList.add('visible');

        const feedback = this.#consoleElement.querySelector('.dev-console-feedback');

        feedback.textContent = "";


        const handleCommand = async (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const command = input.textContent.trim();
                if (feedback && feedback.classList.contains('visible')) {
                    feedback.classList.remove('visible');
                    await delay(150);
                }
                await this.executeCommand(command, core);
            }
        }


        input.addEventListener('keydown', handleCommand);
    }

    static hide() {
        if (this.#consoleElement) {
            const feedback = this.#consoleElement.querySelector('.dev-console-feedback');
            const cueWrapper = this.#consoleElement.querySelector('div[style*="position: absolute"]');
            feedback.classList.remove('visible');
            if (cueWrapper) cueWrapper.remove();

            this.#consoleElement.classList.remove('visible');
            this.#consoleElement.close();
        }
    }


    static async executeCommand(command, core) {
        try {
            const feedback = this.#consoleElement.querySelector('.dev-console-feedback');
            const [cmd, ...args] = command.split(' ');

            switch (cmd.toLowerCase()) {
                case 'help':
                    core.save();
                    feedback.textContent = 'Commands: help, pause, resume, hardstop, restart, settime, save, savep, load, loadp, delsave';
                    break;
                case 'pause':
                    feedback.textContent = core.clock.isPaused ? "Already paused" : "Game paused";
                    core.clock.pause();
                    break;
                case 'resume':
                    feedback.textContent = !core.clock.isPaused && core.isRunning ? "Nothing was paused" : "Game resumed";
                    core.resume();
                    core.clock.resume();
                    break;
                case 'forcestop':
                    feedback.textContent = core.isRunning ? "Game is already stopped" : "Force stopped game";
                    core.pause();
                    break;
                case 'restart':
                    feedback.textContent = "Restarting game...";
                    feedback.classList.add('visible');
                    await delay(300);
                    core.pause();
                    window.onbeforeunload = null;
                    await new Promise(resolve => {
                        if (core.pendingSave) {
                            const checkSave = setInterval(() => {
                                if (!core.pendingSave) {
                                    clearInterval(checkSave);
                                    resolve();
                                }
                            }, 10);
                        } else {
                            resolve();
                        }
                    });

                    localStorage.clear();
                    location.reload();
                    break;
                case 'settime':
                    if (!args[0]) {
                        feedback.textContent = `Usage: settime <seconds>`;
                        break;
                    } else if (isNaN(args[0])) {
                        feedback.textContent = `Invalid number: ${args[0]}`;
                        break;
                    }
                    feedback.textContent = `Set game time to ${core.clock.gameTime({format: 'full'})} ${core.clock.gameDate({format: 'full'})}`;
                    core.clock.totalSeconds = parseInt(args[0]);
                    break;
                case 'savep':
                    core.saves.record(core.story.currentEpisode, core.story.progress[core.story.currentEpisode], {overwrite: false});
                    feedback.textContent = `Save recorded for ${core.story.currentEpisode} phase ${core.story.progress[core.story.currentEpisode]}`;
                    break;
                case 'save':
                    core.saves.record(core);
                    feedback.textContent = `Save recorded`;
                    break;
                case 'loadp':
                    if (!args[0] || isNaN(args[0])) {
                        feedback.textContent = `Usage: loadep <phaseNumber>`;
                        break;
                    }
                    const episode = core.story.currentEpisode;
                    const phase = parseInt(args[0]);
                    try {
                        await core.saves.jumpToEp(episode, phase);
                        feedback.textContent = `Restored save for ${episode} phase ${phase}`;
                    } catch (error) {
                        console.log(error);
                        feedback.textContent = `No save found for ${episode} phase ${phase}`;
                    }
                    break;
                case 'load':
                    if (!args[0] || isNaN(args[0])) {
                        feedback.textContent = `Usage: load <index>`;
                        break;
                    }
                    const i = parseInt(args[0]);
                    try {
                        await core.saves.jump(i);
                        feedback.textContent = `Restored save at index ${i}`;
                    } catch (error) {
                        console.log(error);
                        feedback.textContent = `No save found at index ${i}`;
                    }
                    break;
                case 'slist':
                    const lines = core.saves.list.map((s, idx) => {
                        const timeAgo = HackService.#formatTimeAgo(s.timestamp);
                        if (s.typeP === "story") return `[${idx}] [${s.episode} ${s.phase}] ${timeAgo}`; else return `[${idx}] ${timeAgo}`;
                    });
                    feedback.innerHTML = lines.length ? lines.join('<br>') : "No saves found";
                    break;
                case 'delsave':
                    if (!args[0] || isNaN(args[0])) {
                        feedback.textContent = `Usage: delsave <index>`;
                        break;
                    }
                    const delIndex = parseInt(args[0]);
                    if (!core.saves.list[delIndex]) {
                        feedback.textContent = `No save to delete at index ${delIndex}`;
                        break;
                    }
                    try {
                        core.saves.delete(delIndex);
                        feedback.textContent = `Deleted save at index ${delIndex}`;
                    } catch (error) {
                        console.error(error);
                        feedback.textContent = `Failed to delete save at index ${delIndex}`;
                    }
                    break;
                default:
                    feedback.textContent = `Unknown command: ${cmd}`;
            }
            feedback.classList.add('visible');

        } catch (error) {
            console.error('Command execution failed:', error);
        }
    }

    static #formatTimeAgo(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;

        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(diff / (1000 * 60));
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (seconds < 60) return `${seconds} seconds ago`;
        if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
        if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
        return `${days} day${days !== 1 ? 's' : ''} ago`;
    }
}