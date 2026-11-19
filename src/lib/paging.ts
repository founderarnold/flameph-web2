// Reading every row of a list in pages. The database hands back at most 1,000 rows per request, so a job that needs
// all rows (the weekly digest, admin exports) must ask page by page or it silently stops at 1,000.
// `max` is a hard ceiling so a runaway table can never make one job read without end.

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export const PAGE_ROWS = 1000;

export async function fetchAll<T>(page: (from: number, to: number) => Page<T>, max = 50_000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += PAGE_ROWS) {
    const { data, error } = await page(from, Math.min(from + PAGE_ROWS, max) - 1);
    if (error || !data) break;
    out.push(...data);
    if (data.length < PAGE_ROWS) break;
  }
  return out;
}
