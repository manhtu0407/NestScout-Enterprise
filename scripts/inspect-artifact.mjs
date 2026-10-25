import { crc32, inflateRawSync } from 'node:zlib';
import { blobByteLimit } from './repository-files.mjs';

export const artifactLimits = Object.freeze({ bytes: blobByteLimit, entryBytes: 8 * 1024 * 1024, entries: 1000 });
const fail = detail => { throw new Error(`Artifact inspection blocked: ${detail}`); };
const utf8 = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes);

function pdfText(bytes) {
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be', { fatal: true }).decode(bytes.subarray(2));
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le', { fatal: true }).decode(bytes.subarray(2));
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return utf8(bytes.subarray(3));
  if (bytes.some(byte => byte > 0x7f)) fail('PDF metadata requires ASCII or an explicit Unicode BOM; review PDFDocEncoding separately.');
  return bytes.toString('ascii');
}

function pdfMetadata(content) {
  const text = content.toString('latin1');
  if (!/^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(text) || !/%%EOF\s*$/.test(text)) fail('invalid PDF header or EOF.');
  const tokens = [];
  let position = 0;
  const delimiter = /[\s\0()[\]<>/%]/;
  while (position < text.length) {
    if (tokens.length > 200000) fail('PDF token limit exceeded.');
    const char = text[position];
    if (/[\s\0]/.test(char)) { position++; continue; }
    if (char === '%') { while (position < text.length && !/[\r\n]/.test(text[position])) position++; continue; }
    if (char === '(') {
      const bytes = [];
      let depth = 1;
      position++;
      while (position < text.length && depth) {
        let value = text[position++];
        if (value === '\\') {
          value = text[position++];
          if (value === '\r' || value === '\n') { if (value === '\r' && text[position] === '\n') position++; continue; }
          if (/[0-7]/.test(value ?? '')) {
            let octal = value;
            while (octal.length < 3 && /[0-7]/.test(text[position] ?? '')) octal += text[position++];
            bytes.push(parseInt(octal, 8) & 255);
          } else bytes.push(({ n: 10, r: 13, t: 9, b: 8, f: 12 })[value] ?? value?.charCodeAt(0));
        } else if (value === '(') { depth++; bytes.push(40); }
        else if (value === ')') { if (--depth) bytes.push(41); }
        else bytes.push(value.charCodeAt(0));
        if (depth > 64 || bytes.length > 65536) fail('PDF string limit exceeded.');
      }
      if (depth) fail('unterminated PDF string.');
      tokens.push({ string: Buffer.from(bytes) });
      continue;
    }
    const pair = text.slice(position, position + 2);
    if (pair === '<<' || pair === '>>') { tokens.push(pair); position += 2; continue; }
    if (char === '<') {
      const end = text.indexOf('>', position + 1);
      if (end < 0) fail('unterminated PDF hex string.');
      let hex = text.slice(position + 1, end).replace(/\s/g, '');
      if (!/^[a-f0-9]*$/i.test(hex) || hex.length > 131072) fail('unsupported PDF hex string.');
      if (hex.length % 2) hex += '0';
      tokens.push({ string: Buffer.from(hex, 'hex') });
      position = end + 1;
      continue;
    }
    if (char === '[' || char === ']') { tokens.push(char); position++; continue; }
    if (char === '/') {
      const start = ++position;
      while (position < text.length && !delimiter.test(text[position])) position++;
      const raw = text.slice(start, position);
      if (!raw || /#(?![a-f0-9]{2})/i.test(raw)) fail('invalid PDF name.');
      tokens.push({ name: raw.replace(/#([a-f0-9]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))) });
      continue;
    }
    const start = position;
    while (position < text.length && !delimiter.test(text[position])) position++;
    if (position === start) fail('unsupported PDF token.');
    const token = text.slice(start, position);
    if (token === 'stream') {
      let length;
      for (let i = tokens.length - 2; i >= 0 && tokens[i] !== '<<'; i--) {
        if (tokens[i]?.name === 'Length') {
          if (tokens[i + 3] === 'R') fail('indirect PDF stream lengths require separate review.');
          length = tokens[i + 1]; break;
        }
      }
      if (!Number.isSafeInteger(length) || length < 0 || !/^(?:\r\n|\n|\r)/.test(text.slice(position))) fail('unsupported PDF stream length.');
      position += text[position] === '\r' && text[position + 1] === '\n' ? 2 : 1;
      position += length;
      if (text[position] === '\r') position++;
      if (text[position] === '\n') position++;
      if (!text.startsWith('endstream', position)) fail('PDF stream length mismatch.');
      position += 9;
      tokens.push('stream');
    } else tokens.push(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(token) ? Number(token) : token);
  }
  if (tokens.some(token => token?.name && /^(?:Encrypt|ObjStm|XRef|Metadata|EmbeddedFiles|EmbeddedFile)$/i.test(token.name))) {
    fail('encrypted, object/xref-stream, XMP or embedded-file PDFs require separate review.');
  }
  function value(cursor, depth = 0) {
    if (depth > 64) fail('PDF dictionary nesting limit exceeded.');
    const token = tokens[cursor.index++];
    if (token === '<<') {
      const dictionary = new Map();
      while (tokens[cursor.index] !== '>>') {
        const key = tokens[cursor.index++];
        if (!key?.name || dictionary.has(key.name)) fail('invalid or duplicate PDF dictionary key.');
        dictionary.set(key.name, value(cursor, depth + 1));
      }
      cursor.index++;
      return dictionary;
    }
    if (token === '[') {
      const array = [];
      while (tokens[cursor.index] !== ']') { if (cursor.index >= tokens.length) fail('unterminated PDF array.'); array.push(value(cursor, depth + 1)); }
      cursor.index++;
      return array;
    }
    if (typeof token === 'number' && Number.isInteger(tokens[cursor.index]) && tokens[cursor.index + 1] === 'R') {
      const reference = `${token} ${tokens[cursor.index]}`;
      cursor.index += 2;
      return { reference };
    }
    if (token === undefined || ['>>', ']', 'endobj', 'stream'].includes(token)) fail('invalid PDF value.');
    return token;
  }
  const objects = new Map();
  const trailers = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === 'obj') {
      if (!Number.isInteger(tokens[i - 2]) || !Number.isInteger(tokens[i - 1])) fail('invalid PDF object.');
      const key = `${tokens[i - 2]} ${tokens[i - 1]}`;
      if (objects.has(key)) fail('incremental/duplicate PDF objects require separate review.');
      const cursor = { index: i + 1 };
      objects.set(key, value(cursor));
      if (tokens[cursor.index] === 'stream') cursor.index++;
      if (tokens[cursor.index] !== 'endobj') fail('invalid PDF object boundary.');
      i = cursor.index;
    } else if (tokens[i] === 'trailer') trailers.push(value({ index: i + 1 }));
  }
  const start = tokens.lastIndexOf('startxref');
  if (trailers.length !== 1 || !(trailers[0] instanceof Map) || trailers[0].has('Prev') || trailers[0].has('XRefStm')
    || !Number.isSafeInteger(tokens[start + 1]) || !text.startsWith('xref', tokens[start + 1]) || start + 2 !== tokens.length) fail('unsupported PDF trailer/xref history.');
  const active = new Set(), identifiers = new Set();
  const lines = text.slice(tokens[start + 1]).split(/\r\n|\r|\n/);
  let line = 1;
  while (line < lines.length && !/^trailer(?:\s|$)/.test(lines[line])) {
    const section = /^(\d+)\s+(\d+)\s*$/.exec(lines[line++]);
    if (!section || Number(section[1]) + Number(section[2]) > 200000) fail('unsupported PDF xref subsection.');
    for (let i = 0; i < Number(section[2]); i++) {
      const row = /^(\d{10})[ \t]+(\d{5})[ \t]+([nf])[ \t]*$/.exec(lines[line++] ?? '');
      const identifier = Number(section[1]) + i;
      if (!row || identifiers.has(identifier)) fail('invalid or duplicate PDF xref row.');
      identifiers.add(identifier);
      if (row[3] === 'n') {
        const generation = Number(row[2]), offset = Number(row[1]), key = `${identifier} ${generation}`;
        if (!objects.has(key) || !new RegExp(`^${identifier}\\s+${generation}\\s+obj\\b`).test(text.slice(offset))) fail('PDF xref object offset mismatch.');
        active.add(key);
      }
    }
  }
  const declaredSize = trailers[0].get('Size');
  if (line >= lines.length || !Number.isSafeInteger(declaredSize) || declaredSize <= 0 || [...identifiers].some(identifier => identifier >= declaredSize)) fail('invalid PDF xref/trailer size.');
  function resolve(item, seen = new Set()) {
    if (!item?.reference) return item;
    if (seen.has(item.reference) || seen.size > 16 || !active.has(item.reference)) fail('unresolved/cyclic PDF metadata reference.');
    seen.add(item.reference);
    return resolve(objects.get(item.reference), seen);
  }
  const catalog = resolve(trailers[0].get('Root'));
  if (!(catalog instanceof Map) || catalog.get('Type')?.name !== 'Catalog') fail('invalid PDF document catalog.');
  const info = resolve(trailers[0].get('Info'));
  if (info === undefined) return [];
  if (!(info instanceof Map)) fail('PDF Info must be a dictionary.');
  const records = [];
  for (const [name, item] of info) {
    if (!/^(?:title|author|authors)$/i.test(name)) continue;
    const string = resolve(item)?.string;
    if (!Buffer.isBuffer(string)) fail('PDF Title/Author must be text strings.');
    const textValue = pdfText(string);
    const values = /^authors?$/i.test(name) ? textValue.split(/[;,\r\n]/).map(author => `Author: ${author.replace(/\s+/g, ' ').trim()}`) : [textValue];
    for (const text of values) records.push({ file: `PDF ${name}`, text, metadata: true });
  }
  return records;
}

function zipContents(content) {
  const end = content.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0 || end + 22 > content.length || end + 22 + content.readUInt16LE(end + 20) !== content.length) fail('invalid ZIP end record.');
  const count = content.readUInt16LE(end + 10);
  const centralSize = content.readUInt32LE(end + 12);
  const centralStart = content.readUInt32LE(end + 16);
  if (content.readUInt16LE(end + 4) || content.readUInt16LE(end + 6) || content.readUInt16LE(end + 8) !== count
    || count > artifactLimits.entries || centralStart + centralSize !== end) fail('multi-disk, ZIP64 or oversized ZIP directory.');
  const records = [{ file: 'ZIP comment', text: utf8(content.subarray(end + 22)), metadata: true }];
  const names = new Set();
  const parents = new Set();
  const regularFiles = new Set();
  const ranges = [];
  let cursor = centralStart;
  let total = 0;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || content.readUInt32LE(cursor) !== 0x02014b50) fail('invalid ZIP central header.');
    const flags = content.readUInt16LE(cursor + 8), method = content.readUInt16LE(cursor + 10);
    const crc = content.readUInt32LE(cursor + 16), compressed = content.readUInt32LE(cursor + 20), size = content.readUInt32LE(cursor + 24);
    const nameSize = content.readUInt16LE(cursor + 28), extraSize = content.readUInt16LE(cursor + 30), commentSize = content.readUInt16LE(cursor + 32);
    const local = content.readUInt32LE(cursor + 42), mode = content.readUInt32LE(cursor + 38) >>> 16;
    if (flags & ~0x080e || ![0, 8].includes(method) || size > artifactLimits.entryBytes || (total += size) > artifactLimits.bytes
      || content.readUInt16LE(cursor + 34) || ![0, 0x8000, 0x4000].includes(mode & 0xf000)) fail('unsupported/encrypted/special ZIP entry or expansion limit.');
    const next = cursor + 46 + nameSize + extraSize + commentSize;
    if (next > end || local + 30 > centralStart || content.readUInt32LE(local) !== 0x04034b50) fail('invalid ZIP local header.');
    const rawName = content.subarray(cursor + 46, cursor + 46 + nameSize);
    if (!(flags & 0x800) && rawName.some(byte => byte > 127)) fail('ZIP names must be ASCII or explicitly UTF-8.');
    const file = utf8(rawName);
    if (((mode & 0xf000) === 0x4000 || (content.readUInt32LE(cursor + 38) & 0x10)) && !file.endsWith('/')) fail('ZIP directory mode/path mismatch.');
    const parts = file.replace(/\/$/, '').split('/');
    if (!file || file !== file.normalize('NFKC') || /[\\:\u0000-\u001f\u007f]/u.test(file)
      || parts.some((part, index) => !part || part === '.' || part === '..' || /[. ]$/.test(part)
        || /^\.git$/i.test(part) || (index === 0 && /^(?:\.cache|node_modules|coverage)$/i.test(part))
        || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))
      || names.has(file.toLowerCase().replace(/\/$/, ''))) fail('unsafe, duplicate or case-colliding ZIP path.');
    names.add(file.toLowerCase().replace(/\/$/, ''));
    const folded = file.toLowerCase().replace(/\/$/, '');
    if (!file.endsWith('/')) { if (parents.has(folded)) fail('ZIP file/directory path collision.'); regularFiles.add(folded); }
    for (let i = 1; i < parts.length; i++) {
      const parent = parts.slice(0, i).join('/').toLowerCase();
      if (regularFiles.has(parent)) fail('ZIP file/directory path collision.');
      parents.add(parent);
    }
    const localNameSize = content.readUInt16LE(local + 26), localExtraSize = content.readUInt16LE(local + 28);
    const data = local + 30 + localNameSize + localExtraSize;
    if (data + compressed > centralStart || content.readUInt16LE(local + 6) !== flags || content.readUInt16LE(local + 8) !== method
      || !rawName.equals(content.subarray(local + 30, local + 30 + localNameSize))) fail('ZIP local/central mismatch.');
    for (const [start, length] of [[cursor + 46 + nameSize, extraSize], [local + 30 + localNameSize, localExtraSize]]) {
      for (let offset = start; offset < start + length;) {
        if (offset + 4 > start + length) fail('invalid ZIP extra field.');
        const type = content.readUInt16LE(offset), lengthValue = content.readUInt16LE(offset + 2);
        offset += 4 + lengthValue;
        if (offset > start + length || ![0x5455, 0x000a, 0x7875].includes(type)) fail('unsupported ZIP extra field; only timestamps and Unix UID/GID are accepted.');
      }
    }
    let finish = data + compressed;
    if (flags & 8) {
      if (finish + 4 <= centralStart && content.readUInt32LE(finish) === 0x08074b50) finish += 4;
      if (finish + 12 > centralStart || content.readUInt32LE(finish) !== crc || content.readUInt32LE(finish + 4) !== compressed || content.readUInt32LE(finish + 8) !== size) fail('invalid ZIP data descriptor.');
      finish += 12;
    } else if (content.readUInt32LE(local + 14) !== crc || content.readUInt32LE(local + 18) !== compressed || content.readUInt32LE(local + 22) !== size) fail('ZIP local sizes/CRC mismatch.');
    ranges.push([local, finish]);
    const payload = content.subarray(data, data + compressed);
    const inflated = method === 8 ? inflateRawSync(payload, { info: true, maxOutputLength: Math.max(1, Math.min(size, artifactLimits.entryBytes)) }) : undefined;
    if (inflated && inflated.engine.bytesWritten !== compressed) fail('trailing data in compressed ZIP payload.');
    const bytes = inflated?.buffer ?? payload;
    if (bytes.length !== size || crc32(bytes) !== crc) fail('ZIP content size/CRC mismatch.');
    records.push({ file: `${file} comment`, text: utf8(content.subarray(cursor + 46 + nameSize + extraSize, next)), metadata: true });
    if (file.endsWith('/')) { if (size) fail('ZIP directory has content.'); }
    else if (/\.pdf$/i.test(file)) records.push(...pdfMetadata(bytes).map(record => ({ ...record, file: `${file}/${record.file}` })));
    else {
      if (hasArtifactSignature(bytes)) fail('nested archive or PDF entry with a misleading extension.');
      if (!/\.(?:txt|md|[cm]?js|[cm]?ts|tsx|jsonc?|toml|ya?ml|sql|css|html|csv|svg)$/i.test(file)
        && !/^(?:LICENSE|NOTICE|COPYING|AUTHORS|CONTRIBUTORS|README|\.gitignore)$/i.test(parts.at(-1))) fail('nested archives and unsupported ZIP binary/file formats require separate review.');
      const text = utf8(bytes);
      if (text.includes('\0')) fail('binary content in ZIP text entry.');
      records.push({ file, text });
    }
    cursor = next;
  }
  ranges.sort((a, b) => a[0] - b[0]);
  let finish = 0;
  for (const range of ranges) { if (range[0] !== finish) fail('overlapping entries or unlisted ZIP data.'); finish = range[1]; }
  if (cursor !== end || finish !== centralStart) fail('ZIP directory size mismatch or unlisted data.');
  return records;
}

export function hasArtifactSignature(content) {
  return content.subarray(0, 5).toString('ascii') === '%PDF-'
    || (content.length >= 4 && [0x04034b50, 0x06054b50, 0x08074b50].includes(content.readUInt32LE(0)));
}

export function inspectArtifact(file, content) {
  if (content.length > artifactLimits.bytes) fail('artifact exceeds 32 MiB.');
  try {
    return /\.pdf$/i.test(file) ? pdfMetadata(content) : zipContents(content);
  } catch (error) {
    if (error.message.startsWith('Artifact inspection blocked:')) throw error;
    fail('malformed/unsupported artifact encoding or compression.');
  }
}
