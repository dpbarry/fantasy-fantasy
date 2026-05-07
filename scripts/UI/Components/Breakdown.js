export default function createBreakdown(data) {
    if (!data) return '';
    const payload = toCanonicalBreakdown(data);
    const parts = [];

    if (payload.header) {
        const hc = payload.headerClass ? ` class="${payload.headerClass}"` : '';
        parts.push(`<p${hc}>${payload.header}</p>`);
    }

    if (payload.chain.length) {
        parts.push(payload.chain.map((line) => renderLine(line, 0)).join(''));
    }

    if (payload.result.length) {
        parts.push(renderResult(payload.result));
    }

    if (payload.footer) {
        parts.push(`<p>${payload.footer}</p>`);
    }

    if (parts.length === 0) return '';

    return `<div class="bd">${parts.join('')}</div>`;
}

function renderLine(line, depth) {
    if (line.kind === 'result') {
        return renderResult([line]);
    }
    if (line.kind === 'separator') {
        return '<div class="bd-sep"></div>';
    }
    const cls = line.tone === 'gain' ? 'bd-g' : line.tone === 'drain' ? 'bd-d' : '';
    const note = line.note ? ` <span class="bd-n">(${line.note})</span>` : '';
    const label = line.label ? ` ${line.label}` : '';
    const current = `<div class="bd-r" style="--bd-depth:${depth}">${renderValue(line.value, cls)}${label}${note}</div>`;
    const children = (line.children || []).map((child) => renderLine(child, depth + 1)).join('');
    return `${current}${children}`;
}

function renderResult(result) {
    const rows = result.map((entry, i) => {
        const cls = entry.tone === 'gain' ? 'bd-g' : entry.tone === 'drain' ? 'bd-d' : '';
        const label = entry.label ? ` ${entry.label}` : '';
        const prefix = i === 0 ? '= ' : '  ';
        return `<div class="bd-res-row"><span class="bd-res-prefix">${prefix}</span><span class="${cls}">${renderValueInline(entry.value, cls)}</span>${label}</div>`;
    });
    return `<div class="bd-res">${rows.join('')}</div>`;
}

function renderValue(value, cls) {
    if (value && typeof value === 'object') {
        if ('from' in value && 'to' in value) {
            return `<span class="${cls} bd-n">${value.from}</span> <span class="${cls}">→ ${value.to}</span>`;
        }
        return `<span class="${cls}">${value.display ?? ''}</span>`;
    }
    const text = String(value ?? '');
    const arrowIndex = text.lastIndexOf('→');
    if (arrowIndex === -1) return `<span class="${cls}">${text}</span>`;
    const before = text.slice(0, arrowIndex).trimEnd();
    const after = text.slice(arrowIndex).trimStart();
    return `<span class="${cls} bd-n">${before}</span> <span class="${cls}">${after}</span>`;
}

function renderValueInline(value, cls) {
    if (value && typeof value === 'object') {
        if ('from' in value && 'to' in value) {
            return `<span class="${cls} bd-n">${value.from}</span> <span class="${cls}">→ ${value.to}</span>`;
        }
        return value.display ?? '';
    }
    return String(value ?? '');
}

function toCanonicalBreakdown(data) {
    return {
        header: data.header || '',
        headerClass: data.headerClass || '',
        chain: data.chain || [],
        result: data.resultRows || [],
        footer: data.footer || ''
    };
}
