'use strict';

/**
 * Regex patterns for Malaysian financial data formats.
 * Used by DataMasker to detect and mask sensitive information.
 *
 * Order matters: more specific patterns should be checked first
 * to avoid false matches from broader patterns.
 */

module.exports = {
  // Malaysian IC Number (MyKad): YYMMDD-SS-NNNN
  IC_NUMBER: {
    pattern: /\b(\d{6})[-\s]?(\d{2})[-\s]?(\d{4})\b/g,
    type: 'ic',
    prefix: 'IC',
    validate(match) {
      // Basic validation: first 6 digits should be a plausible date
      const yy = parseInt(match.substring(0, 2), 10);
      const mm = parseInt(match.substring(2, 4), 10);
      const dd = parseInt(match.substring(4, 6), 10);
      return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
    }
  },

  // Malaysian tax reference numbers: SG/OG/C/D/CS/TA/TC/TP + 10-11 digits
  TAX_REF: {
    pattern: /\b(?:SG|OG|C|D|CS|TA|TC|TP)\d{10,11}\b/g,
    type: 'tax_ref',
    prefix: 'TAXREF'
  },

  // SSM Company Registration: 123456-A, 1234567-A, or new format 202001012345
  SSM_REG: {
    pattern: /\b(\d{6,7})[-]([A-Z])\b/g,
    type: 'ssm',
    prefix: 'REGNUM'
  },

  // Invoice/PO/DO/CN/DN patterns
  INVOICE: {
    pattern: /\b(?:INV|PO|DO|CN|DN)[-\s]?\d{4,10}\b/gi,
    type: 'invoice',
    prefix: 'INV'
  },

  // Email addresses
  EMAIL: {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    type: 'email',
    prefix: 'EMAIL'
  },

  // Malaysian phone numbers: +60 or 0 prefix
  PHONE_MY: {
    pattern: /\b(?:\+?60|0)[\s-]?(?:1[0-9]|[3-9])[\s-]?\d{3,4}[\s-]?\d{4}\b/g,
    type: 'phone',
    prefix: 'PHONE'
  },

  // Bank account numbers: 10-16 digit sequences with optional dashes/spaces
  BANK_ACCOUNT: {
    pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}(?:[-\s]?\d{1,4})?\b/g,
    type: 'account',
    prefix: 'ACCOUNT',
    // Avoid matching amounts like RM 2,341,567.80 or dates
    validate(match) {
      const digits = match.replace(/[-\s]/g, '');
      return digits.length >= 10 && digits.length <= 16;
    }
  },

  // Malaysian postcodes followed by state names (address detection)
  ADDRESS_POSTCODE: {
    pattern: /\b\d{5}\s+(?:Johor|Selangor|Kuala\s*Lumpur|KL|Penang|Pulau\s*Pinang|Perak|Sabah|Sarawak|Melaka|Negeri\s*Sembilan|Pahang|Kelantan|Terengganu|Perlis|Kedah|Putrajaya|Labuan|Cyberjaya|Shah\s*Alam)\b/gi,
    type: 'address',
    prefix: 'ADDRESS'
  }
};
