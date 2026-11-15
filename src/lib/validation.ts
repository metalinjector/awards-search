/** Parse an exact four-digit year rather than accepting values such as 2024abc. */
export function parseYear(value: string | null): number | null {
  if (!value || !/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  return year >= 1900 && year <= 2100 ? year : null;
}

/** Parse a positive decimal identifier without silently truncating its suffix. */
export function parsePositiveId(value: string | null): number | null {
  if (!value || !/^\d{1,12}$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
