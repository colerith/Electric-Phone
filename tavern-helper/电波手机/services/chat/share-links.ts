export type SharedLink = { url: string; title: string; siteName: string };
const sites: [RegExp, string][] = [
  [/(^|\.)(xiaohongshu\.com|xhslink\.com)$/, '小红书'],
  [/(^|\.)(bilibili\.com|b23\.tv)$/, '哔哩哔哩'],
  [/(^|\.)douyin\.com$/, '抖音'],
  [/(^|\.)weibo\.(com|cn)$/, '微博'],
  [/(^|\.)zhihu\.com$/, '知乎'],
  [/^mp\.weixin\.qq\.com$/, '微信公众号'],
];
export function linkSiteName(url: string): string {
  try {
    const host = new URL(url).hostname;
    return sites.find(([pattern]) => pattern.test(host))?.[1] || host;
  } catch {
    return '';
  }
}
export function parseSharedLinks(input: string): SharedLink[] {
  const source = input.replace(/&amp;/gi, '&');
  const pattern =
    /https?:\/\/[^\s<>"'`【】「」『』，。！？；、]+|(?:xhsdiscover|bilibili):\/\/[^\s<>"'`【】，。！？]+|(?:www\.[a-z\d.-]+\.[a-z]{2,}|(?:[a-z\d-]+\.)*(?:b23\.tv|bilibili\.com|xhslink\.com|xiaohongshu\.com|douyin\.com|weibo\.com|zhihu\.com))\/[^\s<>"'`【】，。！？；、]*|\bBV[a-z\d]{10}\b|\bav\d{2,}\b/gi;
  const links: SharedLink[] = [];
  let previousEnd = 0;
  for (const match of source.matchAll(pattern)) {
    let value = match[0].replace(/[)\]）】.,!?;]+$/g, '');
    if (/^BV[a-z\d]{10}$/i.test(value)) value = `https://www.bilibili.com/video/BV${value.slice(2)}`;
    else if (/^av\d+$/i.test(value)) value = `https://www.bilibili.com/video/${value.toLowerCase()}`;
    else if (/^xhsdiscover:/i.test(value)) {
      const app = /^xhsdiscover:\/\/item\/(?:discovery\.)?([a-f\d]{24})(\?[^#]*)?/i.exec(value);
      if (!app) continue;
      value = `https://www.xiaohongshu.com/explore/${app[1]}${app[2] || ''}`;
    } else if (/^bilibili:/i.test(value)) {
      const app = /^bilibili:\/\/video\/(BV[a-z\d]{10}|(?:av)?\d+)(\?[^#]*)?$/i.exec(value);
      if (!app) continue;
      const id = /^\d+$/.test(app[1]) ? `av${app[1]}` : app[1];
      value = `https://www.bilibili.com/video/${id}${app[2] || ''}`;
    } else if (!/^https?:/i.test(value)) value = `https://${value}`;
    try {
      const url = new URL(value);
      if (!/^https?:$/.test(url.protocol) || url.username || url.password || links.some(link => link.url === url.href))
        continue;
      const prefix = source.slice(previousEnd, match.index);
      const titleMatches = [...prefix.matchAll(/[【〖]([^】〗\n]{1,300})[】〗]/g)];
      let title = titleMatches.at(-1)?.[1]?.trim() || '';
      if (/\|\s*小红书/.test(title))
        title = title
          .split(/\s*\|\s*小红书/)[0]
          .replace(/\s+-\s+[^-]+$/, '')
          .trim();
      title = title.replace(/[-_\s]+哔哩哔哩(?:_bilibili)?$/i, '').trim();
      links.push({ url: url.href, title, siteName: linkSiteName(url.href) });
      previousEnd = match.index + match[0].length;
      if (links.length === 3) break;
    } catch {
      /* Keep unrecognized share text as ordinary message content. */
    }
  }
  return links;
}
export function extractWebLinks(text: string): string[] {
  return parseSharedLinks(text).map(link => link.url);
}
