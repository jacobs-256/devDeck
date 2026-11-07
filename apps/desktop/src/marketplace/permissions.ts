/** Human-readable metadata for every plugin permission. */

export interface PermissionInfo {
  id: string;
  label: string;
  summary: string;
  /** Privileged capabilities that get a stronger warning in the consent screen. */
  sensitive: boolean;
  /** Reserved permissions are accepted in manifests but unavailable at runtime. */
  implemented: boolean;
}

export const PERMISSION_INFO: Record<string, PermissionInfo> = {
  'storage:kv': {
    id: 'storage:kv',
    label: 'Plugin storage',
    summary: 'Store settings and data in a host-managed key/value store (8 MiB).',
    sensitive: false,
    implemented: true,
  },
  'http:proxy': {
    id: 'http:proxy',
    label: 'HTTP via host',
    summary: 'Make HTTP requests through DevToolBox to allowlisted domains.',
    sensitive: false,
    implemented: true,
  },
  'http:external': {
    id: 'http:external',
    label: 'Direct HTTP',
    summary: 'Make HTTP requests from the plugin to allowlisted domains.',
    sensitive: false,
    implemented: true,
  },
  'fs:dialog': {
    id: 'fs:dialog',
    label: 'File dialogs',
    summary: 'Ask you to pick files to open or save.',
    sensitive: false,
    implemented: true,
  },
  'fs:read': {
    id: 'fs:read',
    label: 'Read selected files',
    summary: 'Read files you selected in a dialog.',
    sensitive: true,
    implemented: true,
  },
  'fs:write': {
    id: 'fs:write',
    label: 'Write selected files',
    summary: 'Write files you selected in a save dialog.',
    sensitive: true,
    implemented: true,
  },
  'fs:plugin-data': {
    id: 'fs:plugin-data',
    label: 'Plugin data folder',
    summary: 'Read and write files in its own data folder.',
    sensitive: true,
    implemented: true,
  },
  'net:socket': {
    id: 'net:socket',
    label: 'Raw sockets',
    summary: 'Open TCP/UDP sockets and servers.',
    sensitive: true,
    implemented: true,
  },
  'net:ssh': {
    id: 'net:ssh',
    label: 'SSH and SFTP',
    summary: 'Open SSH terminals and SFTP connections.',
    sensitive: true,
    implemented: true,
  },
  'system:openExternal': {
    id: 'system:openExternal',
    label: 'Open links',
    summary: 'Open http(s) links in your browser.',
    sensitive: false,
    implemented: true,
  },
  'system:revealPath': {
    id: 'system:revealPath',
    label: 'Reveal files',
    summary: 'Show files in your file manager.',
    sensitive: true,
    implemented: true,
  },
  'system:openPath': {
    id: 'system:openPath',
    label: 'Open files',
    summary: 'Open files with their default application.',
    sensitive: true,
    implemented: true,
  },
  'system:notifications': {
    id: 'system:notifications',
    label: 'Notifications',
    summary: 'Send desktop notifications.',
    sensitive: false,
    implemented: true,
  },
  'system:env:read': {
    id: 'system:env:read',
    label: 'Environment variables',
    summary: 'Read specific environment variables listed in the manifest.',
    sensitive: true,
    implemented: true,
  },
  'system:getInfo': {
    id: 'system:getInfo',
    label: 'System info',
    summary: 'Read app version and platform information.',
    sensitive: false,
    implemented: true,
  },
  'clipboard:write': {
    id: 'clipboard:write',
    label: 'Clipboard',
    summary: 'Write to your clipboard.',
    sensitive: false,
    implemented: true,
  },
  'log:write': {
    id: 'log:write',
    label: 'Diagnostic log',
    summary: 'Write entries to the rotating plugin log.',
    sensitive: false,
    implemented: true,
  },
  'theme:read': {
    id: 'theme:read',
    label: 'Theme',
    summary: 'Read the current light/dark theme.',
    sensitive: false,
    implemented: true,
  },
  bluetooth: {
    id: 'bluetooth',
    label: 'Bluetooth (reserved)',
    summary: 'Reserved for a future release; unavailable today.',
    sensitive: true,
    implemented: false,
  },
  serial: {
    id: 'serial',
    label: 'Serial ports (reserved)',
    summary: 'Reserved for a future release; unavailable today.',
    sensitive: true,
    implemented: false,
  },
  usb: {
    id: 'usb',
    label: 'USB devices (reserved)',
    summary: 'Reserved for a future release; unavailable today.',
    sensitive: true,
    implemented: false,
  },
};

export function permissionInfo(id: string): PermissionInfo {
  return (
    PERMISSION_INFO[id] ?? {
      id,
      label: id,
      summary: 'Unknown permission. Treat this plugin with caution.',
      sensitive: true,
      implemented: false,
    }
  );
}

/** Unique permissions, most privileged first, then alphabetical. */
export function describePermissions(ids: string[]): PermissionInfo[] {
  const unique = Array.from(new Set(ids)).map(permissionInfo);
  return unique.sort((a, b) => {
    if (a.sensitive !== b.sensitive) return a.sensitive ? -1 : 1;
    if (a.implemented !== b.implemented) return a.implemented ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}
