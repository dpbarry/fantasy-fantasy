import InputService from "./InputService.js";
import GeneralService from "./GeneralService.js";

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
                    await GeneralService.delay(150);
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
                    feedback.textContent = 'Commands: help, pause, resume, hardstop, restart, settime';
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
                    await GeneralService.delay(300);
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
                default:
                    feedback.textContent = `Unknown command: ${cmd}`;
            }
            feedback.classList.add('visible');

        } catch (error) {
            console.error('Command execution failed:', error);
        }
    }
}