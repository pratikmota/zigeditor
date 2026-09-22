import { Directory, File } from "@bjorn3/browser_wasi_shim";
import type { Inode } from "@bjorn3/browser_wasi_shim";

const BLOCK = 512;

function readOctal(bytes: Uint8Array, start: number, len: number): number {
  let s = "";
  for (let i = 0; i < len; i++) {
    const c = bytes[start + i];
    if (c === 0 || c === 32) continue;
    s += String.fromCharCode(c);
  }
  if (!s) return 0;
  return Number.parseInt(s, 8);
}

function readCString(bytes: Uint8Array, start: number, len: number): string {
  let end = start;
  const max = start + len;
  while (end < max && bytes[end] !== 0) end += 1;
  return new TextDecoder().decode(bytes.subarray(start, end));
}

async function maybeGunzip(data: Uint8Array): Promise<Uint8Array> {
  if (data.length < 2 || data[0] !== 0x1f || data[1] !== 0x8b) return data;
  const ds = new DecompressionStream("gzip");
  const stream = new Blob([wasmBytes(data)]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function wasmBytes(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

/** Deep-clone a WASI dir map so a compile cannot poison the cached /lib tree. */
export function cloneInodeTree(root: Map<string, Inode>): Map<string, Inode> {
  const out = new Map<string, Inode>();
  for (const [name, node] of root) {
    if (node instanceof Directory) {
      out.set(name, new Directory(cloneInodeTree(node.contents)));
    } else if (node instanceof File) {
      out.set(name, new File(node.data, { readonly: true }));
    }
  }
  return out;
}

function ensureDir(root: Map<string, Inode>, dirPath: string): Map<string, Inode> {
  const parts = dirPath.split("/").filter(Boolean);
  let map = root;
  for (const part of parts) {
    const existing = map.get(part);
    const dir = existing instanceof Directory ? existing : new Directory(new Map());
    if (dir !== existing) map.set(part, dir);
    map = dir.contents;
  }
  return map;
}

function putFile(root: Map<string, Inode>, filePath: string, data: Uint8Array): void {
  const parts = filePath.split("/").filter(Boolean);
  const name = parts.pop();
  if (!name) return;
  const dir = parts.length === 0 ? root : ensureDir(root, parts.join("/"));
  dir.set(name, new File(data, { readonly: true }));
}

function parsePax(data: Uint8Array): Record<string, string> {
  const text = new TextDecoder().decode(data);
  const out: Record<string, string> = {};
  let i = 0;
  while (i < text.length) {
    const sp = text.indexOf(" ", i);
    if (sp < 0) break;
    const len = Number.parseInt(text.slice(i, sp), 10);
    if (!Number.isFinite(len) || len <= 0) break;
    const rec = text.slice(i, i + len);
    const eq = rec.indexOf("=");
    if (eq > 0) {
      const key = rec.slice(sp + 1, eq);
      let val = rec.slice(eq + 1);
      if (val.endsWith("\n")) val = val.slice(0, -1);
      out[key] = val;
    }
    i += len;
  }
  return out;
}

/** Unpack a ustar/gnu/pax tar (optionally gzip) into a WASI directory map for /lib. */
export async function unpackStdArchive(bytes: Uint8Array): Promise<Map<string, Inode>> {
  const buf = await maybeGunzip(bytes);
  const root = new Map<string, Inode>();
  let offset = 0;
  let longName: string | null = null;
  let pax: Record<string, string> | null = null;

  while (offset + BLOCK <= buf.length) {
    const header = buf.subarray(offset, offset + BLOCK);
    let empty = true;
    for (let i = 0; i < BLOCK; i++) {
      if (header[i] !== 0) {
        empty = false;
        break;
      }
    }
    if (empty) break;

    const size = readOctal(header, 124, 12);
    const typeflag = String.fromCharCode(header[156] ?? 0);
    const name = readCString(header, 0, 100);
    const prefix = readCString(header, 345, 155);
    offset += BLOCK;
    const padded = Math.ceil(size / BLOCK) * BLOCK;
    const fileData = buf.subarray(offset, offset + size);
    offset += padded;

    if (typeflag === "L") {
      longName = new TextDecoder().decode(fileData).replace(/\0/g, "");
      continue;
    }
    if (typeflag === "x") {
      pax = parsePax(fileData);
      continue;
    }
    if (typeflag === "g" || typeflag === "K") {
      continue;
    }

    let full = pax?.path ?? longName ?? (prefix ? `${prefix}/${name}` : name);
    longName = null;
    pax = null;
    full = full.replace(/^\.\//, "").replace(/\\/g, "/");
    if (!full || full === ".") continue;

    if (typeflag === "5" || full.endsWith("/")) {
      ensureDir(root, full.replace(/\/+$/, ""));
      continue;
    }
    if (typeflag === "0" || typeflag === "\0" || typeflag === "" || typeflag === "7") {
      putFile(root, full, fileData.slice());
    }
  }

  return root;
}
