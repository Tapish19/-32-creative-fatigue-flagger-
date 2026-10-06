import { hasCpcIncreaseAbove, type Analysis, type AnalysisOptions } from './fatigue';

export function buildFlagRecords(analysis: Analysis, clientId: number, userId: number, filters: AnalysisOptions) {
  if (![clientId, userId].every(id => Number.isSafeInteger(id) && id > 0)) throw new Error('Select a valid client and assigned user.');
  const creative_filter = {
    drop_threshold: analysis.drop_threshold,
    minimum_delivery_days: analysis.minimum_delivery_days,
    minimum_current_impressions: analysis.minimum_current_impressions,
    cpc_increase_threshold: filters.cpc_increase_threshold ?? null,
    filter_delivery_days: Boolean(filters.filter_delivery_days),
    filter_current_impressions: Boolean(filters.filter_current_impressions),
    selected_ad_ids: analysis.filtered_creatives.map(row => row.ad_id),
  };
  return analysis.filtered_creatives.flatMap(creative => {
    const record = { client_id: clientId, user_id: userId, ad_id: creative.ad_id, creative_name: creative.creative_name, creative_filter, dropped_on: analysis.current_window.end, current_window_start: analysis.current_window.start, current_window_end: analysis.current_window.end };
    const flags: (typeof record & { metric: 'ctr' | 'cpc'; drop_percent: number })[] = [];
    if (creative.status === 'flagged' && creative.drop !== null) flags.push({ ...record, metric: 'ctr', drop_percent: creative.drop * 100 });
    if (filters.cpc_increase_threshold !== undefined && hasCpcIncreaseAbove(creative, filters.cpc_increase_threshold)) flags.push({ ...record, metric: 'cpc', drop_percent: creative.cpc_drop! * 100 });
    return flags;
  });
}
