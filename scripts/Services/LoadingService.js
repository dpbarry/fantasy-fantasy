// services/LoadingService.js
export default class LoadingService {
    static #overlay = null;
    static #canvas = null;
    static #particles = [];
    static #animationFrame = null;
    static #baseIcon = null;
    static #fillIcon = null;

    static #resizeHandler = () => {};

    static async initialize() {
        this.#overlay = document.getElementById('loading-overlay');
        const iconWrapper = this.#overlay.querySelector('.icon-wrapper');
        this.#baseIcon = iconWrapper.querySelector('.base-icon');
        this.#fillIcon = iconWrapper.querySelector('.fill-icon');

        this.show();
        this.#initParticleSystem();
        await this.preloadAssets();
        return true;
    }

    static async discoverAssets() {
        const assets = {
            fonts: new Set(),
            svgs: new Set()
        };

        // Parse font-face declarations from all style sheets
        for (const sheet of document.styleSheets) {
            try {
                const rules = sheet.cssRules || sheet.rules;
                for (const rule of rules) {
                    if (rule instanceof CSSFontFaceRule) {
                        const src = rule.style.getPropertyValue('src');
                        const urlMatch = src.match(/url\(['"](.*?)['"]\)/);
                        if (urlMatch) {
                            const fontPath = urlMatch[1];
                            const fontFamily = rule.style.getPropertyValue('font-family').replace(/['"]/g, '');
                            assets.fonts.add({
                                path: fontPath,
                                family: fontFamily.trim()
                            });
                        }
                    }
                }
            } catch (e) {
                console.warn('Could not read stylesheet rules:', e);
            }
        }

        // Find all SVG images in HTML
        const svgImages = document.querySelectorAll('img[src$=".svg"]');
        svgImages.forEach(img => assets.svgs.add(img.src));

        // Find SVG references in CSS background-image properties
        const backgroundImages = Array.from(document.styleSheets)
            .flatMap(sheet => {
                try {
                    return Array.from(sheet.cssRules);
                } catch (e) {
                    return [];
                }
            })
            .filter(rule => rule.style && rule.style.backgroundImage)
            .map(rule => {
                const match = rule.style.backgroundImage.match(/url\(['"](.*\.svg)['"]\)/);
                return match ? match[1] : null;
            })
            .filter(Boolean);

        backgroundImages.forEach(svg => assets.svgs.add(svg));

        return assets;
    }

    static async preloadAssets() {
        const assets = await this.discoverAssets();
        const loadingPromises = [];

        for (const font of assets.fonts) {
            const fontSource = font.path;
            const loadPromise = new Promise((resolve) => {
                const fontFace = new FontFace(font.family, `url('${fontSource}')`, {
                    display: 'block'
                });

                fontFace.load().then(() => {
                    document.fonts.add(fontFace);
                    resolve(fontFace);
                }).catch(err => {
                    console.warn(`Failed to load font ${font.family}:`, err);
                    resolve(); // Resolve anyway to continue loading
                });
            });

            loadingPromises.push(loadPromise);
        }


        // Preload SVGs
        for (const svg of assets.svgs) {
            const promise = fetch(svg)
                .then(response => {
                    if (!response.ok) throw new Error(`Failed to load ${svg}`);
                    return response.blob();
                })
                .catch(error => {
                    console.error(`Failed to load SVG ${svg}:`, error);
                });
            loadingPromises.push(promise);
        }

        // Special check for RPGAwesome font
        const rpgAwesomeCheck = new Promise((resolve) => {
            const testIcon = document.createElement('i');
            testIcon.style.position = 'absolute';
            testIcon.style.opacity = '0';
            testIcon.style.pointerEvents = 'none';
            testIcon.className = 'ra ra-crossed-swords';
            document.body.appendChild(testIcon);

            const checkFont = () => {
                const isLoaded = getComputedStyle(testIcon).fontFamily.includes('RPGAwesome');
                if (isLoaded) {
                    document.body.removeChild(testIcon);
                    resolve();
                } else {
                    setTimeout(checkFont, 100);
                }
            };
            checkFont();
        });

        loadingPromises.push(rpgAwesomeCheck);

        let loaded = 0;
        const total = loadingPromises.length;

        // Update loading progress
        const updateProgress = () => {
            loaded++;
            const progress = (loaded / total) * 100;
            if (this.#fillIcon) {
                const fillAmount = 100 - progress;
                this.#fillIcon.style.clipPath = `inset(${fillAmount}% 0 0 0)`;
            }
        };

        // Wait for all assets to load with progress tracking
        await Promise.all(
            loadingPromises.map(promise =>
                promise.then(() => updateProgress())
                    .catch(() => updateProgress())
            )
        );
    }

    static #initParticleSystem() {
        this.#canvas = document.createElement('canvas');
        this.#canvas.style.position = 'absolute';
        this.#canvas.style.top = '0';
        this.#canvas.style.left = '0';
        this.#canvas.style.width = '100%';
        this.#canvas.style.height = '100%';
        this.#canvas.style.pointerEvents = 'none';
        this.#overlay.insertBefore(this.#canvas, this.#overlay.firstChild);

        this.#resizeHandler = () => {
            this.#canvas.width = window.innerWidth;
            this.#canvas.height = window.innerHeight;
        };

        this.#resizeHandler();
        window.addEventListener('resize', this.#resizeHandler);

        const ctx = this.#canvas.getContext('2d');

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
                this.life = 0.7 + Math.random() * 0.3;
                this.maxLife = this.life;
                const hue = 15 + Math.random() * 35;
                const saturation = 80 + Math.random() * 20;
                const lightness = 50 + Math.random() * 20;
                this.color = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
            }

            update() {
                this.x += Math.cos(this.angle) * this.speed;
                this.y += Math.sin(this.angle) * this.speed;
                this.life -= 0.003;

                if (this.x < 0) this.x = LoadingService.#canvas.width;
                if (this.x > LoadingService.#canvas.width) this.x = 0;
                if (this.y < 0) this.y = LoadingService.#canvas.height;
                if (this.y > LoadingService.#canvas.height) this.y = 0;

                if (this.life <= 0) this.reset();
            }

            draw(ctx) {
                ctx.globalAlpha = (this.life / this.maxLife) * 0.6;
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        const particleCount = Math.floor((this.#canvas.width * this.#canvas.height) / 10000);
        this.#particles = Array.from({ length: particleCount }, () => new Particle());

        const animate = () => {
            if (this.#overlay.classList.contains('hidden')) {
                cancelAnimationFrame(this.#animationFrame);
                return;
            }

            ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
            this.#particles.forEach(particle => {
                particle.update();
                particle.draw(ctx);
            });

            this.#animationFrame = requestAnimationFrame(animate);
        };

        animate();
    }

    static show() {
        if (this.#fillIcon) {
            this.#fillIcon.style.clipPath = 'inset(100% 0 0 0)';
        }
        this.#overlay.classList.remove('hidden');
    }

    static hide() {
        window.removeEventListener('resize', this.#resizeHandler);
        if (this.#fillIcon) {
            this.#fillIcon.style.clipPath = 'inset(0 0 0 0)';
        }
        setTimeout(() => {
            this.#overlay.classList.add('hidden');
        }, 300); // Give time for the fill animation to complete
    }
}