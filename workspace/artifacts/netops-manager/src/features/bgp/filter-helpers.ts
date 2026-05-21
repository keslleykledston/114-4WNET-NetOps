export function toggleArrayFilter<T>(current: T[], value: T): T[] {
  const index = current.indexOf(value);
  if (index === -1) {
    return [...current, value];
  }
  return current.filter((_, i) => i !== index);
}
