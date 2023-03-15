export function enumMap<T extends Record<string, string>, R>(enum_: T, func: (x: T[keyof T]) => R): Record<T[keyof T], R> {

    type EnumVal = T[keyof T];

    const entries: [EnumVal, R][] = Object.values(enum_).map((str: string) => {
        const val = str as EnumVal;
        return [val, func(val)];
    });

    return Object.fromEntries(entries) as any;

}
