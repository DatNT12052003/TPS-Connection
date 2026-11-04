import { publicApi } from './api.server';

export type CatalogName = { id: string; nameVi: string; nameEn: string };

// A province can have over 100 communes, and one page holds 50.
const MAX_PAGES = 20;

export async function fetchCommunes(parentId: string): Promise<CatalogName[]> {
  const communes: CatalogName[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data } = await publicApi().GET('/api/v1/catalog/regions', {
      params: { query: { parentId, page, limit: 50 } },
    });
    if (!data) throw new Response('Unavailable', { status: 503 });
    communes.push(...data.data);
    if (communes.length >= data.page.total) break;
  }
  return communes;
}
