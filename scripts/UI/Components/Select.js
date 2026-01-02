const openSelectRegistry = new Set();

function closeAllSelects(exceptElement = null) {
    openSelectRegistry.forEach(selectInstance => {
        if (selectInstance.element !== exceptElement) {
            selectInstance.close();
        }
    });
}

export default function createSelect(config = {}) {
    const {
        options = [],
        placeholder = '',
        value: initialValue = null,
        onChange = null
    } = config;

    let currentValue = initialValue;
    let isOpen = false;
    let focusedIndex = -1;

    const element = document.createElement('div');
    element.className = 'select';
    element.tabIndex = 0;

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'select-trigger';

    const valueDisplayWrapper = document.createElement('span');
    valueDisplayWrapper.className = 'select-value-wrapper';

    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'select-value';

    valueDisplayWrapper.appendChild(valueDisplay);

    const arrow = document.createElement('span');
    arrow.className = 'select-arrow';

    trigger.appendChild(valueDisplayWrapper);
    trigger.appendChild(arrow);

    const dropdown = document.createElement('div');
    dropdown.className = 'select-dropdown';

    element.appendChild(trigger);
    element.appendChild(dropdown);

    function buildOptions() {
        dropdown.innerHTML = '';

        options.forEach((opt, index) => {
            const optionEl = document.createElement('div');
            optionEl.className = 'select-option';
            optionEl.dataset.value = opt.value;
            optionEl.dataset.index = index;

            const checkmark = document.createElement('span');
            checkmark.className = 'select-checkmark';
            checkmark.textContent = '⟶';

            const label = document.createElement('span');
            label.className = 'select-label';
            label.textContent = opt.label;

            optionEl.appendChild(checkmark);
            optionEl.appendChild(label);

            if (opt.value === currentValue) {
                optionEl.classList.add('selected');
            }

            dropdown.appendChild(optionEl);
        });
    }

    function updateDisplay() {
        const selected = options.find(opt => opt.value === currentValue);
        if (selected) {
            valueDisplay.textContent = selected.label;
            valueDisplay.classList.remove('placeholder');
        } else {
            valueDisplay.textContent = placeholder;
            valueDisplay.classList.add('placeholder');
        }
    }

    let publicApi = null;

    function open() {
        if (isOpen) return;

        closeAllSelects(element);

        isOpen = true;
        element.classList.add('open');

        if (publicApi) openSelectRegistry.add(publicApi);

        const selectedIndex = options.findIndex(opt => opt.value === currentValue);
        focusedIndex = selectedIndex >= 0 ? selectedIndex : 0;
        updateFocusedOption();

        requestAnimationFrame(() => {
            document.addEventListener('click', handleClickOutside);
        });
    }

    function close() {
        if (!isOpen) return;
        isOpen = false;
        element.classList.remove('open');
        focusedIndex = -1;
        clearFocusedOption();
        document.removeEventListener('click', handleClickOutside);

        if (publicApi) openSelectRegistry.delete(publicApi);
    }

    function toggle() {
        if (isOpen) {
            close();
        } else {
            open();
        }
    }

    function selectOption(value) {
        const newOption = options.find(opt => opt.value === value);
        if (!newOption) return;

        const oldValue = currentValue;
        const valueChanged = oldValue !== value;
        currentValue = value;

        dropdown.querySelectorAll('.select-option').forEach(el => {
            el.classList.toggle('selected', el.dataset.value === value);
        });

        if (valueChanged) {
            animateValueChange(newOption.label);
        } else {
            updateDisplay();
        }

        close();

        if (onChange && valueChanged) {
            onChange(value, newOption.label);
        }
    }

    function animateValueChange(newLabel) {
        const hasOldValue = valueDisplay.textContent && !valueDisplay.classList.contains('placeholder');

        const newDisplay = document.createElement('span');
        newDisplay.className = 'select-value select-value-entering';
        newDisplay.textContent = newLabel;

        valueDisplayWrapper.appendChild(newDisplay);
        void newDisplay.offsetWidth;
        newDisplay.classList.remove('select-value-entering');
        newDisplay.classList.add('select-value-entered');

        if (hasOldValue) {
            valueDisplay.classList.add('select-value-exiting');
        }

        let cleanedUp = false;

        const cleanup = () => {
            if (cleanedUp) return;
            cleanedUp = true;

            valueDisplay.classList.remove('select-value-exiting');
            valueDisplay.textContent = newLabel;
            valueDisplay.classList.remove('placeholder');

            if (newDisplay.parentNode) {
                newDisplay.remove();
            }
        };

        valueDisplay.addEventListener('animationend', cleanup, { once: true });
        setTimeout(cleanup, 200);
    }

    function updateFocusedOption() {
        const optionEls = dropdown.querySelectorAll('.select-option');
        optionEls.forEach((el, i) => {
            el.classList.toggle('focused', i === focusedIndex);
        });

        if (focusedIndex >= 0 && optionEls[focusedIndex]) {
            optionEls[focusedIndex].scrollIntoView({ block: 'nearest' });
        }
    }

    function clearFocusedOption() {
        dropdown.querySelectorAll('.select-option').forEach(el => {
            el.classList.remove('focused');
        });
    }

    function handleClickOutside(e) {
        if (!element.contains(e.target)) {
            close();
        }
    }

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        toggle();
    });

    dropdown.addEventListener('click', (e) => {
        const optionEl = e.target.closest('.select-option');
        if (optionEl) {
            e.stopPropagation();
            selectOption(optionEl.dataset.value);
        }
    });

    element.addEventListener('keydown', (e) => {
        switch (e.key) {
            case 'Enter':
            case ' ':
                e.preventDefault();
                if (isOpen && focusedIndex >= 0) {
                    selectOption(options[focusedIndex].value);
                } else {
                    toggle();
                }
                break;
            case 'Escape':
                e.preventDefault();
                close();
                break;
            case 'ArrowDown':
                e.preventDefault();
                if (!isOpen) {
                    open();
                } else {
                    focusedIndex = Math.min(focusedIndex + 1, options.length - 1);
                    updateFocusedOption();
                }
                break;
            case 'ArrowUp':
                e.preventDefault();
                if (isOpen) {
                    focusedIndex = Math.max(focusedIndex - 1, 0);
                    updateFocusedOption();
                }
                break;
            case 'Tab':
                if (isOpen) {
                    close();
                }
                break;
        }
    });

    dropdown.addEventListener('mouseover', (e) => {
        const optionEl = e.target.closest('.select-option');
        if (optionEl) {
            focusedIndex = parseInt(optionEl.dataset.index, 10);
            updateFocusedOption();
        }
    });

    buildOptions();
    updateDisplay();

    publicApi = {
        element,
        get value() {
            return currentValue;
        },
        setValue(value) {
            selectOption(value);
        },
        setOptions(newOptions) {
            options.length = 0;
            options.push(...newOptions);
            buildOptions();
            updateDisplay();
        },
        open,
        close,
        destroy() {
            document.removeEventListener('click', handleClickOutside);
            openSelectRegistry.delete(publicApi);
            element.remove();
        }
    };

    return publicApi;
}
