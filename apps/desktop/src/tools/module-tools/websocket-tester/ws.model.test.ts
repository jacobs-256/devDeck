import { describe, expect, it } from 'vitest';
import { describeData, validateWsUrl } from './ws.model';

describe('websocket helpers', () => {
  it('accepts ws and wss URLs', () => {
    expect(validateWsUrl('ws://localhost:8080/echo')).toEqual({
      ok: true,
      url: 'ws://localhost:8080/echo',
    });
    expect(validateWsUrl('wss://example.com/socket').ok).toBe(true);
  });

  it('rejects other protocols and malformed input', () => {
    expect(validateWsUrl('https://example.com').ok).toBe(false);
    expect(validateWsUrl('not a url').ok).toBe(false);
    expect(validateWsUrl('  ')).toEqual({ ok: false, error: 'Enter a WebSocket URL' });
  });

  it('normalizes URLs', () => {
    const result = validateWsUrl('  wss://Example.com/Socket  ');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url).toBe('wss://example.com/Socket');
  });

  it('renders string and binary messages', () => {
    expect(describeData('hello')).toBe('hello');
    const bytes = new TextEncoder().encode('binary');
    expect(describeData(bytes)).toBe('binary');
    expect(describeData(bytes.buffer)).toBe('binary');
  });
});
