export default function createModalDialog(dialogElementOrHtml, options = {}) {
    let dialog;
    let closeDialogFunction = null;
    let previouslyFocusedElement = null;
    let clickOutsideHandler = null;

    // Create dialog element if HTML string provided
    if (typeof dialogElementOrHtml === 'string') {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = dialogElementOrHtml.trim();
        dialog = tempDiv.firstElementChild;
        dialog.style.display = "none";
        document.body.appendChild(dialog);
    } else {
        dialog = dialogElementOrHtml;
    }

    function handleClickOutside(e) {
        const rect = dialog.getBoundingClientRect();
        const clickedInDialog = (
            rect.top <= e.clientY &&
            e.clientY <= rect.top + rect.height &&
            rect.left <= e.clientX &&
            e.clientX <= rect.left + rect.width
        );

        if (!clickedInDialog) {
            close();
        }
    }

    async function handleDialogClose() {
        // Clean up click listener
        if (clickOutsideHandler) {
            document.removeEventListener('click', clickOutsideHandler);
            clickOutsideHandler = null;
        }

        // Reset the close function reference since dialog is now closed
        closeDialogFunction = null;

        // Use focus/blur/refocus cycle to reset input state
        const restoreFocus = async () => {
            if (previouslyFocusedElement &&
                previouslyFocusedElement.focus &&
                document.body.contains(previouslyFocusedElement) &&
                !document.activeElement?.closest('dialog')) {


                // In mobile mode, only restore focus to elements in the active section
                const isMobile = window.matchMedia('(width <= 950px)').matches;
                if (isMobile) {
                    const activeSection = document.querySelector('.main-section.active');
                    if (activeSection && !activeSection.contains(previouslyFocusedElement)) {
                        // Don't restore focus to elements outside the active section in mobile
                        return false;
                    }
                }


                // Reset input state with focus/blur/refocus cycle
                previouslyFocusedElement.focus({ preventScroll: true });
                previouslyFocusedElement.blur();
                await new Promise(resolve => {
                    requestAnimationFrame(() => {
                        previouslyFocusedElement.focus({ preventScroll: true });
                        resolve();
                    });
                });

                return true;
            }
            return false;
        };

        await restoreFocus();
        document.dispatchEvent(new Event('dialogResolved'));
        dialog.onclose = null;
    }

    function open() {
        if (closeDialogFunction) return closeDialogFunction; // Already open

        // Save the currently focused element
        previouslyFocusedElement = document.activeElement;

        // Open the dialog
        dialog.showModal();
        dialog.style.display = "";

        // Handle clicking outside the dialog to close it
        let ignoreClick = true;
        setTimeout(() => {
            ignoreClick = false;
        }, 250); // Ignore clicks for the first 100ms to prevent immediate closure

        clickOutsideHandler = (e) => {
            if (ignoreClick) return;
            handleClickOutside(e);
        };

        document.addEventListener('click', clickOutsideHandler);

        // Create a close function that closes the dialog
        closeDialogFunction = async () => {
            if (!closeDialogFunction) return; // Already closed

            // Clean up click listener
            if (clickOutsideHandler) {
                document.removeEventListener('click', clickOutsideHandler);
                clickOutsideHandler = null;
            }
            await dialog.close();
            dialog.style.display = "none";
            closeDialogFunction = null;
            return Promise.resolve();
        };

        dialog.onclose = handleDialogClose;

        return closeDialogFunction;
    }

    async function close() {
        if (closeDialogFunction) {
            await closeDialogFunction();
        }
    }

    function destroy() {
        if (closeDialogFunction) {
            close();
        }
        if (dialog && dialog.parentElement) {
            dialog.remove();
        }
    }

    return {
        dialog,
        open,
        close,
        destroy,
        get isOpen() {
            return closeDialogFunction !== null;
        }
    };
}
