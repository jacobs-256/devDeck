import { lazy } from 'react';
import { CATEGORY_LABELS, CATEGORY_ORDER, type ToolCategory, type ToolDefinition } from './types';

// Each tool is its own chunk: the shell stays small and heavy dependencies
// (YAML, XML, pinyin dictionaries) load only when a tool is opened.
const Base64Tool = lazy(() => import('../legacy-renderer/components/ModuleTools/Base64Codec/index'));
const CaGeneratorTool = lazy(() => import('../legacy-renderer/components/ModuleTools/CaGenerator/index'));
const CertViewerTool = lazy(() => import('../legacy-renderer/components/ModuleTools/CertViewer/index'));
const ClientCertTool = lazy(
  () => import('../legacy-renderer/components/ModuleTools/ClientCertGenerator/index'),
);
const CsrGeneratorTool = lazy(() => import('../legacy-renderer/components/ModuleTools/CsrGenerator/index'));
const KeyPairTool = lazy(() => import('../legacy-renderer/components/ModuleTools/RsaKeyPairGenerator/index'));
const HtmlEditorTool = lazy(() => import('../legacy-renderer/components/ModuleTools/HtmlEditor/index'));
const IpCalculatorTool = lazy(() => import('../legacy-renderer/components/ModuleTools/IpCalculator/index'));
const JsonFormatterTool = lazy(() => import('../legacy-renderer/components/ModuleTools/JsonFormatter/index'));
const JsonXmlTool = lazy(() => import('../legacy-renderer/components/ModuleTools/JsonXmlConverter/index'));
const JsonYamlTool = lazy(() => import('../legacy-renderer/components/ModuleTools/JsonYamlConverter/index'));
const JsFormatterTool = lazy(() => import('../legacy-renderer/components/ModuleTools/JsFormatter/index'));
const JwtTool = lazy(() => import('../legacy-renderer/components/ModuleTools/JwtTool/index'));
const MarkdownTool = lazy(() => import('../legacy-renderer/components/ModuleTools/MarkdownPreview/index'));
const MqttTool = lazy(() => import('../legacy-renderer/components/ModuleTools/MqttTool/index'));
const PingTestTool = lazy(() => import('../legacy-renderer/components/ModuleTools/PingTest/index'));
const PinyinTool = lazy(() => import('../legacy-renderer/components/ModuleTools/PinyinConverter/index'));
const QrCodeTool = lazy(() => import('../legacy-renderer/components/ModuleTools/QrCodeGenerator/index'));
const RegexTesterTool = lazy(() => import('../legacy-renderer/components/ModuleTools/RegexTester/index'));
const StringEncryptTool = lazy(() => import('../legacy-renderer/components/ModuleTools/StringEncrypt/index'));
const TextDiffTool = lazy(() => import('../legacy-renderer/components/ModuleTools/TextDiff/index'));
const TracertTool = lazy(() => import('../legacy-renderer/components/ModuleTools/TracertTest/index'));
const UnicodeTool = lazy(() => import('../legacy-renderer/components/ModuleTools/UnicodeTool/index'));
const UrlCodecTool = lazy(() => import('../legacy-renderer/components/ModuleTools/UrlCodec/index'));
const UuidTool = lazy(() => import('../legacy-renderer/components/ModuleTools/UuidGenerator/index'));
const WebSocketTesterTool = lazy(
  () => import('../legacy-renderer/components/ModuleTools/WebSocketTester/index'),
);
const WifiQrTool = lazy(() => import('../legacy-renderer/components/ModuleTools/WifiQrGenerator/index'));

/**
 * Every built-in tool, in display order.
 *
 * Tools are renderer-only. If a tool needs privileges (files, network, SSH) it
 * must call a host command, not reach for browser/OS APIs directly.
 */
export const TOOLS: ToolDefinition[] = [
  {
    id: 'base64',
    nameKey: 'tool.base64.name',
    descriptionKey: 'tool.base64.desc',
    name: 'Base64',
    description: 'Encode and decode Base64 / Base64URL text, byte-exact for UTF-8.',
    category: 'encoding',
    keywords: ['b64', 'encode', 'decode', 'base64url'],
    component: Base64Tool,
  },
  {
    id: 'url-codec',
    nameKey: 'tool.url-codec.name',
    descriptionKey: 'tool.url-codec.desc',
    name: 'URL Codec',
    description: 'Percent-encode URLs and components, or parse a query string.',
    category: 'encoding',
    keywords: ['urlencode', 'urldecode', 'query', 'percent'],
    component: UrlCodecTool,
  },
  {
    id: 'json-formatter',
    nameKey: 'tool.json-formatter.name',
    descriptionKey: 'tool.json-formatter.desc',
    name: 'JSON Formatter',
    description: 'Format, minify, sort, and inspect JSON with parse-error positions.',
    category: 'data',
    keywords: ['json', 'pretty', 'minify', 'beautify'],
    component: JsonFormatterTool,
  },
  {
    id: 'json-yaml',
    nameKey: 'tool.json-yaml.name',
    descriptionKey: 'tool.json-yaml.desc',
    name: 'JSON ↔ YAML',
    description: 'Convert between JSON and YAML with readable errors.',
    category: 'data',
    keywords: ['yaml', 'json', 'convert', 'config'],
    component: JsonYamlTool,
  },
  {
    id: 'json-xml',
    nameKey: 'tool.json-xml.name',
    descriptionKey: 'tool.json-xml.desc',
    name: 'JSON ↔ XML',
    description: 'Convert between JSON and XML and validate XML with line/column errors.',
    category: 'data',
    keywords: ['xml', 'json', 'convert', 'soap'],
    component: JsonXmlTool,
  },
  {
    id: 'unicode',
    nameKey: 'tool.unicode.name',
    descriptionKey: 'tool.unicode.desc',
    name: 'Unicode Inspector',
    description: 'Escape/unescape \\u sequences and inspect code points, UTF-8, and UTF-16 sizes.',
    category: 'encoding',
    keywords: ['unicode', 'escape', 'codepoint', 'utf8'],
    component: UnicodeTool,
  },
  {
    id: 'pinyin',
    nameKey: 'tool.pinyin.name',
    descriptionKey: 'tool.pinyin.desc',
    name: 'Pinyin Converter',
    description: 'Convert Chinese text to pinyin with tone marks, numbers, or initials.',
    category: 'text',
    keywords: ['pinyin', 'chinese', 'initials', 'romanize'],
    component: PinyinTool,
  },
  {
    id: 'tcp-ping',
    nameKey: 'tool.tcp-ping.name',
    descriptionKey: 'tool.tcp-ping.desc',
    name: 'Ping Test',
    description: 'Test host connectivity and latency with the system ping command.',
    category: 'network',
    keywords: ['ping', 'latency', 'reachability', 'icmp'],
    component: PingTestTool,
  },
  {
    id: 'mqtt',
    nameKey: 'tool.mqtt.name',
    descriptionKey: 'tool.mqtt.desc',
    name: 'MQTT Client',
    description: 'Connect to an MQTT broker, subscribe, publish, and inspect messages live.',
    category: 'network',
    keywords: ['mqtt', 'broker', 'publish', 'subscribe', 'iot'],
    component: MqttTool,
  },
  {
    id: 'tracert',
    nameKey: 'tool.tracert.name',
    descriptionKey: 'tool.tracert.desc',
    name: 'Tracert',
    description: 'Trace the network route to a host using the OS traceroute command.',
    category: 'network',
    keywords: ['traceroute', 'tracert', 'route', 'hops'],
    component: TracertTool,
  },
  {
    id: 'websocket-tester',
    nameKey: 'tool.websocket-tester.name',
    descriptionKey: 'tool.websocket-tester.desc',
    name: 'WebSocket Tester',
    description: 'Connect to a ws:// or wss:// endpoint, send messages, and inspect traffic.',
    category: 'network',
    keywords: ['websocket', 'ws', 'wss', 'realtime'],
    component: WebSocketTesterTool,
  },
  {
    id: 'wifi-qr',
    nameKey: 'tool.wifi-qr.name',
    descriptionKey: 'tool.wifi-qr.desc',
    name: 'Wi-Fi QR Code',
    description: 'Build a WIFI: payload and QR code for a network without exposing the password.',
    category: 'network',
    keywords: ['wifi', 'qr', 'ssid', 'network'],
    component: WifiQrTool,
  },
  {
    id: 'key-pair',
    nameKey: 'tool.key-pair.name',
    descriptionKey: 'tool.key-pair.desc',
    name: 'RSA Key Pair Generator',
    description: 'Generate RSA private and public keys in PEM format.',
    category: 'crypto',
    keywords: ['key', 'rsa', 'pem'],
    component: KeyPairTool,
  },
  {
    id: 'ca-generator',
    nameKey: 'tool.ca-generator.name',
    descriptionKey: 'tool.ca-generator.desc',
    name: 'CA Generator',
    description: 'Create a self-signed root CA certificate and key for local development.',
    category: 'crypto',
    keywords: ['ca', 'certificate', 'x509', 'root'],
    component: CaGeneratorTool,
  },
  {
    id: 'csr-generator',
    nameKey: 'tool.csr-generator.name',
    descriptionKey: 'tool.csr-generator.desc',
    name: 'CSR Generator',
    description: 'Create a certificate signing request and keep the private key local.',
    category: 'crypto',
    keywords: ['csr', 'pem', 'request', 'certificate'],
    component: CsrGeneratorTool,
  },
  {
    id: 'client-cert',
    nameKey: 'tool.client-cert.name',
    descriptionKey: 'tool.client-cert.desc',
    name: 'Issue Certificate',
    description: 'Sign a CSR with your CA to issue a client or server certificate.',
    category: 'crypto',
    keywords: ['issue', 'sign', 'client certificate', 'mtls'],
    component: ClientCertTool,
  },
  {
    id: 'cert-viewer',
    nameKey: 'tool.cert-viewer.name',
    descriptionKey: 'tool.cert-viewer.desc',
    name: 'Certificate Viewer',
    description: 'Parse a PEM certificate: subject, issuer, validity, serial, and SHA-256.',
    category: 'crypto',
    keywords: ['certificate', 'x509', 'pem', 'inspect'],
    component: CertViewerTool,
  },
  {
    id: 'jwt',
    nameKey: 'tool.jwt.name',
    descriptionKey: 'tool.jwt.desc',
    name: 'JWT Decoder',
    description: 'Decode JWT header and payload and check expiry (no signature check).',
    category: 'crypto',
    keywords: ['jwt', 'token', 'claims', 'exp'],
    component: JwtTool,
  },
  {
    id: 'uuid',
    nameKey: 'tool.uuid.name',
    descriptionKey: 'tool.uuid.desc',
    name: 'UUID Generator',
    description: 'Generate v4 random and v7 time-ordered UUIDs in batches.',
    category: 'data',
    keywords: ['uuid', 'guid', 'v4', 'v7'],
    component: UuidTool,
  },
  {
    id: 'html-editor',
    nameKey: 'tool.html-editor.name',
    descriptionKey: 'tool.html-editor.desc',
    name: 'HTML Editor',
    description: 'Edit HTML with a live, sandboxed preview (scripts disabled).',
    category: 'text',
    keywords: ['html', 'preview', 'editor', 'markup'],
    component: HtmlEditorTool,
  },
  {
    id: 'js-formatter',
    nameKey: 'tool.js-formatter.name',
    descriptionKey: 'tool.js-formatter.desc',
    name: 'JS Formatter',
    description: 'Beautify or minify JavaScript locally with js-beautify and terser.',
    category: 'data',
    keywords: ['javascript', 'beautify', 'minify', 'format'],
    component: JsFormatterTool,
  },
  {
    id: 'string-encrypt',
    nameKey: 'tool.string-encrypt.name',
    descriptionKey: 'tool.string-encrypt.desc',
    name: 'String Encryption',
    description: 'Encrypt and decrypt text with AES-256-GCM and a password.',
    category: 'crypto',
    keywords: ['aes', 'encrypt', 'decrypt', 'password'],
    component: StringEncryptTool,
  },
  {
    id: 'regex-tester',
    nameKey: 'tool.regex-tester.name',
    descriptionKey: 'tool.regex-tester.desc',
    name: 'Regex Tester',
    description: 'Test JavaScript regular expressions with groups, named groups, and replace.',
    category: 'text',
    keywords: ['regex', 'regexp', 'match', 'replace'],
    component: RegexTesterTool,
  },
  {
    id: 'markdown-preview',
    nameKey: 'tool.markdown-preview.name',
    descriptionKey: 'tool.markdown-preview.desc',
    name: 'Markdown Preview',
    description: 'Render Markdown (GFM) with a sanitized live preview and outline.',
    category: 'text',
    keywords: ['markdown', 'preview', 'md', 'gfm'],
    component: MarkdownTool,
  },
  {
    id: 'text-diff',
    nameKey: 'tool.text-diff.name',
    descriptionKey: 'tool.text-diff.desc',
    name: 'Text Diff',
    description: 'Compare two texts by line, word, or character and copy a unified patch.',
    category: 'text',
    keywords: ['diff', 'compare', 'patch', 'merge'],
    component: TextDiffTool,
  },
  {
    id: 'qr-code',
    nameKey: 'tool.qr-code.name',
    descriptionKey: 'tool.qr-code.desc',
    name: 'QR Code Generator',
    description: 'Generate a QR code as SVG with selectable error correction.',
    category: 'encoding',
    keywords: ['qr', 'barcode', 'svg', 'url'],
    component: QrCodeTool,
  },
  {
    id: 'ip-calculator',
    nameKey: 'tool.ip-calculator.name',
    descriptionKey: 'tool.ip-calculator.desc',
    name: 'IP Calculator',
    description: 'Analyze IPv4 CIDR ranges: network, broadcast, host range, and binary form.',
    category: 'network',
    keywords: ['ipv4', 'cidr', 'subnet', 'netmask'],
    component: IpCalculatorTool,
  },
];

/** Case-insensitive search across name, description, category, and keywords. */
export function filterTools(query: string, extraText?: (tool: ToolDefinition) => string[]): ToolDefinition[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return TOOLS;
  return TOOLS.filter((tool) => {
    const haystack = [
      tool.id,
      tool.name,
      tool.description,
      CATEGORY_LABELS[tool.category],
      ...tool.keywords,
      ...(extraText ? extraText(tool) : []),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function groupTools(
  tools: ToolDefinition[],
): Array<{ category: ToolCategory; items: ToolDefinition[] }> {
  return CATEGORY_ORDER.map((category) => ({
    category,
    items: tools.filter((tool) => tool.category === category),
  })).filter((group) => group.items.length > 0);
}
