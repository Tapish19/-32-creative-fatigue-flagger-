import { expect, it } from 'vitest';
import seed from '../supabase/seed.sql?raw';

it('assigns five separate users to each client', () => {
  const assignments = [...seed.split('insert into public.client_users')[1].matchAll(/\((\d+), (\d+)\)/g)].map(match => [Number(match[1]), Number(match[2])]);
  expect(assignments.filter(([client]) => client === 1).map(([, user]) => user)).toEqual([1, 2, 3, 4, 5]);
  expect(assignments.filter(([client]) => client === 2).map(([, user]) => user)).toEqual([6, 7, 8, 9, 10]);
});
