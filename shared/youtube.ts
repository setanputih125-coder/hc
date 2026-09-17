export function youtubeLink(
  input: string,
): { videoId?: string; playlistId?: string } | undefined {
  const value = input.trim();
  if (/^[\w-]{11}$/.test(value)) return { videoId: value };
  try {
    const url = new URL(value);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      ![
        'youtube.com',
        'www.youtube.com',
        'm.youtube.com',
        'music.youtube.com',
        'youtu.be',
      ].includes(url.hostname)
    )
      return undefined;
    const parts = url.pathname.split('/').filter(Boolean);
    const video =
      url.hostname === 'youtu.be'
        ? parts[0]
        : ['shorts', 'live', 'embed'].includes(parts[0])
          ? parts[1]
          : url.searchParams.get('v');
    const list = url.searchParams.get('list');
    const videoId = video && /^[\w-]{11}$/.test(video) ? video : undefined;
    const playlistId = list && /^[\w-]{10,100}$/.test(list) ? list : undefined;
    return videoId || playlistId ? { videoId, playlistId } : undefined;
  } catch {
    return undefined;
  }
}
