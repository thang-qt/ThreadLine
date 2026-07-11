const ALLOWED_TAGS = new Set(['A', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'EM', 'I', 'LI', 'OL', 'P', 'PRE', 'STRONG', 'UL']);

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function safeAbsoluteHref(value: string, origin: string): string | undefined {
  try {
    const url = new URL(value, origin);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function cleanNode(node: Node, document: Document, linkOrigin: string): Node | null {
  if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent ?? '');

  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const element = node as Element;
  const tagName = element.tagName.toUpperCase();
  const children = Array.from(element.childNodes)
    .map((child) => cleanNode(child, document, linkOrigin))
    .filter((child): child is Node => Boolean(child));

  if (!ALLOWED_TAGS.has(tagName)) {
    const fragment = document.createDocumentFragment();
    for (const child of children) fragment.appendChild(child);
    return fragment;
  }

  const clean = document.createElement(tagName.toLowerCase());
  if (tagName === 'A') {
    const href = safeAbsoluteHref(element.getAttribute('href') ?? '', linkOrigin);
    if (href) {
      clean.setAttribute('href', href);
      clean.setAttribute('target', '_blank');
      clean.setAttribute('rel', 'noreferrer noopener');
    }
  }

  for (const child of children) clean.appendChild(child);
  return clean;
}

export function sanitizeHtml(input: string, linkOrigin = typeof window === 'undefined' ? 'https://example.invalid' : window.location.origin): string {
  if (!input) return '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return escapeHtml(input);

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${input}</body>`, 'text/html');
  const output = document.implementation.createHTMLDocument('sanitized');
  const fragment = output.createDocumentFragment();

  for (const node of Array.from(doc.body.childNodes)) {
    const clean = cleanNode(node, output, linkOrigin);
    if (clean) fragment.appendChild(clean);
  }

  const container = output.createElement('div');
  container.appendChild(fragment);
  return container.innerHTML;
}
