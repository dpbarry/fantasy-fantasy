// Particle effects + DOM-driven animations on a single canvas + class hooks.
// One animation loop, reused across all callers. Reads --accent at use-time so
// theme switches are honored.
//
// Tiered vocabulary (whisper → thunderclap):
//
//   pulse(el)              outline glow swell+fade. Subtle hint a thing is alive.
//   crackle(el)            red shake + flash. Action denied / can't afford.
//   floatText(el, "+10")   text rises and fades from element. Resource gain/drain.
//   shimmer(el)            diagonal light-sweep across element. Value changed.
//   embers(x, y)           physics-based sparks. Theurgy click, micro-celebrations.
//   ribbon(fromEl, toEl)   particle arc travelling between two elements.
//   crossfade(from, to)    panel transition: out fades down, in fades up.
//   pageTurn(container, dir) tab-switch sweep (used internally by panel show()).
//   bloom(x, y)            six-layer plasma pulse. Major unlock, achievement.
//   wave({ origin })       global CRT shimmer ripple. Era change, prestige, prologue end.
//
// All accept an optional `intensity: 'subtle' | 'medium' | 'loud'`.
// All have `*At(el)` overloads where they take coordinates.

const TWO_PI = Math.PI * 2;

let canvas = null;
let ctx = null;
let particles = [];
let running = false;

// ── Loop ─────────────────────────────────────────────────────────

function ensureLoop() {
    if (running || !canvas || !ctx) return;
    running = true;
    requestAnimationFrame(tick);
}

function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        if (p.update(p) === false) {
            particles.splice(i, 1);
            continue;
        }
        const blend = p.blend || 'source-over';
        if (blend !== 'source-over') {
            ctx.save();
            ctx.globalCompositeOperation = blend;
            p.draw(p, ctx);
            ctx.restore();
        } else {
            p.draw(p, ctx);
        }
    }

    if (particles.length > 0) {
        requestAnimationFrame(tick);
    } else {
        running = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

// ── Helpers ──────────────────────────────────────────────────────

function getAccentHsl() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    return raw || 'hsl(190, 82%, 55%)';
}

function hslWithAlpha(hsl, alpha) {
    return hsl.replace('hsl', 'hsla').replace(')', `, ${alpha.toFixed(3)})`);
}

function rectCenter(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const easeOutQuart = t => 1 - Math.pow(1 - t, 4);
const easeOutExpo  = t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);

const prefersReducedMotion = () =>
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// Add a class for a duration, then remove it. Returns a Promise that resolves
// when animationend fires (or duration elapses, whichever comes first).
function flashClass(el, className, fallbackMs = 1000) {
    if (!el) return Promise.resolve();
    el.classList.add(className);
    return new Promise(resolve => {
        let done = false;
        const cleanup = () => {
            if (done) return;
            done = true;
            el.classList.remove(className);
            el.removeEventListener('animationend', onEnd);
            resolve();
        };
        const onEnd = (e) => {
            if (e.target !== el) return;
            cleanup();
        };
        el.addEventListener('animationend', onEnd);
        setTimeout(cleanup, fallbackMs);
    });
}

// ── DOM-driven effects ────────────────────────────────────────────

function pulse(el, opts = {}) {
    if (!el) return;
    const intensity = opts.intensity ?? 'medium';
    const cls =
        intensity === 'subtle' ? 'effect-pulse-subtle' :
        intensity === 'loud'   ? 'effect-pulse-loud'   :
                                 'effect-pulse';
    return flashClass(el, cls, 700);
}

function crackle(el, opts = {}) {
    if (!el) return;
    const cls = opts.intensity === 'subtle' ? 'effect-crackle-subtle' : 'effect-crackle';
    return flashClass(el, cls, 400);
}

function shimmer(el, opts = {}) {
    if (!el) return;

    // Ensure positioned ancestor for the absolute overlay.
    const computed = getComputedStyle(el);
    let restorePosition = false;
    if (computed.position === 'static') {
        el.style.position = 'relative';
        restorePosition = true;
    }

    const overlay = document.createElement('div');
    overlay.className = 'effect-shimmer-overlay';
    el.appendChild(overlay);

    const cleanup = () => {
        overlay.remove();
        if (restorePosition) el.style.position = '';
    };

    const sweep = overlay.querySelector?.('::before');
    // ::before isn't queryable; rely on the overlay's own animationend bubble.
    overlay.addEventListener('animationend', cleanup, { once: true });
    setTimeout(cleanup, opts.duration ?? 900);
}

function floatText(el, text, opts = {}) {
    if (!el) return;
    const kind = opts.kind ?? 'neutral';
    const node = document.createElement('div');
    node.className = `effect-float-text ${kind}`;
    node.textContent = text;

    const r = el.getBoundingClientRect();
    const x = (opts.x ?? r.left + r.width / 2);
    const y = (opts.y ?? r.top + r.height / 4);
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;

    document.body.appendChild(node);
    const remove = () => node.remove();
    node.addEventListener('animationend', remove, { once: true });
    setTimeout(remove, 1100);
}

function crossfade(fromEl, toEl, opts = {}) {
    const dur = opts.duration ?? 220;
    if (fromEl) flashClass(fromEl, 'effect-crossfade-out', dur + 100);
    if (toEl) {
        // Allow caller to swap visibility around this frame; the IN class is
        // safe to apply even if the element is already visible.
        requestAnimationFrame(() => flashClass(toEl, 'effect-crossfade-in', dur + 100));
    }
}

function pageTurn(container, direction = 'right', opts = {}) {
    // Lightweight pass-through to crossfade for now. Direction reserved for a
    // future masked-sweep variant that uses `direction` to animate translate.
    if (!container) return;
    crossfade(container, container, opts);
}

function wave(opts = {}) {
    if (prefersReducedMotion()) return;

    const intensity = opts.intensity ?? 'medium';
    const duration =
        intensity === 'subtle' ? 600 :
        intensity === 'loud'   ? 1200 :
                                 900;

    const overlay = document.createElement('div');
    overlay.className = 'effect-wave';
    overlay.style.setProperty('--wave-duration', `${duration}ms`);

    const origin = opts.origin ?? 'center';
    let originStr = '50% 50%';
    if (origin && typeof origin === 'object' && 'getBoundingClientRect' in origin) {
        const c = rectCenter(origin);
        originStr = `${c.x}px ${c.y}px`;
    } else if (origin && typeof origin === 'object') {
        originStr = `${origin.x}px ${origin.y}px`;
    } else if (origin === 'top') {
        originStr = '50% 0%';
    } else if (origin === 'bottom') {
        originStr = '50% 100%';
    }
    overlay.style.setProperty('--wave-origin', originStr);

    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), duration + 100);
}

// ── Embers (physics-based sparks, optional motion-streak trail) ──

function embers(x, y, opts = {}) {
    if (!ctx) return;
    const count      = opts.count      ?? 6;
    const lifespan   = opts.lifespan   ?? 70;
    const speedMin   = opts.speedMin   ?? 1;
    const speedRange = opts.speedRange ?? 1.5;
    const color      = opts.color      ?? getAccentHsl();
    const gravity    = opts.gravity    ?? 0.05;
    const drag       = opts.drag       ?? 0.97;
    const sizeBase   = opts.size       ?? 1;
    const trail      = opts.trail      ?? false;
    const blend      = opts.blend      ?? 'screen';
    const upBias     = opts.upBias     ?? 0.8;

    for (let i = 0; i < count; i++) {
        const angle = Math.random() * TWO_PI;
        const speed = speedMin + Math.random() * speedRange;
        particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed * 0.6 - (upBias + Math.random() * 0.6),
            size: (0.8 + Math.random() * 0.7) * sizeBase,
            age: 0,
            lifespan,
            blend,
            update(p) {
                p.vx *= drag;
                p.vy = p.vy * drag + gravity;
                p.x += p.vx;
                p.y += p.vy;
                p.age++;
                return p.age < p.lifespan;
            },
            draw(p, c) {
                const t = p.age / p.lifespan;
                const alpha = Math.pow(1 - t, 1.4);
                const speedNow = Math.hypot(p.vx, p.vy);

                if (trail && speedNow > 0.4) {
                    const trailLen = Math.min(speedNow * 4.5, 16);
                    const ux = p.vx / speedNow;
                    const uy = p.vy / speedNow;
                    const tx = p.x - ux * trailLen;
                    const ty = p.y - uy * trailLen;
                    const grad = c.createLinearGradient(tx, ty, p.x, p.y);
                    grad.addColorStop(0, hslWithAlpha(color, 0));
                    grad.addColorStop(1, hslWithAlpha(color, alpha * 0.85));
                    c.strokeStyle = grad;
                    c.lineWidth = Math.max(0.6, p.size * 1.3);
                    c.lineCap = 'round';
                    c.beginPath();
                    c.moveTo(tx, ty);
                    c.lineTo(p.x, p.y);
                    c.stroke();
                }

                c.fillStyle = hslWithAlpha(color, alpha);
                c.beginPath();
                c.arc(p.x, p.y, p.size, 0, TWO_PI);
                c.fill();
            }
        });
    }
    ensureLoop();
}

// ── Bloom (layered AAA pulse) ────────────────────────────────────

function bloom(x, y, opts = {}) {
    if (!ctx) return;
    const color = opts.color ?? getAccentHsl();
    const intensity = opts.intensity ?? 'medium';
    const baseScale = opts.scale ?? 1;
    const scale = baseScale * (intensity === 'subtle' ? 0.7 : intensity === 'loud' ? 1.4 : 1);

    // Layer 1 — CORE FLASH: brief white-hot punch.
    particles.push({
        x, y, age: 0, lifespan: 14, blend: 'screen',
        baseRadius: 22 * scale,
        update(p) { p.age++; return p.age < p.lifespan; },
        draw(p, c) {
            const t = p.age / p.lifespan;
            const r = p.baseRadius * (0.5 + 0.85 * easeOutExpo(t));
            const alpha = Math.pow(1 - t, 1.5);
            const grad = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
            grad.addColorStop(0,    `rgba(255, 255, 255, ${alpha.toFixed(3)})`);
            grad.addColorStop(0.32, hslWithAlpha(color, alpha * 0.85));
            grad.addColorStop(1,    hslWithAlpha(color, 0));
            c.fillStyle = grad;
            c.beginPath();
            c.arc(p.x, p.y, r, 0, TWO_PI);
            c.fill();
        }
    });

    // Layer 2 — PLASMA CLOUD: irregular drifting blobs.
    const blobs = 4 + Math.floor(Math.random() * 3);
    const blobBaseAngle = Math.random() * TWO_PI;
    for (let i = 0; i < blobs; i++) {
        const angle = blobBaseAngle + (i / blobs) * TWO_PI + (Math.random() - 0.5) * 0.7;
        const drift = 0.45 + Math.random() * 0.75;
        const offsetDist = 3 + Math.random() * 9;
        const startDelay = Math.floor(Math.random() * 5);
        particles.push({
            x: x + Math.cos(angle) * offsetDist,
            y: y + Math.sin(angle) * offsetDist,
            vx: Math.cos(angle) * drift,
            vy: Math.sin(angle) * drift - 0.22,
            age: -startDelay,
            lifespan: 50 + Math.floor(Math.random() * 30),
            baseRadius: (26 + Math.random() * 28) * scale,
            blend: 'screen',
            update(p) {
                p.age++;
                if (p.age < 0) return true;
                p.x += p.vx;
                p.y += p.vy;
                p.vx *= 0.96;
                p.vy = p.vy * 0.96 - 0.018;
                return p.age < p.lifespan;
            },
            draw(p, c) {
                if (p.age < 0) return;
                const t = p.age / p.lifespan;
                const r = p.baseRadius * easeOutCubic(t);
                const alpha = Math.pow(1 - t, 1.7) * 0.4;
                const grad = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
                grad.addColorStop(0,    hslWithAlpha(color, alpha));
                grad.addColorStop(0.55, hslWithAlpha(color, alpha * 0.45));
                grad.addColorStop(1,    hslWithAlpha(color, 0));
                c.fillStyle = grad;
                c.beginPath();
                c.arc(p.x, p.y, r, 0, TWO_PI);
                c.fill();
            }
        });
    }

    // Layer 3 — SPIKE RAYS: narrow tapered streaks.
    const rays = 5 + Math.floor(Math.random() * 4);
    const raySpread = TWO_PI / rays;
    const rayStart = Math.random() * TWO_PI;
    for (let i = 0; i < rays; i++) {
        const angle = rayStart + i * raySpread + (Math.random() - 0.5) * raySpread * 0.55;
        particles.push({
            x, y, angle,
            length: (44 + Math.random() * 42) * scale,
            thickness: 1.5 + Math.random() * 1.6,
            age: 0,
            lifespan: 22 + Math.floor(Math.random() * 9),
            blend: 'screen',
            update(p) { p.age++; return p.age < p.lifespan; },
            draw(p, c) {
                const t = p.age / p.lifespan;
                const len = p.length * easeOutQuart(t);
                const alpha = Math.pow(1 - t, 1.9);
                const innerR = 4;
                const halfW = p.thickness * 0.5 * (1 - t * 0.45);

                c.save();
                c.translate(p.x, p.y);
                c.rotate(p.angle);
                const grad = c.createLinearGradient(innerR, 0, innerR + len, 0);
                grad.addColorStop(0,    hslWithAlpha(color, alpha * 0.95));
                grad.addColorStop(0.22, hslWithAlpha(color, alpha * 0.6));
                grad.addColorStop(1,    hslWithAlpha(color, 0));
                c.fillStyle = grad;
                c.beginPath();
                c.moveTo(innerR, -halfW);
                c.lineTo(innerR + len, 0);
                c.lineTo(innerR, halfW);
                c.closePath();
                c.fill();
                c.restore();
            }
        });
    }

    // Layer 4 — SHOCKWAVE RING: thin expanding ring.
    particles.push({
        x, y,
        age: 0,
        lifespan: 28,
        maxRadius: 92 * scale,
        blend: 'screen',
        update(p) { p.age++; return p.age < p.lifespan; },
        draw(p, c) {
            const t = p.age / p.lifespan;
            const r = p.maxRadius * easeOutQuart(t);
            const alpha = Math.pow(1 - t, 2.2);
            const ringW = 2.2 * (1 - t * 0.55);
            const inner = Math.max(0, r - ringW * 1.6);
            const outer = r + ringW * 0.6;
            const grad = c.createRadialGradient(p.x, p.y, inner, p.x, p.y, outer);
            grad.addColorStop(0,    hslWithAlpha(color, 0));
            grad.addColorStop(0.5,  hslWithAlpha(color, alpha));
            grad.addColorStop(1,    hslWithAlpha(color, 0));
            c.fillStyle = grad;
            c.beginPath();
            c.arc(p.x, p.y, outer, 0, TWO_PI);
            c.fill();
        }
    });

    // Layer 5 — KINETIC EMBERS: fast streaked sparks.
    embers(x, y, {
        count: 14,
        lifespan: 80,
        speedMin: 1.6 * scale,
        speedRange: 2.4 * scale,
        color,
        gravity: 0.045,
        drag: 0.97,
        trail: true,
        blend: 'screen'
    });

    // Layer 6 — AFTERGLOW EMBERS: slow lingering drift.
    embers(x, y, {
        count: 5,
        lifespan: 130,
        speedMin: 0.3,
        speedRange: 0.55,
        color,
        gravity: 0.012,
        drag: 0.985,
        size: 0.6,
        upBias: 0.4,
        blend: 'screen'
    });

    ensureLoop();
}

// ── Ribbon (particle arc between two elements) ────────────────────

function ribbon(fromEl, toEl, opts = {}) {
    if (!ctx || !fromEl || !toEl) return;
    const start = rectCenter(fromEl);
    const end = rectCenter(toEl);
    const intensity = opts.intensity ?? 'medium';
    const count =
        intensity === 'subtle' ? 6 :
        intensity === 'loud'   ? 16 :
                                 10;
    const color = opts.color ?? getAccentHsl();
    const arcDur = opts.duration ?? 800;
    const lifespanFrames = Math.round(arcDur / 16.67);

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy) || 1;
    const perpScale = (opts.curvature ?? 0.25) * len;
    const ctrlX = (start.x + end.x) / 2 + (-dy / len) * perpScale;
    const ctrlY = (start.y + end.y) / 2 + (dx / len) * perpScale;

    for (let i = 0; i < count; i++) {
        const delay = i * 4;
        particles.push({
            startX: start.x, startY: start.y,
            ctrlX, ctrlY,
            endX: end.x, endY: end.y,
            age: -delay, lifespan: lifespanFrames,
            size: 1.2 + Math.random() * 0.6,
            blend: 'screen',
            update(p) { p.age++; return p.age < p.lifespan; },
            draw(p, c) {
                if (p.age < 0) return;
                const t = p.age / p.lifespan;
                const inv = 1 - t;
                const px = inv * inv * p.startX + 2 * inv * t * p.ctrlX + t * t * p.endX;
                const py = inv * inv * p.startY + 2 * inv * t * p.ctrlY + t * t * p.endY;
                const alpha = Math.sin(t * Math.PI);
                c.fillStyle = hslWithAlpha(color, alpha);
                c.beginPath();
                c.arc(px, py, p.size, 0, TWO_PI);
                c.fill();
            }
        });
    }
    ensureLoop();
}

// ── Coordinate-or-element overloads ───────────────────────────────

function bloomAt(el, opts = {})  { if (!el) return; const c = rectCenter(el); bloom(c.x, c.y, opts); }
function embersAt(el, opts = {}) { if (!el) return; const c = rectCenter(el); embers(c.x, c.y, opts); }

// ── Demo (manual eyeballs) ───────────────────────────────────────
//
// Run from devtools: `core.ui.effects.demo()`. Cycles every primitive
// against visible test targets so the whole library can be inspected
// in ~10 seconds.

function demo(targets) {
    const navbtn  = targets?.navbtn  || document.querySelector('.navbutton:not(.locked)');
    const ledger  = targets?.ledger  || document.querySelector('.ledger-tab.chosen');
    const button  = targets?.button  || document.querySelector('.raised-button, button:not([disabled])');
    const center  = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

    let t = 0;
    const at = (ms, fn) => setTimeout(fn, t += ms);

    at(0,   () => navbtn  && pulse(navbtn,  { intensity: 'subtle' }));
    at(500, () => navbtn  && pulse(navbtn,  { intensity: 'medium' }));
    at(700, () => navbtn  && pulse(navbtn,  { intensity: 'loud' }));
    at(900, () => button  && shimmer(button));
    at(1000, () => navbtn && floatText(navbtn, '+10', { kind: 'gain' }));
    at(300, () => navbtn  && floatText(navbtn, '-3',  { kind: 'drain' }));
    at(300, () => navbtn  && floatText(navbtn, 'CRIT!', { kind: 'crit' }));
    at(700, () => button  && crackle(button));
    at(800, () => navbtn && ledger && ribbon(navbtn, ledger));
    at(1000, () => embers(center.x, center.y, { count: 12, trail: true }));
    at(800, () => bloom(center.x, center.y, { intensity: 'subtle' }));
    at(1200, () => bloom(center.x, center.y, { intensity: 'medium' }));
    at(1500, () => bloom(center.x, center.y, { intensity: 'loud' }));
    at(2000, () => wave({ intensity: 'medium', origin: 'center' }));
    at(1500, () => wave({ intensity: 'loud', origin: 'top' }));
}

// ── Setup ────────────────────────────────────────────────────────

const EffectsService = {
    init(coreCanvas) {
        canvas = coreCanvas;
        ctx = canvas.getContext('2d');
        this.observeUnlocks();
    },

    // Canvas effects
    bloom, bloomAt, embers, embersAt, ribbon,

    // DOM effects
    pulse, crackle, shimmer, floatText, crossfade, pageTurn, wave,

    // Demo
    demo,

    // Auto-bloom on .locked → unlocked transitions for navbutton/ledger-tab.
    // Caller can suppress per-element by setting `el.dataset.skipBloom = ""`
    // before removing the .locked class (used for prologue handoff and
    // save-load state restoration).
    observeUnlocks() {
        const watch = (el) => {
            const observer = new MutationObserver((mutations) => {
                for (const m of mutations) {
                    if (m.attributeName !== 'class') continue;
                    const wasLocked = m.oldValue?.includes('locked');
                    const isLocked = el.classList.contains('locked');
                    if (wasLocked && !isLocked) {
                        if ('skipBloom' in el.dataset) {
                            delete el.dataset.skipBloom;
                            continue;
                        }
                        bloomAt(el, { scale: 0.9 });
                    }
                }
            });
            observer.observe(el, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
        };

        document.querySelectorAll('.navbutton.locked, .ledger-tab.locked').forEach(watch);

        const root = new MutationObserver((mutations) => {
            for (const m of mutations) {
                m.addedNodes.forEach(node => {
                    if (node.nodeType !== 1) return;
                    if (node.matches?.('.navbutton, .ledger-tab')) watch(node);
                    node.querySelectorAll?.('.navbutton, .ledger-tab').forEach(watch);
                });
            }
        });
        root.observe(document.body, { childList: true, subtree: true });
    }
};

export default EffectsService;
