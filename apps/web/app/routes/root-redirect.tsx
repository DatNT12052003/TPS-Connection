import { redirect } from 'react-router';
import { DEFAULT_LOCALE } from '~/lib/i18n';

export const loader = () => redirect(`/${DEFAULT_LOCALE}`);
