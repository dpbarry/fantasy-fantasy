import {delay} from "../Utils.js";
import createModalDialog from "../UI/Components/Dialog.js";

export default class HackService {
    static #sequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown'];
    static #currentIndex = 0;
    static #lastKeyTime = 0;
    static #consoleElement = null;
    static #isInitialized = false;
    static #modalDialog = null;

    static initialize(core) {
        if (this.#isInitialized) return;
        this.#isInitialized = true;

        this.#consoleElement = document.createElement('dialog');
        this.#consoleElement.className = 'hackbar';

        const input = document.createElement('div');
        input.contentEditable = "true";
        input.setAttribute('spellcheck', 'false');
        input.className = 'console-input';
        this.#consoleElement.appendChild(input);

        const feedback = document.createElement('div');
        feedback.className = 'console-feedback';

        this.#consoleElement.appendChild(feedback);

        this.#modalDialog = createModalDialog(this.#consoleElement);


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

        input.addEventListener('keydown', handleCommand);
    }


    static async show() {
        if (!document.body.contains(this.#consoleElement)) {
            document.body.appendChild(this.#consoleElement);
        }

        this.#consoleElement.classList.add('visible');

        const input = this.#consoleElement.querySelector('.console-input');
        input.textContent = '';

        this.#modalDialog.open();

        const feedback = this.#consoleElement.querySelector('.console-feedback');
        feedback.textContent = "";
        input.focus();
    }

    static hide() {
        const feedback = this.#consoleElement.querySelector('.console-feedback');
        const cueWrapper = this.#consoleElement.querySelector('div[style*="position: absolute"]');
        feedback.classList.remove('visible');
        if (cueWrapper) cueWrapper.remove();

        this.#consoleElement.classList.remove('visible');

        if (this.#modalDialog.isOpen) {
            this.#modalDialog.close();
        }
    }


    static async executeCommand(command, core) {
        try {
            const feedback = this.#consoleElement.querySelector('.console-feedback');
            const [cmd, ...args] = command.split(' ');

            switch (cmd.toLowerCase()) {
                case 'help':
                    feedback.textContent = 'Commands: help, pause, resume, hardstop, restart, devstart, settime, save, load, delsave';
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
                    feedback.textContent = ! core.isRunning ? "Game is already stopped" : "Force stopped game";
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
                case 'devstart':
                    const devSave = core.storage.devSave;
                    feedback.textContent = devSave ? "Soft restarting game..." : "Error";
                    feedback.classList.add('visible');
                    if (!devSave) return;
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

                    core.storage.clearExcept(devSave);
                    location.reload();
                    break;
                case 'set':
                    if (!args[0] || !args[1] || !args[2]) {
                        feedback.textContent = `Usage: set <manager> <property> <value>`;
                        break;
                    }
                    let setManager = core.managers[args[0]];
                    if (!setManager) {
                        feedback.textContent = `Invalid manager: ${args[0]}`;
                        break;
                    }
                    setManager[args[1]] = args[2];
                    feedback.textContent = `Set ${args[0]}.${args[1]} to ${args[2]}`;
                    break;
                case 'setn':
                    if (!args[0] || !args[1] || !args[2] || !isNaN(args[2])) {
                        feedback.textContent = `Usage: set <manager> <property> <num>`;
                        break;
                    }
                    let setnManager = core.managers[args[0]];
                    if (!setnManager) {
                        feedback.textContent = `Invalid manager: ${args[0]}`;
                        break;
                    }
                    setnManager[args[1]] = parseInt(args[2]);
                    feedback.textContent = `Set ${args[0]}.${args[1]} to ${args[2]}`;
                    break;
                case 'settime':
                    if (!args[0]) {
                        feedback.textContent = `Usage: settime <seconds>`;
                        break;
                    } else if (isNaN(args[0])) {
                        feedback.textContent = `Invalid number: ${args[0]}`;
                        break;
                    }
                    core.clock.totalSeconds = parseInt(args[0]);
                    feedback.textContent = `Set game time to ${core.clock.gameTime({format: 'full'})} ${core.clock.gameDate({format: 'full'})}`;
                    break;
                case 'save':
                    core.storage.recordSave(core);
                    feedback.textContent = `Save recorded`;
                    break;
                case 'load':
                    if (!args[0] || isNaN(args[0])) {
                        feedback.textContent = `Usage: load <index>`;
                        break;
                    }
                    const i = parseInt(args[0]);
                    try {
                        await core.storage.loadSave(i);
                        feedback.textContent = `Restored save at index ${i}`;
                    } catch (error) {
                        console.log(error);
                        feedback.textContent = `No save found at index ${i}`;
                    }
                    break;
                case 'slist':
                    const lines = core.storage.list.map((s, idx) => {
                        const timeAgo = HackService.#formatTimeAgo(s.timestamp);
                        return `[${idx}] ${timeAgo}`;
                    });
                    feedback.innerHTML = lines.length ? lines.join('<br>') : "No saves found";
                    break;
                case 'delsave':
                    if (!args[0] || isNaN(args[0])) {
                        feedback.textContent = `Usage: delsave <index>`;
                        break;
                    }
                    const delIndex = parseInt(args[0]);
                    if (!core.storage.list[delIndex]) {
                        feedback.textContent = `No save to delete at index ${delIndex}`;
                        break;
                    }
                    try {
                        core.storage.deleteSave(delIndex);
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