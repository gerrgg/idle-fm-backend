export function decodeHtml(str) {
  if (!str) return "";

  return (
    str
      // decode numeric entities: &#39;
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))

      // decode hex entities: &#x27;
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16))
      )

      // decode named entities
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
  );
}
