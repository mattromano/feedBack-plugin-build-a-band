// Locate the drum arrangement in a song's arrangement list.
export function findDrumArrangement(arrangements) {
    return (arrangements || []).findIndex(
        (a) => a && (a.type === 'drums' || /drum/i.test(a.name || '')),
    );
}
