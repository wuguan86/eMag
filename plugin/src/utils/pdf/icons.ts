import type { jsPDF } from 'jspdf';
import type { ComplianceIcon } from '../../types';
import { iconData } from './iconData';

export interface LabelIcon { id: ComplianceIcon; x: number; y: number; width: number; height: number }
type VectorPath = { d: string; operations: readonly { op: string; c: readonly number[] }[]; fill: string; stroke: string; strokeWidth: number; evenOdd: boolean };

export function iconDimensions(id: ComplianceIcon) {
  const data = iconData[id];
  // PAP20 的数字与材料缩写需实际可辨识，独立设为 8mm；旧四标志保持原尺寸与比例。
  const height = id === 'age' ? 10 : id === 'pap20' ? 8 : id === 'weee' ? 7 : id === 'ce' ? 5 : 6;
  return { height, width: data.width / data.height * height };
}

export function gpsrIconDimensions(id: ComplianceIcon) {
  const data = iconData[id];
  const height = id === 'age' ? 7 : id === 'weee' ? 7 : 6;
  return { height, width: data.width / data.height * height };
}

export function drawIcon(doc: jsPDF, icon: LabelIcon) {
  const data = iconData[icon.id];
  const scale = icon.width / data.width;
  for (const path of data.paths as readonly VectorPath[]) {
    doc.setFillColor(path.fill === '#ED1C24' ? '#ED1C24' : '#000000');
    doc.setDrawColor('#000000');
    doc.setLineWidth(path.strokeWidth * scale);
    doc.path(path.operations.map((operation) => ({ op: operation.op, c: operation.c.map((value, index) => value * scale + (index % 2 ? icon.y : icon.x)) })));
    if (path.fill !== 'none' && path.stroke !== 'none') doc.fillStroke();
    else if (path.fill !== 'none') { if (path.evenOdd) doc.fillEvenOdd(); else doc.fill(); }
    else doc.stroke();
  }
}

export function iconSvg(icon: LabelIcon) {
  const data = iconData[icon.id];
  const paths = (data.paths as readonly VectorPath[]).map((path) => `<path d="${path.d}" fill="${path.fill}" stroke="${path.stroke}" stroke-width="${path.strokeWidth}" fill-rule="${path.evenOdd ? 'evenodd' : 'nonzero'}"/>`).join('');
  return `<svg x="${icon.x}" y="${icon.y}" width="${icon.width}" height="${icon.height}" viewBox="0 0 ${data.width} ${data.height}">${paths}</svg>`;
}
