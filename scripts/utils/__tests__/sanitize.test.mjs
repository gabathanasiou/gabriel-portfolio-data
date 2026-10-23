import { describe, it, expect } from 'vitest';
import {
  isUnsafeUrl,
  sanitizeJournalContent,
  sanitizeDomain,
  escapeXml
} from '../../lib/sanitize.mjs';

describe('isUnsafeUrl', () => {
  it('rejects executable and local-file schemes', () => {
    expect(isUnsafeUrl('javascript:alert(1)')).toBe(true);
    expect(isUnsafeUrl('  JaVaScRiPt:alert(1)')).toBe(true);
    expect(isUnsafeUrl('vbscript:msgbox(1)')).toBe(true);
    expect(isUnsafeUrl('data:text/html;base64,PHNjcmlwdD4=')).toBe(true);
    expect(isUnsafeUrl('file:///etc/passwd')).toBe(true);
    expect(isUnsafeUrl('blob:https://evil.example/id')).toBe(true);
  });

  it('sees through whitespace and entity obfuscation', () => {
    expect(isUnsafeUrl('java\tscript:alert(1)')).toBe(true);
    expect(isUnsafeUrl('java\nscript:alert(1)')).toBe(true);
    expect(isUnsafeUrl('&#106;avascript:alert(1)')).toBe(true);
    expect(isUnsafeUrl('&#x6a;avascript:alert(1)')).toBe(true);
    expect(isUnsafeUrl('javascript&colon;alert(1)')).toBe(true);
  });

  it('allows normal destinations, anchors and relative paths', () => {
    expect(isUnsafeUrl('https://example.com/a?b=1#c')).toBe(false);
    expect(isUnsafeUrl('mailto:hi@example.com')).toBe(false);
    expect(isUnsafeUrl('tel:+441234567890')).toBe(false);
    expect(isUnsafeUrl('/work/a-film')).toBe(false);
    expect(isUnsafeUrl('./a-film')).toBe(false);
    expect(isUnsafeUrl('#section')).toBe(false);
    expect(isUnsafeUrl('')).toBe(false);
    expect(isUnsafeUrl(undefined)).toBe(false);
  });
});

describe('sanitizeJournalContent', () => {
  it('strips event handlers and disallowed tags', () => {
    const output = sanitizeJournalContent('<img src=x onerror=alert(1)><script>alert(1)</script>done');
    expect(output).not.toContain('onerror');
    expect(output).not.toContain('<img');
    expect(output).not.toContain('<script');
    expect(output).not.toContain('alert(1)');
    expect(output).toContain('done');
  });

  it('strips dangerous href schemes but keeps the text', () => {
    expect(sanitizeJournalContent('<a href="javascript:alert(1)">click</a>')).toBe('<a>click</a>');
    expect(sanitizeJournalContent('<a href="data:text/html,x">click</a>')).toBe('<a>click</a>');
  });

  it('drops unsafe markdown links and keeps the label', () => {
    expect(sanitizeJournalContent('[click](javascript:alert(1))')).toBe('click');
    expect(sanitizeJournalContent('[click](java\tscript:alert(1))')).toBe('click');
    expect(sanitizeJournalContent('[click](&#106;avascript:alert(1))')).toBe('click');
    expect(sanitizeJournalContent('![alt](data:image/png;base64,AAAA)')).toBe('alt');
  });

  it('preserves ordinary markdown and safe inline HTML', () => {
    const markdown = '> a quote\n\n- one\n- two\n\n**bold** and [link](https://example.com/a_(b))\n\n<b>html</b>';
    expect(sanitizeJournalContent(markdown)).toBe(markdown);
  });

  it('handles empty input', () => {
    expect(sanitizeJournalContent('')).toBe('');
    expect(sanitizeJournalContent(null)).toBe('');
    expect(sanitizeJournalContent(undefined)).toBe('');
  });
});

describe('sanitizeDomain', () => {
  it('accepts bare hostnames', () => {
    expect(sanitizeDomain('directedbygabriel.com')).toBe('directedbygabriel.com');
    expect(sanitizeDomain('  LemonPost.Studio  ')).toBe('lemonpost.studio');
    expect(sanitizeDomain('sub.example.co.uk')).toBe('sub.example.co.uk');
  });

  it('rejects markup, newlines, protocols, ports and paths', () => {
    expect(sanitizeDomain('evil.com\n</loc><script>alert(1)</script>')).toBe('');
    expect(sanitizeDomain('https://example.com')).toBe('');
    expect(sanitizeDomain('example.com/path')).toBe('');
    expect(sanitizeDomain('example.com:8080')).toBe('');
    expect(sanitizeDomain('localhost')).toBe('');
    expect(sanitizeDomain('')).toBe('');
    expect(sanitizeDomain(null)).toBe('');
  });
});

describe('escapeXml', () => {
  it('neutralises markup and control characters', () => {
    expect(escapeXml('</loc><script>alert(1)</script>')).toBe(
      '&lt;/loc&gt;&lt;script&gt;alert(1)&lt;/script&gt;'
    );
    expect(escapeXml('a\u0000b\u001fc')).toBe('abc');
    expect(escapeXml('Tom & Jerry "quoted"')).toBe('Tom &amp; Jerry &quot;quoted&quot;');
    expect(escapeXml(undefined)).toBe('');
  });
});
