// layout_loader.js
// Handles reading/parsing the custom geometry JSON file and notifies the app via a CustomEvent.
//
// This file intentionally contains only the JSON layout loading logic.

/**
 * Global flag to prevent re-entrant file loading operations.
 * @type {boolean}
 */
let geometryLoadInProgress = false;

/**
 * File input handler used by index.html (onchange="loadGeometryFile(event)").
 * Reads the selected file, parses JSON, and dispatches:
 * window.dispatchEvent(new CustomEvent('shipEvacuation:geometryLoaded', { detail: { deckArrangement } }))
 * * @param {Event} event - The DOM change event triggered by the file input.
 * @fires Window#shipEvacuation:geometryLoaded
 */
export function loadGeometryFile(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;

    // Prevent double-trigger (e.g., inline onchange + addEventListener)
    if (geometryLoadInProgress) return;
    geometryLoadInProgress = true;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            /**
             * The parsed JSON structure defining deck geometry, compartments, and interfaces.
             * @type {object}
             */
            const deckArrangement = JSON.parse(e.target.result);

            /**
             * Dispatched when geometry is successfully loaded.
             * @event Window#shipEvacuation:geometryLoaded
             * @type {CustomEvent}
             * @property {object} detail.deckArrangement - The parsed deck layout object.
             */
            window.dispatchEvent(new CustomEvent('shipEvacuation:geometryLoaded', {
                detail: { deckArrangement }
            }));
        } catch (err) {
            console.error('Failed to parse geometry JSON file:', err);
        } finally {
            geometryLoadInProgress = false;

            // Allow selecting the same file again if the user re-uploads it.
            if (event?.target) event.target.value = '';
        }
    };
    reader.onerror = () => {
        geometryLoadInProgress = false;
        if (event?.target) event.target.value = '';
    };
    reader.readAsText(file);
}

// Expose for the inline onchange handler in index.html
if (typeof window !== 'undefined') {
    window.loadGeometryFile = loadGeometryFile;
}
