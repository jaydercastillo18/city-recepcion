type PageResult<T> = { data: T[] | null; error: { message: string } | null };

/** Fetch below Supabase's default row cap; never return a partially loaded result. */
export async function readAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<PageResult<T>> {
  const pageSize = 500;
  const rows: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await fetchPage(offset, offset + pageSize - 1);
    if (error) return { data: null, error };
    if (!data) return { data: null, error: { message: 'No se pudo cargar el detalle completo.' } };
    rows.push(...data);
    if (data.length < pageSize) return { data: rows, error: null };
  }
}
