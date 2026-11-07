// @ts-nocheck
export default {
  name: 'CA Certificate',
  description: 'Generate self-signed CA root certificate and private key',
  // form labels
  optional: 'Optional',
  optionalCountry: 'Optional, 2-letter code',
  placeholderOrg: 'Company name',
  placeholderOU: 'Department name',
  placeholderState: 'Province / State',
  placeholderCity: 'City',
  keySize: 'Key Size',
  validity: 'Validity',
  // validity options
  year1: '1 Year',
  year2: '2 Years',
  year5: '5 Years',
  year10: '10 Years',
  year20: '20 Years',
  year50: '50 Years',
  year100: '100 Years',
  // buttons
  generating: 'Generating...',
  generate: 'Generate CA Certificate',
  copy: 'Copy',
  save: 'Save',
  // tabs
  tabCert: 'Certificate',
  tabKey: 'Private Key',
  // file save
  fileLabel: 'Files',
  // error & hint
  generateFailed: 'Generation failed',
  emptyHint: 'Fill in the form and click Generate',
};
