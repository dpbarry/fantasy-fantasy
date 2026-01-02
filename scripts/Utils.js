export async function delay(ms) {
    return new Promise(res => setTimeout(res, ms));
}

export async function waitForEvent(el, ev, escape = 0) {
    return new Promise(res => {
        let timeoutId;

        const handler = function h(e) {
            if (timeoutId) clearTimeout(timeoutId);
            el.removeEventListener(ev, h);
            res(e);
        };

        if (escape > 0) {
            if (typeof escape === 'number') {
                timeoutId = setTimeout(() => {
                    el.removeEventListener(ev, handler);
                    res(null);
                }, escape);
            }
        }
        el.addEventListener(ev, handler);
    });

}

export function verticalScroll(el, moe, respectPadding = false) {
    el.style.overflowY = "auto";
    let clientHeight = el.clientHeight;
    if (respectPadding) {
        const computedStyle = window.getComputedStyle(el);
        const paddingTop = parseFloat(computedStyle.paddingTop);
        const paddingBottom = parseFloat(computedStyle.paddingBottom);
        clientHeight -= (paddingTop + paddingBottom);
    }
    const isScrollable = (el.scrollHeight > clientHeight + 1);
    if (!isScrollable) {
        el.style.maskImage = "";
        el.style.overflow = "visible";
        return;
    }
    el.style.overflowY = "auto";

    const isScrolledToBottom = el.scrollHeight < clientHeight + el.scrollTop + moe;
    const isScrolledToTop = isScrolledToBottom ? false : el.scrollTop < moe;

    let top = 0;
    let bottom = 0;

    if (!isScrolledToBottom) {
        bottom = el.dataset.masksize || 40;
    }

    if (!isScrolledToTop) {
        top = el.dataset.masksize || 40;
    }

    el.style.maskImage = `linear-gradient(to bottom, transparent 0, black ${top}px, black calc(100% - ${bottom}px), transparent 100%)`;
}

const STANDARD_ABBREVIATIONS = ['', 'k', 'm', 'b', 't', 'q'];

function generateAlphabeticalAbbreviations() {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz';
    const abbreviations = [];

    for (let i = 0; i < alphabet.length; i++) {
        abbreviations.push(alphabet[i]);
    }

    for (let first = 0; first < alphabet.length; first++) {
        for (let second = 0; second < alphabet.length; second++) {
            abbreviations.push(alphabet[first] + alphabet[second]);
        }
    }

    for (let first = 0; first < alphabet.length; first++) {
        for (let second = 0; second < alphabet.length; second++) {
            for (let third = 0; third < alphabet.length; third++) {
                abbreviations.push(alphabet[first] + alphabet[second] + alphabet[third]);
            }
        }
    }

    return abbreviations;
}

const ALPHABETICAL_ABBREVIATIONS = generateAlphabeticalAbbreviations();

function formatMantissa(mantissa, decimalPlaces, keepTrailingZeros) {
    let formatted = keepTrailingZeros
        ? mantissa.toFixed(decimalPlaces)
        : mantissa.toFixed(decimalPlaces).replace(/\.?0+$/, '');
    return formatted === '' ? '0' : formatted;
}

function applyRounding(value, decimalPlaces, roundUp) {
    if (!roundUp) return value;
    return decimalPlaces === 0
        ? Math.ceil(value)
        : Math.ceil(value * Math.pow(10, decimalPlaces)) / Math.pow(10, decimalPlaces);
}

function calculateEffectiveDecimalPlaces(absNum, formatType, baseDecimalPlaces) {
    const exponent = Math.floor(Math.log10(absNum));

    if (formatType === 'scientific' && exponent >= 100) return 1;
    if (formatType === 'alphabetical' && absNum >= 1000) {
        const index = Math.floor((Math.log10(absNum) - 3) / 3);
        if (index >= 100) return 1;
    }
    if (formatType === 'standard' && absNum >= 1000) {
        const index = Math.floor(Math.log10(absNum) / 3);
        if (index >= 10) return 1;
    }

    return baseDecimalPlaces;
}

function formatSmallNumber(absNum, options, effectiveDp, isNegative) {
    if (options.wholeOnly) {
        const floored = Math.floor(absNum);
        return `${isNegative ? '-' : ''}${floored}`;
    }

    const numToFormat = applyRounding(absNum, effectiveDp, options.roundUp);
    const formatted = formatMantissa(numToFormat, effectiveDp, options.keepTrailingZeros);
    return `${isNegative ? '-' : ''}${formatted}`;
}

function formatLargeNumber(absNum, formatType, options, effectiveDp, isNegative) {
    if (formatType === 'scientific') {
        const exponent = Math.floor(Math.log10(absNum));
        const mantissa = absNum / Math.pow(10, exponent);
        const formattedMantissa = formatMantissa(mantissa, effectiveDp, options.keepTrailingZeros);
        return `${isNegative ? '-' : ''}${formattedMantissa}e${exponent}`;
    }

    const logValue = Math.log10(absNum);

    if (formatType === 'alphabetical') {
        const index = Math.floor((logValue - 3) / 3);
        if (index < ALPHABETICAL_ABBREVIATIONS.length) {
            const abbreviation = ALPHABETICAL_ABBREVIATIONS[index];
            const mantissa = absNum / Math.pow(10, (index + 1) * 3);
            const formattedMantissa = formatMantissa(mantissa, effectiveDp, options.keepTrailingZeros);
            return `${isNegative ? '-' : ''}${formattedMantissa}${abbreviation}`;
        }
    } else if (formatType === 'standard') {
        const index = Math.floor(logValue / 3);
        if (index < STANDARD_ABBREVIATIONS.length) {
            const abbreviation = STANDARD_ABBREVIATIONS[index];
            const mantissa = absNum / Math.pow(10, index * 3);
            const formattedMantissa = formatMantissa(mantissa, effectiveDp, options.keepTrailingZeros);
            return `${isNegative ? '-' : ''}${formattedMantissa}${abbreviation}`;
        }
    }

    return null; // Signal fallback needed
}

export function formatNumber(value, formatType = 'standard', opt = {}) {
    const num = value && typeof value.toNumber === 'function' ? value.toNumber() : Number(value);

    if (isNaN(num)) return 'NaN';
    if (!isFinite(num)) return num > 0 ? '∞' : '-∞';

    const options = {
        decimalPlaces: opt?.decimalPlaces ?? 2,
        keepTrailingZeros: opt?.decimalPlaces !== undefined,
        wholeOnly: opt?.wholeNumbersOnly === true,
        roundUp: opt?.roundUp === true
    };

    const absNum = Math.abs(num);
    const isNegative = num < 0;

    const effectiveDp = calculateEffectiveDecimalPlaces(absNum, formatType, options.decimalPlaces);

    if (absNum < 1000) {
        if (formatType === 'scientific') {
            const exponent = Math.floor(Math.log10(absNum));
            if (exponent >= 3) {
                const mantissa = absNum / Math.pow(10, exponent);
                const formattedMantissa = formatMantissa(mantissa, effectiveDp, options.keepTrailingZeros);
                return `${isNegative ? '-' : ''}${formattedMantissa}e${exponent}`;
            }
        }
        return formatSmallNumber(absNum, options, effectiveDp, isNegative);
    }

    const result = formatLargeNumber(absNum, formatType, options, effectiveDp, isNegative);
    if (result !== null) {
        return result;
    }

    return formatNumber(num, 'scientific', opt);
}

export function getElementSection(el) {
    if (!el) return null;
    const left = document.getElementById('left');
    const center = document.getElementById('center');
    const right = document.getElementById('right');
    if (left?.contains(el)) return 'left';
    if (center?.contains(el)) return 'center';
    if (right?.contains(el)) return 'right';
    return null;
}
