import { expect, it } from 'vitest';
import { parseCsv } from '../shared/csv';
const header = 'date,ad_id,creative_name,format,impressions,clicks,spend_inr\n';
const row = '2026-09-01,a,"Ad, one",video,1000,20,5';
it('parses quoted fields', () => expect(parseCsv(header + row)[0].creative_name).toBe('Ad, one'));
it('rejects invalid dates, counts, pauses, empty files and duplicates', () => {
  for (const text of [header, header + row.replace('2026-09-01', '2026-02-30'), header + row.replace('1000', '-1'), header + row.replace('1000', '0'), header + row.replace('1000', '1.5'), header + row + '\n' + row, 'date\n2026-09-01']) expect(() => parseCsv(text)).toThrow();
});
