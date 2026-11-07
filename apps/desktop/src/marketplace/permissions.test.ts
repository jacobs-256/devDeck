import { describe, expect, it } from 'vitest';
import { describePermissions, permissionInfo, PERMISSION_INFO } from './permissions';

describe('permission metadata', () => {
  it('covers every permission the contract defines', () => {
    const expected = [
      'storage:kv',
      'http:proxy',
      'http:external',
      'fs:dialog',
      'fs:read',
      'fs:write',
      'fs:plugin-data',
      'net:socket',
      'net:ssh',
      'system:openExternal',
      'system:revealPath',
      'system:openPath',
      'system:notifications',
      'system:env:read',
      'system:getInfo',
      'clipboard:write',
      'log:write',
      'theme:read',
      'bluetooth',
      'serial',
      'usb',
    ];
    expect(Object.keys(PERMISSION_INFO).sort()).toEqual(expected.sort());
  });

  it('marks reserved permissions as unimplemented and sensitive', () => {
    for (const id of ['bluetooth', 'serial', 'usb']) {
      const info = permissionInfo(id);
      expect(info.implemented).toBe(false);
      expect(info.sensitive).toBe(true);
    }
  });

  it('treats unknown permissions as sensitive and unimplemented', () => {
    const info = permissionInfo('net:quic');
    expect(info.id).toBe('net:quic');
    expect(info.sensitive).toBe(true);
    expect(info.implemented).toBe(false);
    expect(info.summary).toMatch(/caution/i);
  });

  it('sorts sensitive permissions first and dedupes', () => {
    const described = describePermissions(['log:write', 'net:socket', 'log:write', 'storage:kv']);
    expect(described.map((info) => info.id)).toEqual(['net:socket', 'log:write', 'storage:kv']);
  });

  it('shows implemented permissions before reserved ones at equal sensitivity', () => {
    const described = describePermissions(['usb', 'net:socket']);
    expect(described.map((info) => info.id)).toEqual(['net:socket', 'usb']);
  });
});
