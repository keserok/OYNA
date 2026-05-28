/**
 * Checks if a given avatar URL points to a default mock/placeholder generator
 * or if it is empty/falsy.
 */
export const isDefaultAvatar = (url: string | null | undefined): boolean => {
  if (!url) return true;
  const lowerUrl = url.toLowerCase();
  return (
    lowerUrl.includes('dicebear.com') ||
    lowerUrl.includes('pravatar.cc') ||
    lowerUrl.includes('picsum.photos') ||
    lowerUrl.trim() === ''
  );
};

/**
 * Generates clean uppercase player initials from their name.
 * Handles suffixes like "(Sen)" and multiple word names.
 */
export const getInitials = (name: string): string => {
  if (!name) return '?';
  // Strip out any trailing parenthesized details like (Sen), (Kaptan) etc.
  const cleanName = name.replace(/\([^)]*\)/g, '').trim();
  const parts = cleanName.split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }
  return parts[0] ? parts[0].charAt(0).toUpperCase() : '?';
};
