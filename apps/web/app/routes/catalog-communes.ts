import type { Route } from './+types/catalog-communes';
import { fetchCommunes } from '~/lib/catalog.server';

/** Lets the tutor form load the communes of a province when it is ticked. */
export async function loader({ request }: Route.LoaderArgs) {
  const parentId = new URL(request.url).searchParams.get('parentId');
  if (!parentId) throw new Response('Bad request', { status: 400 });
  return { communes: await fetchCommunes(parentId) };
}
