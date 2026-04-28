export default function createBreakdownBox(data) {
    if (!data) return '';
    const payload = normalizeBreakdown(data);
    const parts = [];

    if (payload.header) {
        parts.push(`<p>${payload.header}</p>`);
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
    const cls = line.tone === 'gain' ? 'bd-g' : line.tone === 'drain' ? 'bd-d' : '';
    const note = line.note ? ` <span class="bd-n">(${line.note})</span>` : '';
    const label = line.label ? ` ${line.label}` : '';
    const current = `<div class="bd-r" style="--bd-depth:${depth}"><span class="${cls}">${line.value}</span>${label}${note}</div>`;
    const children = (line.children || []).map((child) => renderLine(child, depth + 1)).join('');
    return `${current}${children}`;
}

function renderResult(result) {
    const parts = result.map((entry) => {
        const cls = entry.tone === 'gain' ? 'bd-g' : entry.tone === 'drain' ? 'bd-d' : '';
        const label = entry.label ? ` ${entry.label}` : '';
        return `<span class="${cls}">${entry.value}${label}</span>`;
    }).join(', ');
    return `<div class="bd-res">= ${parts}</div>`;
}

function normalizeBreakdown(data) {
    if (data.chain || data.resultRows) {
        return {
            header: data.header || '',
            chain: data.chain || [],
            result: data.resultRows || [],
            footer: data.footer || ''
        };
    }
    const chain = [];
    for (const item of data.items || []) {
        chain.push({
            value: item.value,
            label: item.label || '',
            note: item.note || '',
            tone: toTone(item.type),
            children: (item.modifiers || []).map((mod) => ({
                value: mod.value,
                label: '',
                note: mod.label,
                tone: 'neutral',
                children: []
            }))
        });
    }
    for (const mod of data.modifiers || []) {
        chain.push({
            value: mod.value,
            label: '',
            note: mod.label,
            tone: 'neutral',
            children: []
        });
    }

    const resultRows = [];
    if (Array.isArray(data.result?.items)) {
        for (const entry of data.result.items) {
            resultRows.push({
                value: entry.value,
                label: entry.label || '',
                tone: toTone(entry.type)
            });
        }
    } else if (data.result?.value) {
        resultRows.push({
            value: data.result.value,
            label: data.result.label || '',
            tone: toTone(data.result.type)
        });
    }

    return {
        header: data.header || '',
        chain,
        result: resultRows,
        footer: data.footer || ''
    };
}

function toTone(type) {
    if (type === 'gain') return 'gain';
    if (type === 'drain') return 'drain';
    return 'neutral';
}
