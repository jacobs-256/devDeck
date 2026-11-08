// @ts-nocheck
export default {
  name: 'CSR Generator',
  description: 'Generate private key and CSR certificate signing request',
  // form
  optional: 'Optional',
  optionalCountry: 'Optional, 2-letter code',
  placeholderOrg: 'Company name',
  placeholderOU: 'Department name',
  placeholderState: 'Province / State',
  placeholderCity: 'City',
  commonName: 'Common Name (CN)',
  organization: 'Organization (O)',
  organizationalUnit: 'Organizational Unit (OU)',
  country: 'Country (C)',
  state: 'State (ST)',
  locality: 'Locality (L)',
  keySize: 'Key Size',
  // buttons
  generating: 'Generating...',
  generate: 'Generate CSR & Private Key',
  copy: 'Copy',
  save: 'Save',
  // tabs
  tabKey: 'Private Key',
  // files
  fileLabel: 'Files',
  // error & hint
  generateFailed: 'Generation failed',
  emptyHint: 'Fill in the form and click Generate',
};
