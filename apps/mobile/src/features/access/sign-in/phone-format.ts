const countryCode = '84';
const mobileDigitLimit = 10;
const completeLength = 9;

export function toNationalDigits(text: string): string {
  const trimmed = text.trim();
  let digits = trimmed.replace(/\D/g, '');
  if ((trimmed.startsWith('+84') || digits.startsWith(countryCode)) && digits.length > completeLength + 1) {
    digits = digits.slice(countryCode.length);
  }
  return digits.slice(0, digits.startsWith('0') ? mobileDigitLimit : completeLength);
}

export function formatNational(digits: string): string {
  const groups = digits.startsWith('0') ? [4, 3, 3] : [3, 3, 3];
  const parts: string[] = [];
  let offset = 0;
  for (const size of groups) {
    if (offset >= digits.length) break;
    parts.push(digits.slice(offset, offset + size));
    offset += size;
  }
  return parts.join(' ');
}

export function isCompleteNational(digits: string): boolean {
  return digits.length >= (digits.startsWith('0') ? mobileDigitLimit : completeLength);
}

export function toDialable(digits: string): string {
  return `+${countryCode}${digits.replace(/^0/, '')}`;
}
