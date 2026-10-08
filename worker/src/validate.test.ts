import { describe, expect, it } from 'vitest';
import { allowedOrigin, isAllowedTarget, isPdfResponse } from './validate';

describe('isAllowedTarget', () => {
  it('accepts the Internet Archive and its file servers over https', () => {
    expect(isAllowedTarget('https://archive.org/download/x/y.pdf')).not.toBeNull();
    expect(isAllowedTarget('https://ia801508.us.archive.org/3/items/x/y.pdf')).not.toBeNull();
    expect(isAllowedTarget('https://dn760102.eu.archive.org/0/items/x/y.pdf')).not.toBeNull();
  });

  it('rejects other hosts, look-alikes, plain http and odd URLs', () => {
    for (const url of [
      null,
      'not a url',
      'http://archive.org/download/x/y.pdf',
      'https://evilarchive.org/y.pdf',
      'https://archive.org.evil.com/y.pdf',
      'https://user:pw@archive.org/y.pdf',
      'https://archive.org:8443/y.pdf',
      'https://example.com/?u=https://archive.org',
      'file:///etc/passwd',
    ]) {
      expect(isAllowedTarget(url)).toBeNull();
    }
  });
});

describe('allowedOrigin', () => {
  it('allows the app and local development only', () => {
    expect(allowedOrigin('https://luizhenriquemartinsdias.github.io')).toBeTruthy();
    expect(allowedOrigin('http://localhost:5173')).toBeTruthy();
    expect(allowedOrigin('http://192.168.1.19:5173')).toBeTruthy();
    expect(allowedOrigin('https://someone-else.github.io')).toBeNull();
    expect(allowedOrigin('http://192.168.1.19:8080')).toBeNull();
    expect(allowedOrigin(null)).toBeNull();
  });
});

describe('isPdfResponse', () => {
  const url = new URL('https://archive.org/download/x/book.pdf');
  it('passes PDFs and generic binaries named .pdf', () => {
    expect(isPdfResponse('application/pdf', url)).toBe(true);
    expect(isPdfResponse('application/octet-stream', url)).toBe(true);
    expect(isPdfResponse('text/html; charset=utf-8', url)).toBe(false);
    expect(isPdfResponse('application/octet-stream', new URL('https://archive.org/x.zip'))).toBe(false);
  });
});
