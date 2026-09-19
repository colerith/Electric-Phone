import { z } from 'zod';
export const MAX_POST_TAGS = 8;
export const PostTagsSchema = z
  .array(z.string())
  .catch([])
  .transform(values =>
    [
      ...new Set(
        values
          .map(value =>
            value
              .trim()
              .replace(/^[#＃]+/, '')
              .replace(/\s+/g, '')
              .slice(0, 24),
          )
          .filter(Boolean),
      ),
    ].slice(0, MAX_POST_TAGS),
  )
  .default([]);
export const postTagsPrompt =
  '动态可附 tags 字符串数组，选取 0–4 个贴合正文的简短话题；每个标签不含 #、空格或 HTML，最多 24 字，最多 8 个。不要重复堆砌标签，不把标签混入正文，界面会显示为蓝色 #话题。';
