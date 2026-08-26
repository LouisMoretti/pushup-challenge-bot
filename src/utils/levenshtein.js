// Distance de Levenshtein entre deux chaînes : nombre minimal
// d'insertions, de suppressions et de substitutions de caractères
// pour transformer `a` en `b`. Implémentation sans dépendance,
// mémoire réduite à deux lignes de matrice.
export function levenshtein(a, b) {
    if (a === b) {
        return 0;
    }
    if (a.length === 0) {
        return b.length;
    }
    if (b.length === 0) {
        return a.length;
    }

    let previousRow = Array.from({ length: b.length + 1 }, (_, i) => i);

    for (let i = 1; i <= a.length; i += 1) {
        const currentRow = [i];
        for (let j = 1; j <= b.length; j += 1) {
            const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
            currentRow[j] = Math.min(
                previousRow[j] + 1,
                currentRow[j - 1] + 1,
                previousRow[j - 1] + substitutionCost,
            );
        }
        previousRow = currentRow;
    }

    return previousRow[b.length];
}
