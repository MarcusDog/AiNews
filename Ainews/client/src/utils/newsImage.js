export function hasUsableNewsImage(item) {
  const value = String(item?.imageUrl || '').trim();
  if (!value) return false;
  if (/placeholder(?:-image)?\.svg/i.test(value)) return false;
  if (/^data:image\/svg/i.test(value)) return false;
  return /^https?:\/\//i.test(value);
}
