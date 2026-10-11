// Keep image references bounded and local to the user request that created an
// action. Never search another conversation or download arbitrary remote URLs.
const normalizeReferenceImages = images => (Array.isArray(images) ? images : [])
  .filter(url => typeof url === 'string'
    && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(url)
    && url.length <= 8 * 1024 * 1024 + 128)
  .filter((url, index, all) => all.indexOf(url) === index)
  .slice(0, 6); // Same attachment count limit as the chat composer.

const referencesFromMessages = messages => {
  const lastUser = [...messages].reverse().find(message => message?.role === 'user');
  return normalizeReferenceImages(Array.isArray(lastUser?.content)
    ? lastUser.content.filter(part => part?.type === 'image_url').map(part => part.image_url?.url)
    : []);
};

const contentWithReferences = (text, images) => {
  const urls = normalizeReferenceImages(images);
  return urls.length ? [{ type: 'text', text }, ...urls.map(url => ({ type: 'image_url', image_url: { url } }))] : text;
};

const withoutReferencePayload = result => {
  if (!result?.context?.referenceImages) return result;
  const { referenceImages, ...context } = result.context;
  return { ...result, context, referenceImageCount: referenceImages.length };
};

module.exports = { normalizeReferenceImages, referencesFromMessages, contentWithReferences, withoutReferencePayload };
