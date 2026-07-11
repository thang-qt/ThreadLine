export const numberValue = (value: string, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;
