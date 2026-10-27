export function formatPhoneDisplay(valor: string): string {
  const raw = valor.trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  const isPlus = raw.startsWith("+");
  if (isPlus && !digits.startsWith("54")) {
    return raw;
  }

  let local = digits;
  if (local.startsWith("54")) local = local.slice(2);
  if (local.startsWith("9") && local.length === 11) local = local.slice(1);

  if (local.startsWith("11") && local.length === 10) {
    return `11 ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  if (local.length === 10) {
    return `${local.slice(0, 3)} ${local.slice(3, 6)}-${local.slice(6)}`;
  }
  return "";
}
