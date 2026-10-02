export interface PreviewItem {
  file: string;
  viewBox: string;
  svg: string;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Contact sheet: every SVG inline on a checkerboard so transparency and framing are visible. */
export function renderPreview(items: PreviewItem[], title = 'xd-extract preview'): string {
  const cells = items
    .map(
      (i) =>
        `<figure><div class="art">${i.svg}</div><figcaption><b>${esc(i.file)}</b><br>viewBox ${esc(i.viewBox)}</figcaption></figure>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
body{font:14px system-ui,sans-serif;margin:24px;background:#fafafa}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px}
figure{margin:0;background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px}
.art{background:repeating-conic-gradient(#eee 0% 25%,#fff 0% 50%) 50%/16px 16px;border-radius:4px;padding:8px;display:flex;justify-content:center}
.art svg{max-width:100%;height:auto}
figcaption{margin-top:8px;color:#444;word-break:break-all}
</style></head><body>
<h1>${esc(title)}</h1>
<p>Hard-refresh if this page was open before; browsers cache it.</p>
<div class="grid">
${cells}
</div>
</body></html>
`;
}
