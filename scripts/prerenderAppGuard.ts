import { COUNTRIES } from '@daysoff/engine/data/countries';
import { EMPLOYER_STORAGE_PREFIX, defaultEmployerCalendar, employerScope, encodeEmployerCalendar } from '../src/personal/employerCalendar';
import { REQUEST_STORAGE_KEY } from '../src/personal/requestLedger';

const countryCodes = JSON.stringify(COUNTRIES.map(({ code }) => code));
const scheduledStatus = /"status"\s*:\s*"(?:approved|completed)"/;

/** The browser's private plan can differ from the public, static planner markup. */
export function prerenderAppGuard(country: string, renderedDate: string, detectLocale: boolean): string {
  const employerKey = JSON.stringify(EMPLOYER_STORAGE_PREFIX + employerScope(country));
  const defaultCalendar = JSON.stringify(encodeEmployerCalendar(defaultEmployerCalendar(country)));
  const localeCheck = detectLocale ? `
    const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
    const known = ${countryCodes};
    const localized = languages.map(locale => locale?.split('-')[1]?.toUpperCase()).find(code => known.includes(code));
    if (localized && localized !== ${JSON.stringify(country)}) return showLoading();` : '';
  return `(function () {
    const showLoading = () => document.documentElement.setAttribute('data-plan-link', '');
    if (window.location.search) return showLoading();
    const now = new Date();
    const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
    if (today !== ${JSON.stringify(renderedDate)}) return showLoading();${localeCheck}
    try {
      const employer = localStorage.getItem(${employerKey});
      if (employer && employer !== ${defaultCalendar}) return showLoading();
      const requests = localStorage.getItem(${JSON.stringify(REQUEST_STORAGE_KEY)});
      if (requests && /${scheduledStatus.source}/.test(requests)) showLoading();
    } catch {}
  })();`;
}
