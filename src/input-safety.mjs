const asBytes = (input) => input instanceof Uint8Array ? input : new Uint8Array(input);

const BOM_ENCODINGS = [
  { bytes: [0xef, 0xbb, 0xbf], encoding: 'utf-8', offset: 3 },
  { bytes: [0xff, 0xfe], encoding: 'utf-16le', offset: 2 },
  { bytes: [0xfe, 0xff], encoding: 'utf-16be', offset: 2 }
];

const detectBom = (bytes) => BOM_ENCODINGS.find(({ bytes: marker }) => marker.every((value, index) => bytes[index] === value)) || null;

const textLooksSafe = (text) => {
  if (!text) return true;
  let controlCount = 0;
  for (const character of text) {
    const code = character.codePointAt(0);
    if ((code < 9 || code > 13) && code < 32) controlCount += 1;
  }
  return controlCount / text.length <= 0.01;
};

/**
 * Detect data that cannot safely enter a text parser.
 * This is a transport/input boundary only; it never asserts that text is a
 * valid enterprise dataset or that a decoded file satisfies a profile.
 */
const binaryReasonFor = (input) => {
  const bytes = asBytes(input);
  const bom = detectBom(bytes);
  if (bom) {
    try {
      const text = new TextDecoder(bom.encoding).decode(bytes.subarray(bom.offset));
      return !textLooksSafe(text) ? 'decoded_control_bytes' : null;
    } catch {
      return 'unsupported_bom_encoding';
    }
  }
  if (bytes.includes(0)) return 'nul_byte';
  let controlBytes = 0;
  for (const byte of bytes) {
    if ((byte < 9 || byte > 13) && byte < 32) controlBytes += 1;
  }
  return bytes.length > 0 && controlBytes / bytes.length > 0.01 ? 'control_byte_ratio' : null;
};

export const isLikelyBinary = (input) => Boolean(binaryReasonFor(input));

export const decodeTextBuffer = (input, encoding = 'utf-8') => {
  const bytes = asBytes(input);
  const bom = detectBom(bytes);
  const binaryReason = binaryReasonFor(bytes);
  if (binaryReason) return { binary: true, text: null, encoding: 'binary-or-non-text', binaryReason };
  const selectedEncoding = bom?.encoding || encoding;
  const offset = bom?.offset || 0;
  try {
    const text = new TextDecoder(selectedEncoding).decode(bytes.subarray(offset)).replace(/^\uFEFF/, '');
    if (!textLooksSafe(text)) return { binary: true, text: null, encoding: 'binary-or-non-text', binaryReason: 'decoded_control_bytes' };
    return { binary: false, text, encoding: selectedEncoding };
  } catch {
    if (bom) return { binary: true, text: null, encoding: 'binary-or-non-text', binaryReason: 'unsupported_bom_encoding' };
    return { binary: false, text: new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, ''), encoding: 'utf-8-fallback' };
  }
};
