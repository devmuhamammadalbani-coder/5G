/**
 * DRUG ABBREVIATION DICTIONARY
 * Maps common medical abbreviations, short-forms, brand names,
 * and doctor shorthand to the canonical drug name stored in inventory.
 *
 * Matching is case-insensitive and uses both exact and partial matching.
 */

const DRUG_ALIASES = {};

/**
 * Resolves a drug text fragment to its canonical inventory name.
 * Returns null if no match found.
 * @param {string} fragment - Part of a prescription text
 * @returns {string|null}
 */
export const resolveAlias = (fragment) => {
    const lower = fragment.toLowerCase().trim();
    return DRUG_ALIASES[lower] || null;
};

/**
 * Scans the full prescription text and returns matched drug names
 * from both the alias dictionary and the pharmacy inventory.
 *
 * @param {string} prescriptionText - Full prescription text written by doctor
 * @param {Array}  inventory        - Current pharmacy inventory items [{id, name, price, stock}]
 * @returns {{ matched: Array, unresolved: string[] }}
 *   matched: items from inventory with quantity + isAvailable
 *   unresolved: drug names/terms detected but not found in inventory
 */
export const parsePrescription = (prescriptionText, inventory) => {
    if (!prescriptionText || !inventory) return { matched: [], unresolved: [] };

    const text = prescriptionText.toLowerCase();
    const matchedIds = new Set();
    const matched = [];
    const unresolved = [];

    // Step 1: Check each inventory item by name (direct name match)
    inventory.forEach(item => {
        const itemName = item.name.toLowerCase();
        // Match full name or the base drug name (before dosage, e.g. "500mg")
        const baseName = itemName.split(' ')[0];
        if (text.includes(itemName) || text.includes(baseName)) {
            if (!matchedIds.has(item.id)) {
                matchedIds.add(item.id);
                matched.push({ ...item, quantity: 1, isAvailable: item.stock > 0 });
            }
        }
    });

    // Step 2: Check each alias in dictionary
    Object.entries(DRUG_ALIASES).forEach(([alias, canonicalName]) => {
        if (text.includes(alias)) {
            // Find inventory item whose name contains the canonical name
            const inventoryMatch = inventory.find(item =>
                item.name.toLowerCase().includes(canonicalName.toLowerCase()) ||
                canonicalName.toLowerCase().includes(item.name.toLowerCase().split(' ')[0])
            );
            if (inventoryMatch) {
                if (!matchedIds.has(inventoryMatch.id)) {
                    matchedIds.add(inventoryMatch.id);
                    matched.push({ ...inventoryMatch, quantity: 1, isAvailable: inventoryMatch.stock > 0 });
                }
            } else {
                // Alias resolved but drug not in inventory
                if (!unresolved.some(u => u.name === canonicalName)) {
                    unresolved.push({ alias, name: canonicalName });
                }
            }
        }
    });

    // Step 3: Scan word by word for any missed aliases
    const words = text.split(/[\s,;.\-\/()]+/).filter(Boolean);
    for (let i = 0; i < words.length; i++) {
        // Try bigrams (two-word phrases)
        const bigram = i < words.length - 1 ? `${words[i]} ${words[i + 1]}` : null;
        const candidates = [words[i], bigram].filter(Boolean);
        for (const candidate of candidates) {
            const resolved = resolveAlias(candidate);
            if (resolved) {
                const inventoryMatch = inventory.find(item =>
                    item.name.toLowerCase().includes(resolved.toLowerCase()) ||
                    resolved.toLowerCase().includes(item.name.toLowerCase().split(' ')[0])
                );
                if (inventoryMatch && !matchedIds.has(inventoryMatch.id)) {
                    matchedIds.add(inventoryMatch.id);
                    matched.push({ ...inventoryMatch, quantity: 1, isAvailable: inventoryMatch.stock > 0 });
                } else if (!inventoryMatch && !unresolved.some(u => u.name === resolved)) {
                    unresolved.push({ alias: candidate, name: resolved });
                }
            }
        }
    }

    return { matched, unresolved };
};

export default DRUG_ALIASES;
