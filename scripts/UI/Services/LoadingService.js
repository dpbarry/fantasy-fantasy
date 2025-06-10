export default class LoadingService {
    static #overlay = null;
    static #canvas = null;
    static #particles = [];
    static #animationFrame = null;
    static #fillIcon = null;
    static _loadedCount = 0;

    static #resizeHandler = () => {
    };

    static #warningTimeout;
    static #warningNote;

    static BASE = (() => {
        const path = window.location.pathname;
        return path.endsWith('/')
            ? path
            : path.substring(0, path.lastIndexOf('/') + 1);
    })();

    static async initialize() {
        this.#overlay = document.getElementById('loading-overlay');
        this.#fillIcon = this.#overlay.querySelector('.filling-icon');
        this.show();
        this.#initParticleSystem();

        if ('serviceWorker' in navigator) {
            try {
                await navigator.serviceWorker.register(this.BASE + 'sw.js');
                await navigator.serviceWorker.ready;
            } catch (err) {
                console.warn('SW registration/activation failed:', err);
            }
        }

        this.#setupLoadingWarning();
        await this.preloadAssets();
        this.#clearLoadingWarning();
        return true;
    }

    static #setupLoadingWarning() {
        this.#warningTimeout = setTimeout(() => {
            if (!this.#warningNote) {
                this.#warningNote = document.createElement('p');
                this.#warningNote.innerText = "Loading longer than expected, check network or refresh...";
                Object.assign(this.#warningNote.style, {
                    position: 'absolute',
                    bottom: '-20px',
                    whiteSpace: 'nowrap',
                    color: 'var(--lightBaseColor)',
                    fontSize: '0.9rem',
                    textAlign: 'center',
                });
                this.#fillIcon.append(this.#warningNote);
            }
        }, 12000);
    }

    static #clearLoadingWarning() {
        clearTimeout(this.#warningTimeout);
        if (this.#warningNote) {
            this.#warningNote.remove();
            this.#warningNote = null;
        }
    }

    static async preloadAssets() {
        const response = await fetch(this.BASE + 'manifest.json');
        const manifest = await response.json();
        const urls = Object.values(manifest);
        const total = urls.length;
        this._loadedCount = 0;

        const preloadContainer = document.createElement('div');
        preloadContainer.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;opacity:0;';
        document.body.appendChild(preloadContainer);

        const promises = urls.map(url => {
            const fullUrl = url.startsWith('http') ? url : this.BASE + url;

            if (fullUrl.endsWith('.svg') || fullUrl.endsWith('.png') || fullUrl.endsWith('.jpg') || fullUrl.endsWith('.jpeg') || fullUrl.endsWith('.webp')) {
                return new Promise(resolve => {
                    const img = new Image();
                    img.onload = img.onerror = () => {
                        img.remove(); // Cleanup after load/error
                        resolve();
                    };
                    img.src = fullUrl;
                    preloadContainer.appendChild(img);
                }).finally(() => this.#updateProgress(total));

            } else if (fullUrl.endsWith('.woff') || fullUrl.endsWith('.woff2') || fullUrl.endsWith('.ttf') || fullUrl.endsWith('.otf')) {
                const family = fullUrl.split('/').pop().split('.')[0];
                return new FontFace(family, `url('${fullUrl}')`)
                    .load()
                    .then(ff => document.fonts.add(ff))
                    .catch(err => console.warn(`Font load failed: ${family}`, err))
                    .finally(() => this.#updateProgress(total));

            } else {
                this.#updateProgress(total);
                return Promise.resolve();
            }
        });

        await Promise.all(promises);
        preloadContainer.remove();
    }


    static #updateProgress(total) {
        this._loadedCount++;
        const pct = (this._loadedCount / total) * 100;
        if (this.#fillIcon) {
            this.#fillIcon.style.setProperty('--prog', `${pct}%`);
        }
    }

    static #initParticleSystem() {
        class Particle {
            constructor() {
                this.reset();
            }

            reset() {
                this.x = Math.random() * LoadingService.#canvas.width;
                this.y = Math.random() * LoadingService.#canvas.height;
                this.speed = 0.5 + Math.random();
                this.angle = Math.random() * Math.PI * 2;
                this.size = 1 + Math.random() * 2;
                this.life = this.maxLife = 0.7 + Math.random() * 0.3;
                const hue = 15 + Math.random() * 35;
                this.color = `hsl(${hue},${80 + Math.random() * 20}%,${50 + Math.random() * 20}%)`;
            }

            update() {
                this.x = (this.x + Math.cos(this.angle) * this.speed + LoadingService.#canvas.width) % LoadingService.#canvas.width;
                this.y = (this.y + Math.sin(this.angle) * this.speed + LoadingService.#canvas.height) % LoadingService.#canvas.height;
                if ((this.life -= 0.003) <= 0) this.reset();
            }

            draw(c) {
                const fade = (this.life / this.maxLife);
                c.globalAlpha = Math.pow(fade, 0.5) * 0.6;
                c.fillStyle = this.color;
                c.beginPath();
                c.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                c.fill();
            }
        }

        this.#canvas = document.createElement('canvas');
        this.#canvas.width = window.innerWidth;
        this.#canvas.height = window.innerHeight;

        Object.assign(this.#canvas.style, {
            position: 'absolute', top: '0', left: '0', width: '100%', height: '100%', pointerEvents: 'none',
        });
        this.#overlay.insertBefore(this.#canvas, this.#overlay.firstChild);

        const ctx = this.#canvas.getContext('2d');
        this.#particles = Array.from({length: Math.min(Math.floor((this.#canvas.width * this.#canvas.height) / 15000), 1000)}, () => new Particle());

        this.#resizeHandler = () => {
            this.#canvas.width = window.innerWidth;
            this.#canvas.height = window.innerHeight;
            const targetCount = Math.min(Math.floor((this.#canvas.width * this.#canvas.height) / 15000), 1000);

            const currentCount = this.#particles.length;
            if (currentCount < targetCount) {
                for (let i = 0; i < targetCount - currentCount; i++) {
                    this.#particles.push(new Particle());
                }
            } else if (currentCount > targetCount) {
                this.#particles.splice(targetCount);
            }
        };

        window.addEventListener('resize', this.#resizeHandler);

        const animate = () => {
            if (this.#overlay.classList.contains('hidden')) {
                return cancelAnimationFrame(this.#animationFrame);
            }
            ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
            this.#particles.forEach(p => {
                p.update();
                p.draw(ctx);
            });
            this.#animationFrame = requestAnimationFrame(animate);
        };
        animate();
    }

    static show() {
        this.#overlay.classList.remove('hidden');
    }

    static hide() {
        return new Promise((resolve) => {
            if (this.#fillIcon) {
                this.#fillIcon.style.setProperty("--prog", "100%");
            }
            setTimeout(() => {
                this.#overlay.classList.add('hidden');
                window.removeEventListener('resize', this.#resizeHandler);
                resolve();
            }, 430);
        });
    }
}
