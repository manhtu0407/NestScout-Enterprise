const vietnamMobile = /^(?:\+?84|0)([35789]\d{8})$/;

export function toLocalVietnamPhone(raw: string): string | null {
  const match = vietnamMobile.exec(raw.trim());
  return match ? `0${match[1]}` : null;
}

export function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length < 3 ? '***' : `***${digits.slice(-3)}`;
}
