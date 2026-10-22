/**
 * High-performance PCD (Point Cloud Data) Parser for Three.js
 * Supports:
 * - DATA ascii
 * - DATA binary
 * - DATA binary_compressed (LZF decompression with PCL column-major ordering)
 */

export interface ParsedPCD {
  positions: Float32Array; // [x0, y0, z0, x1, y1, z1, ...]
  colors: Float32Array;    // [r0, g0, b0, r1, g1, b1, ...]
  intensities?: Float32Array;
  pointCount: number;
  min: [number, number, number];
  max: [number, number, number];
  center: [number, number, number];
  size: [number, number, number];
  header: Record<string, string>;
}

// In-browser LZF decompressor for PCL binary_compressed format
function decompressLZF(inData: Uint8Array, outLen: number): Uint8Array {
  const out = new Uint8Array(outLen);
  let i = 0;
  let o = 0;
  const inLen = inData.length;

  while (i < inLen && o < outLen) {
    const ctrl = inData[i++];
    if (ctrl < 32) {
      const len = ctrl + 1;
      out.set(inData.subarray(i, i + len), o);
      i += len;
      o += len;
    } else {
      let len = ctrl >> 5;
      let ref = o - (((ctrl & 31) << 8) + 1) - inData[i++];
      if (len === 7) {
        len += inData[i++];
      }
      len += 2;
      for (let k = 0; k < len; k++) {
        out[o++] = out[ref++];
      }
    }
  }
  return out;
}

// Authentic Multi-Color Elevation Gradient (Standard ROS RViz / Point-LIO Jet Colormap)
export function elevationToColor(
  z: number,
  minZ: number,
  maxZ: number
): [number, number, number] {
  const t = Math.max(0, Math.min(1, (z - minZ) / Math.max(0.01, maxZ - minZ)));

  // Standard RViz Jet Rainbow: Blue (Floor) -> Cyan -> Green -> Yellow -> Red (Ceiling)
  let r = 0, g = 0, b = 0;
  if (t < 0.25) {
    const s = t / 0.25;
    r = 0.05;
    g = s * 0.85;
    b = 0.95;
  } else if (t < 0.5) {
    const s = (t - 0.25) / 0.25;
    r = 0.05 + s * 0.2;
    g = 0.85 + s * 0.15;
    b = 0.95 * (1.0 - s);
  } else if (t < 0.75) {
    const s = (t - 0.5) / 0.25;
    r = 0.25 + s * 0.75;
    g = 1.0 - s * 0.35;
    b = 0.05;
  } else {
    const s = (t - 0.75) / 0.25;
    r = 1.0;
    g = 0.65 * (1.0 - s);
    b = s * 0.2;
  }
  return [r, g, b];
}

export function parsePCD(arrayBuffer: ArrayBuffer): ParsedPCD {
  const bytes = new Uint8Array(arrayBuffer);
  let headerText = "";
  let headerEnd = 0;

  // Read header (text section up to DATA line)
  for (let i = 0; i < Math.min(bytes.length, 4096); i++) {
    headerText += String.fromCharCode(bytes[i]);
    if (headerText.includes("DATA ")) {
      const nl = headerText.indexOf("\n", headerText.indexOf("DATA "));
      if (nl !== -1) {
        headerEnd = nl + 1;
        break;
      }
    }
  }

  const lines = headerText.split("\n");
  const header: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || trimmed.length === 0) continue;
    const parts = trimmed.split(/\s+/);
    header[parts[0].toUpperCase()] = parts.slice(1).join(" ");
  }

  const fields = (header["FIELDS"] || "x y z").split(/\s+/);
  const typeStr = (header["TYPE"] || "").split(/\s+/);
  const sizeStr = (header["SIZE"] || "").split(/\s+/);
  const countStr = (header["COUNT"] || "").split(/\s+/);
  const numPoints = parseInt(header["POINTS"] || header["WIDTH"] || "0", 10);
  const dataFormat = (header["DATA"] || "ascii").trim().toLowerCase();

  const xIdx = fields.indexOf("x");
  const yIdx = fields.indexOf("y");
  const zIdx = fields.indexOf("z");
  const intIdx = fields.indexOf("intensity");

  if (xIdx === -1 || yIdx === -1 || zIdx === -1) {
    throw new Error("PCD file is missing required spatial fields (x, y, z)");
  }

  const positions = new Float32Array(numPoints * 3);
  const colors = new Float32Array(numPoints * 3);
  const intensities = intIdx !== -1 ? new Float32Array(numPoints) : undefined;

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  if (dataFormat === "binary_compressed") {
    const view = new DataView(arrayBuffer, headerEnd);
    const compressedSize = view.getUint32(0, true);
    const uncompressedSize = view.getUint32(4, true);

    const compBytes = new Uint8Array(arrayBuffer, headerEnd + 8, compressedSize);
    const decomp = decompressLZF(compBytes, uncompressedSize);

    // In PCL binary_compressed, fields are stored in COLUMN-MAJOR layout:
    // e.g. [all X values] [all Y values] [all Z values] ...
    const numFields = fields.length;
    const fieldOffset = numPoints * 4; // float32 = 4 bytes

    const xFloats = new Float32Array(decomp.buffer, decomp.byteOffset + xIdx * fieldOffset, numPoints);
    const yFloats = new Float32Array(decomp.buffer, decomp.byteOffset + yIdx * fieldOffset, numPoints);
    const zFloats = new Float32Array(decomp.buffer, decomp.byteOffset + zIdx * fieldOffset, numPoints);
    const intFloats = intIdx !== -1
      ? new Float32Array(decomp.buffer, decomp.byteOffset + intIdx * fieldOffset, numPoints)
      : null;

    let pIdx = 0;
    for (let i = 0; i < numPoints; i++) {
      const x = xFloats[i];
      const y = yFloats[i];
      const z = zFloats[i];

      positions[pIdx] = x;
      positions[pIdx + 1] = y;
      positions[pIdx + 2] = z;

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;

      if (intFloats && intensities) {
        intensities[i] = intFloats[i];
      }

      pIdx += 3;
    }
  } else if (dataFormat === "binary") {
    // Interleaved binary format: [x, y, z, ...][x, y, z, ...]
    const view = new DataView(arrayBuffer, headerEnd);
    const fieldOffsets: number[] = [];
    let currentOffset = 0;
    for (let f = 0; f < fields.length; f++) {
      fieldOffsets.push(currentOffset);
      const sz = parseInt(sizeStr[f] || "4", 10);
      const cnt = parseInt(countStr[f] || "1", 10);
      currentOffset += sz * cnt;
    }
    const pointStep = currentOffset;

    let pIdx = 0;
    for (let i = 0; i < numPoints; i++) {
      const record = i * pointStep;
      const x = view.getFloat32(record + fieldOffsets[xIdx], true);
      const y = view.getFloat32(record + fieldOffsets[yIdx], true);
      const z = view.getFloat32(record + fieldOffsets[zIdx], true);

      positions[pIdx] = x;
      positions[pIdx + 1] = y;
      positions[pIdx + 2] = z;

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;

      if (intIdx !== -1 && intensities) {
        intensities[i] = view.getFloat32(record + fieldOffsets[intIdx], true);
      }

      pIdx += 3;
    }
  } else {
    // ASCII format
    const bodyText = new TextDecoder().decode(new Uint8Array(arrayBuffer, headerEnd));
    const lines = bodyText.split("\n");
    let pIdx = 0;
    for (let i = 0; i < lines.length && i < numPoints; i++) {
      const row = lines[i].trim();
      if (!row) continue;
      const parts = row.split(/\s+/);
      const x = parseFloat(parts[xIdx]);
      const y = parseFloat(parts[yIdx]);
      const z = parseFloat(parts[zIdx]);

      if (isNaN(x) || isNaN(y) || isNaN(z)) continue;

      positions[pIdx] = x;
      positions[pIdx + 1] = y;
      positions[pIdx + 2] = z;

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;

      pIdx += 3;
    }
  }

  // Precompute vertex colors based on height elevation gradient
  let cIdx = 0;
  for (let i = 0; i < numPoints; i++) {
    const z = positions[i * 3 + 2];
    const [r, g, b] = elevationToColor(z, minZ, maxZ);
    colors[cIdx] = r;
    colors[cIdx + 1] = g;
    colors[cIdx + 2] = b;
    cIdx += 3;
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;

  return {
    positions,
    colors,
    intensities,
    pointCount: numPoints,
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    center: [cx, cy, cz],
    size: [maxX - minX, maxY - minY, maxZ - minZ],
    header,
  };
}
