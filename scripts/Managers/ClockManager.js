export default class ClockManager {
    #realTimeListeners;
    #gameTimeListeners;

    constructor() {
        // Constants
        this.SECONDS_PER_MINUTE = 60;
        this.SECONDS_PER_HOUR = 3600;        // 60 * 60
        this.SECONDS_PER_DAY = 86400;        // 24 * 60 * 60
        this.SECONDS_PER_MONTH = 2592000;    // 30 * 24 * 60 * 60
        this.SECONDS_PER_YEAR = 31104000;    // 360 * 24 * 60 * 60

        // State
        this.totalSeconds = (this.SECONDS_PER_MONTH*4) + (this.SECONDS_PER_DAY*8)
                                + 60 * 60 * 7 + 60 * 22 + 11; // start at 07:22
        this.startYear = 581;
        this.timeScale = 1;
        this.isPaused = false;

        this.#realTimeListeners = new Map();
        this.#gameTimeListeners = new Map();

        this.months = [
            'Snowmoon', 'Bitterfrost', 'Icemelt',
            'Rainbloom', 'Greentime', 'Warmreach',
            'Sunpeak', 'Bountymonth', 'Windloom',
            'Driftwane', 'Mistrise', 'Holymonth'
        ];
    }

    advance(dt) {
        if (this.isPaused) return;
        const previousSeconds = this.totalSeconds;
        this.totalSeconds += dt * this.timeScale;

        this.#realTimeListeners.forEach((config, listener) => {
            const {interval, lastTrigger, oneTime} = config;
            if (Date.now() - lastTrigger >= interval * 1000) { // Convert to milliseconds
                listener(dt);
                if (oneTime) {
                    this.#realTimeListeners.delete(listener);
                } else {
                    config.lastTrigger = Date.now();
                }
            }
        });

        this.#gameTimeListeners.forEach((config, listener) => {
            const {interval, lastTrigger, oneTime} = config;
            if (this.totalSeconds - lastTrigger >= interval) {
                listener(this.totalSeconds - previousSeconds);
                if (oneTime) {
                    this.#gameTimeListeners.delete(listener);
                } else {
                    config.lastTrigger = this.totalSeconds;
                }
            }
        });
    }

    subscribeRealTime(listener, options = {}) {
        const config = {
            interval: options.interval || 0, // in seconds
            lastTrigger: Date.now(),
            oneTime: options.oneTime || false
        };
        this.#realTimeListeners.set(listener, config);
        return listener;
    }

    subscribeGameTime(listener, options = {}) {
        const config = {
            interval: options.interval || 0, // in game seconds
            lastTrigger: this.totalSeconds,
            oneTime: options.oneTime || false
        };
        this.#gameTimeListeners.set(listener, config);
        return listener;
    }

    unsubscribe(listener) {
        this.#realTimeListeners.delete(listener);
        this.#gameTimeListeners.delete(listener);
    }

    gameDate(options = {format: null | 'full' | 'short' | 'numeric'}) {
        let remaining = this.totalSeconds;

        const years = Math.floor(remaining / this.SECONDS_PER_YEAR);
        remaining %= this.SECONDS_PER_YEAR;

        const months = Math.floor(remaining / this.SECONDS_PER_MONTH);
        remaining %= this.SECONDS_PER_MONTH;

        const days = Math.floor(remaining / this.SECONDS_PER_DAY);
        remaining %= this.SECONDS_PER_DAY;

        const hours = Math.floor(remaining / this.SECONDS_PER_HOUR);
        remaining %= this.SECONDS_PER_HOUR;

        const minutes = Math.floor(remaining / this.SECONDS_PER_MINUTE);
        const seconds = Math.floor(remaining % this.SECONDS_PER_MINUTE);

        const date = {
            year: this.startYear + years,
            month: months,
            day: days + 1,
            hour: hours,
            minute: minutes,
            second: seconds
        };

        switch (options.format) {
            case 'verbose':
                return `${this.ordinal(date.day)} ${this.months[date.month]} (${this.getSeason()}), ${date.year}`;
            case 'full':
                return `${date.day} ${this.months[date.month]}, ${date.year}`;
            case 'short':
                return `${date.day} ${this.months[date.month].substring(0, 3)} ${date.year}`;
            case 'numeric':
                return `${date.month.toString().padStart(2, '0')}/${date.day.toString().padStart(2, '0')}/${date.year}`;
            default:
                return date;
        }
    }

    ordinal(n) {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    }

    getSeason() {
        return ['Winter', 'Spring', 'Summer', 'Autumn'][Math.floor(this.gameDate().month / 3)];
    }

    gameTime(options = {format: null | 'full' | 'short'}) {
        const date = this.gameDate();
        const hours = date.hour.toString().padStart(2, '0');
        const minutes = date.minute.toString().padStart(2, '0');
        const seconds = date.second.toString().padStart(2, '0');

        switch (options.format) {
            case 'full':
                return `${hours}:${minutes}:${seconds}`;
            case 'short':
                return `${hours}:${minutes}`;
            default:
                return `${hours}:${minutes}`;
        }
    }

    pause() {
        this.isPaused = true;
    }

    resume() {
        this.isPaused = false;
    }

    serialize() {
        const {core, ...rest} = this;
        return rest;
    }

    deserialize(data) {
        Object.assign(this, data);
    }

}