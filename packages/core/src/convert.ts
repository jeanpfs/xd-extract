import { type EmitResult, emitSvg, type Snap } from './emit';
import { measureFrame } from './frame';
import type { ParsedRoot } from './parse';
import type { Warning } from './warnings';

export interface SourceInfo {
  kind: 'share-link' | 'xd-file' | 'fixture';
  ref: string;
}

export interface Report {
  source: SourceInfo | null;
  artboard: string;
  node: string;
  frame: EmitResult['frame'];
  rule: EmitResult['rule'];
  snaps: Snap[];
  clips: number;
  warnings: Warning[];
}

export function convertRoot(
  artboardName: string,
  root: ParsedRoot,
  source: SourceInfo | null = null,
): { svg: string; report: Report } {
  const frame = measureFrame(root.node);
  const out = emitSvg(root.node, frame);
  return {
    svg: out.svg,
    report: {
      source,
      artboard: artboardName,
      node: root.node.name,
      frame: out.frame,
      rule: out.rule,
      snaps: out.snaps,
      clips: out.clips,
      warnings: root.warnings,
    },
  };
}
