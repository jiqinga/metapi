import { detectPlatform } from './platforms/index.js';
import { resolveProxyUrlForSite } from './siteProxy.js';
import { detectSiteInitializationPreset } from '../../shared/siteInitializationPresets.js';
import { analyzePrimarySiteUrl } from '../../shared/sitePrimaryUrl.js';

export async function detectSite(
  url: string,
  options?: { proxyUrl?: unknown; useSystemProxy?: unknown },
) {
  const analyzed = analyzePrimarySiteUrl(url);
  const detectionUrl = analyzed.canonicalUrl;
  const persistedUrl = analyzed.persistedUrl || detectionUrl;
  const preset = detectSiteInitializationPreset(detectionUrl);
  if (preset) {
    return {
      url: persistedUrl,
      platform: preset.platform,
      initializationPresetId: preset.id,
    };
  }
  // The site being detected may not exist in the DB yet (add-site flow), so
  // URL-based proxy resolution cannot see its proxy. Resolve it from the
  // caller-supplied form values instead and force it for every probe.
  const proxyUrl = resolveProxyUrlForSite({
    proxyUrl: typeof options?.proxyUrl === 'string' ? options.proxyUrl : null,
    useSystemProxy: !!options?.useSystemProxy,
  });
  const adapter = await detectPlatform(detectionUrl, { proxyUrl });
  if (!adapter) return null;
  return { url: persistedUrl, platform: adapter.platformName };
}
