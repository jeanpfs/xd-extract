import type { AgcDocument, AgcNode } from './agc';

/** Every non-instance node by id: the places a symbol instance can take its content from. */
export type SyncIndex = Map<string, AgcNode>;

const MAX_DEPTH = 64;

const childLists = (n: AgcNode): AgcNode[][] => {
  const lists: AgcNode[][] = [];
  for (const l of [n.group?.children, n.shape?.children, n.artboard?.children]) if (l) lists.push(l);
  return lists;
};

/** Index the nodes of every document that can hold a master (all artboards and the pasteboard). */
export function buildSyncIndex(docs: AgcDocument[], resources?: AgcDocument): SyncIndex {
  const index: SyncIndex = new Map();
  const visit = (n: AgcNode): void => {
    if (n.type !== 'syncRef' && typeof n.id === 'string' && !index.has(n.id)) index.set(n.id, n);
    for (const list of childLists(n)) for (const c of list) visit(c);
  };
  for (const d of docs) for (const c of d.children ?? []) visit(c);
  // symbol masters live in the resources document, not on any artboard
  for (const c of resources?.resources?.meta?.ux?.symbols ?? []) visit(c);
  return index;
}

/**
 * A `syncRef` is an instance of a symbol or linked node: it carries only what differs from the node
 * named by `syncSourceGuid` (its own transform, and a children list in which unchanged children are
 * `syncRef` placeholders and changed ones are full nodes). This returns the plain node it stands for,
 * or the untouched `syncRef` when its source cannot be found (the caller then reports it).
 */
export function expandSync(n: AgcNode, index: SyncIndex, active: string[] = []): AgcNode {
  if (n.type !== 'syncRef') return withExpandedChildren(n, index, active);
  const id = n.syncSourceGuid;
  const source = id ? index.get(id) : undefined;
  if (!source || !id || active.includes(id) || active.length >= MAX_DEPTH) return n;

  const trail = [...active, id];
  const base = expandSync(source, index, trail);
  const out: AgcNode = { ...base };
  if (n.guid) out.id = n.guid;
  if (n.transform) out.transform = n.transform;
  if (n.group?.children && base.group) {
    out.group = { ...base.group, children: n.group.children.map((c) => expandSync(c, index, trail)) };
  }
  if (n.shape?.children && base.shape) {
    out.shape = { ...base.shape, children: n.shape.children.map((c) => expandSync(c, index, trail)) };
  }
  return out;
}

function withExpandedChildren(n: AgcNode, index: SyncIndex, active: string[]): AgcNode {
  if (!n.group?.children && !n.shape?.children) return n;
  const out: AgcNode = { ...n };
  if (n.group?.children) {
    out.group = { ...n.group, children: n.group.children.map((c) => expandSync(c, index, active)) };
  }
  if (n.shape?.children) {
    out.shape = { ...n.shape, children: n.shape.children.map((c) => expandSync(c, index, active)) };
  }
  return out;
}
