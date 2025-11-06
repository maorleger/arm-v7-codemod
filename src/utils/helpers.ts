export function capitalizeFirstLetter(string: string): string {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

export function isEmptyObject(obj: object): boolean {
    return Object.keys(obj).length === 0 && obj.constructor === Object;
}

export function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}