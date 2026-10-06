// Hostname validity and web addresses in free text. Offline: a fixed suffix list, no DNS.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkHostname, invalidHostSentence, isValidHostname } from '../src/hostname.mjs';
import { domainsIn } from '../src/text.mjs';

test('valid hostnames: generic, country and second-level endings', () => {
  for (const h of ['example.com.tr', 'kafe.com', 'x.co.uk', 'sakalkafe.com.tr', 'kafe.net.tr', 'avukat.av.tr', 'belediye.bel.tr',
    'okul.k12.tr', 'site.gen.tr', 'shop.web.tr', 'firma.biz.tr', 'kafe.com.au', 'cafe.de', 'kafe.istanbul', 'sakal-kafe.cafe',
    'https://www.Kafe.com/menu', 'shop.example']) {
    assert.ok(isValidHostname(h), h);
  }
  assert.equal(checkHostname('https://www.x.co.uk/a').suffix, 'co.uk');
});

test('invalid hostnames: fragments, handles, emails, files, IPs, bare endings', () => {
  const bad = {
    'a.ayranc': /unknown ending \.ayranc/,
    'foo@bar.com': /email address or handle/,
    '@handle': /handle/,
    'menu.pdf': /unknown ending \.pdf/,
    '192.168.1.10': /IP address/,
    'com.tr': /only the ending \.com\.tr/,
    'kafe': /no domain ending/,
    'sakal kafe.com': /spaces/,
    '-kafe.com': /characters/,
  };
  for (const [h, why] of Object.entries(bad)) {
    assert.equal(isValidHostname(h), false, h);
    assert.match(invalidHostSentence(h), why, h);
  }
  assert.equal(invalidHostSentence('a.ayranc'), 'a.ayranc is not a valid web address (unknown ending .ayranc)');
});

test('domainsIn: only whole web addresses, never address text, handles, emails or paths', () => {
  assert.deepEqual(domainsIn('Sakal Kafe, A.Ayrancı Mah. Çankaya'), []);
  assert.deepEqual(domainsIn('@sakal.kafe.ayranci · bilgi@sakalkafe.com'), []);
  assert.deepEqual(domainsIn('instagram.com/kafe.com.tr'), ['instagram.com']);
  assert.deepEqual(domainsIn('menu.pdf, v1.2'), []);
  assert.deepEqual(domainsIn('Web: www.SakalKafe.com.tr. Tel 0312'), ['sakalkafe.com.tr']);
  assert.deepEqual(domainsIn('https://kafe.co.uk/menu and x.com'), ['kafe.co.uk', 'x.com']);
});
