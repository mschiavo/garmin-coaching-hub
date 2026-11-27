export function formatMetric(value: number | string): string {
  return typeof value === 'number'
    ? value.toLocaleString('it-IT', { maximumFractionDigits: 1 })
    : value;
}
