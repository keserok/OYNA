/**
 * PII maskeleme yardımcıları (Karar #39): panel yüzeyi PII'yi varsayılan
 * maskeli gösterir; gerçek değer yalnız audit'li admin_reveal_pii RPC'sinden
 * gelir. Tam sunucu-taraflı kolon maskeleme Wave 10 kapsamındadır.
 */

export const maskEmail = (email: string): string => {
  if (email.includes('•')) return email; // sunucu zaten maskeledi
  const [local, domain] = email.split('@');
  if (!domain) return '•••';
  const tld = domain.includes('.') ? domain.slice(domain.lastIndexOf('.')) : '';
  return `${local.slice(0, 2)}•••@${domain.slice(0, 1)}•••${tld}`;
};

export const maskPhone = (phone: string): string => {
  if (phone.includes('•')) return phone; // sunucu zaten maskeledi
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return '•••';
  return `${phone.slice(0, 4)} ••• •• ${digits.slice(-2)}`;
};
