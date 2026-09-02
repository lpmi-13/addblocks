/** Tiny declarative element builder to keep view code readable. */
type Child = Node | string | null | undefined | false;

interface Props {
  class?: string;
  text?: string;
  html?: string;
  type?: string;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  dataset?: Record<string, string>;
  style?: Partial<CSSStyleDeclaration>;
  on?: Partial<Record<keyof HTMLElementEventMap, EventListener>>;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text != null) node.textContent = props.text;
  if (props.html != null) node.innerHTML = props.html;
  if (props.type && "type" in node) (node as unknown as { type: string }).type = props.type;
  if (props.attrs) {
    for (const [k, v] of Object.entries(props.attrs)) {
      if (v === false || v == null) continue;
      node.setAttribute(k, v === true ? "" : String(v));
    }
  }
  if (props.dataset) {
    for (const [k, v] of Object.entries(props.dataset)) node.dataset[k] = v;
  }
  if (props.style) Object.assign(node.style, props.style);
  if (props.on) {
    for (const [ev, fn] of Object.entries(props.on)) {
      node.addEventListener(ev, fn as EventListener);
    }
  }
  for (const c of children) {
    if (c == null || c === false) continue;
    node.append(c);
  }
  return node;
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}
