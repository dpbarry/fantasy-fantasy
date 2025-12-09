export async function delay(ms) {
    return new Promise(res => setTimeout(res, ms));
}

export async function waitForEvent(el, ev, escape= 0) {
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

export function verticalScroll(el, moe, respectPadding= false) {
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

    // One pixel is added to the height to account for non-integer heights.
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

// Number formatting abbreviations
const STANDARD_ABBREVIATIONS = ['', 'k', 'm', 'b', 't', 'q'];

// Generate alphabetical abbreviations
function generateAlphabeticalAbbreviations() {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz';
    const abbreviations = [];

    // Single letters: a-z (0-25, representing 10^3 to 10^78)
    for (let i = 0; i < alphabet.length; i++) {
        abbreviations.push(alphabet[i]);
    }

    // Double letters: aa-az, ba-bz, ..., za-zz (26-701, representing 10^81 to 10^2103)
    for (let first = 0; first < alphabet.length; first++) {
        for (let second = 0; second < alphabet.length; second++) {
            abbreviations.push(alphabet[first] + alphabet[second]);
        }
    }

    // Triple letters: aaa-aaz, aba-abz, ..., zzz (702+, representing 10^2106+)
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

export function formatNumber(value, formatType = 'standard', opt = {}) {
    // Handle Decimal objects from break_infinity
    const num = value && typeof value.toNumber === 'function' ? value.toNumber() : Number(value);

    if (isNaN(num)) return 'NaN';
    if (!isFinite(num)) return num > 0 ? '∞' : '-∞';

    const absNum = Math.abs(num);
    const isNegative = num < 0;
    const decimalPlaces = opt?.decimalPlaces ?? 2;
    const keepTrailingZeros = opt?.decimalPlaces !== undefined;
    const wholeOnly = opt?.wholeNumbersOnly === true;

    // Reduce precision to 1 significant figure for very large magnitudes
    let effectiveDecimalPlaces = decimalPlaces;
    const exponent = Math.floor(Math.log10(absNum));

    if (formatType === 'scientific' && exponent >= 100) {
        effectiveDecimalPlaces = 1;
    }

    // For alphabetical format, check the index
    if (formatType === 'alphabetical' && absNum >= 1000) {
        const logValue = Math.log10(absNum);
        const index = Math.floor((logValue - 3) / 3);
        if (index >= 100) { // Very large alphabetical indices
            effectiveDecimalPlaces = 1;
        }
    }

    // For standard format, check the index
    if (formatType === 'standard' && absNum >= 1000) {
        const logValue = Math.log10(absNum);
        const index = Math.floor(logValue / 3);
        if (index >= 10) { // Very large standard indices (beyond t, q)
            effectiveDecimalPlaces = 1;
        }
    }

    if (formatType === 'scientific') {
        const exponent = Math.floor(Math.log10(absNum));
        // Only use scientific notation for exponents >= 3
        if (exponent >= 3) {
            const mantissa = absNum / Math.pow(10, exponent);
            const formattedMantissa = keepTrailingZeros ?
                mantissa.toFixed(effectiveDecimalPlaces) :
                mantissa.toFixed(effectiveDecimalPlaces).replace(/\.?0+$/, '');
            return `${isNegative ? '-' : ''}${formattedMantissa}e${exponent}`;
        } else {
            // For exponents < 3, use regular decimal format
            const dp = wholeOnly && absNum < 1000 ? 0 : effectiveDecimalPlaces;
            return `${isNegative ? '-' : ''}${
                keepTrailingZeros ?
                absNum.toFixed(dp) :
                absNum.toFixed(dp).replace(/\.?0+$/, '')
            }`;
        }
    }

    if (formatType === 'alphabetical') {
        if (absNum < 1000) {
            const dp = wholeOnly ? 0 : effectiveDecimalPlaces;
            return `${isNegative ? '-' : ''}${
                keepTrailingZeros ?
                absNum.toFixed(dp) :
                absNum.toFixed(dp).replace(/\.?0+$/, '')
            }`;
        }

        const logValue = Math.log10(absNum);
        const index = Math.floor((logValue - 3) / 3); // Start from 10^3

        if (index < ALPHABETICAL_ABBREVIATIONS.length) {
            const abbreviation = ALPHABETICAL_ABBREVIATIONS[index];
            const mantissa = absNum / Math.pow(10, (index + 1) * 3);
            const formattedMantissa = keepTrailingZeros ?
                mantissa.toFixed(effectiveDecimalPlaces) :
                mantissa.toFixed(effectiveDecimalPlaces).replace(/\.?0+$/, '');
            return `${isNegative ? '-' : ''}${formattedMantissa}${abbreviation}`;
        }

        // Fallback to scientific for very large numbers
        return formatNumber(num, 'scientific');
    }

    // Standard format (default)
    if (absNum < 1000) {
        const dp = wholeOnly ? 0 : effectiveDecimalPlaces;
        return `${isNegative ? '-' : ''}${
            keepTrailingZeros ?
            absNum.toFixed(dp) :
            absNum.toFixed(dp).replace(/\.?0+$/, '')
        }`;
    }

    const logValue = Math.log10(absNum);
    const index = Math.floor(logValue / 3);

    if (index < STANDARD_ABBREVIATIONS.length) {
        const abbreviation = STANDARD_ABBREVIATIONS[index];
        const mantissa = absNum / Math.pow(10, index * 3);
        const formattedMantissa = keepTrailingZeros ?
            mantissa.toFixed(effectiveDecimalPlaces) :
            mantissa.toFixed(effectiveDecimalPlaces).replace(/\.?0+$/, '');
        return `${isNegative ? '-' : ''}${formattedMantissa}${abbreviation}`;
    }

    // Fallback to scientific notation for very large numbers
    return formatNumber(num, 'scientific');
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