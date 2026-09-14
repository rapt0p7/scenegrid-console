export function routeAsset(
    sizeMb: number,
    thresholdMb: number,
    basename: string,
    streamRules: string[],
    streamExclusions: string[]
): 'chunk' | 'ladder' {
    for (const rule of streamExclusions) {
        if (new RegExp(rule).test(basename)) {
            return 'ladder';
        }
    }

    for (const rule of streamRules) {
        if (new RegExp(rule).test(basename)) {
            return 'chunk';
        }
    }

    return sizeMb > thresholdMb ? 'chunk' : 'ladder';
}
