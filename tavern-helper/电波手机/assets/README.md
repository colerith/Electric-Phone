# 图库说明

当前版本使用 [空间与银行卡独立图库](generated-collection.md)，各 5 张。以下两张是旧版历史资源，已退出设置页选择列表。

# 默认图案

通过内置 image_gen 生成，供空间封面和钱包卡面共同选择。原图为 PNG，应用内嵌 960px WebP，避免依赖外部图床。`services/artworks.ts` 保存可直接打包的资源。

- `moon-sea.png` / `moon-sea.webp`：月色海岸。
- `magnolia.png` / `magnolia.webp`：玉兰来信。

生成提示词：

1. Create a beautiful wide landscape bitmap artwork for a quiet premium diary app cover and decorative wallet card skin. Soft painterly twilight ocean, pearlescent pale blue waves, lavender distant sky, small moon, delicate silver light on water. Elegant restrained editorial illustration, no text, no letters, no logos, no card mockup, artwork fills entire rectangular canvas. Wide 3:2 composition.
2. Wide rectangular full bleed artwork for an elegant diary cover and wallet card skin, airy watercolor illustration of white magnolia blossoms and slender branches against warm ivory and pale sage green, fine paper grain, contemporary Japanese editorial composition, gentle sunlight, sophisticated delicate detail, peaceful generous negative space. No text, no letters, no logos, no mockup. Landscape 3:2.
