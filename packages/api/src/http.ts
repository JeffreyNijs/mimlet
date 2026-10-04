import { ApiContractError, object } from './document.js';
export type ParameterLocation = 'path' | 'query' | 'header' | 'cookie';
export interface ParameterEncoding {
  readonly name: string;
  readonly in: ParameterLocation;
  readonly style?: string;
  readonly explode?: boolean;
  readonly allowReserved?: boolean;
}
export interface SerializedParameter {
  readonly value: string;
  readonly pairs: ReadonlyArray<readonly [string, string]>;
}
function scalar(value: unknown): string {
  if (value === null) {
    return '';
  }
  if (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return String(value);
  }
  throw new ApiContractError('RFC6570 parameters require scalars or one level of arrays/objects');
}
function encoded(value: string, reserved = false): string {
  if (!reserved) {
    return encodeURIComponent(value).replace(
      /[!'()*]/g,
      (s) => `%${s.charCodeAt(0).toString(16).toUpperCase()}`
    );
  }
  // Keep URI-safe reserved data, but never introduce a query delimiter or fragment.
  return value.replace(/%[0-9a-fA-F]{2}|[\s\S]/gu, (part) =>
    /^%[0-9a-fA-F]{2}$/.test(part) || /^[:/?@!$'()*,;]$/.test(part) ? part : encoded(part)
  );
}
export function headerName(name: string): string {
  if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) {
    throw new ApiContractError('Invalid HTTP header name');
  }
  return name.toLowerCase();
}
export function headerValue(value: string): string {
  if (
    Array.from(value).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
    )
  ) {
    throw new ApiContractError('HTTP header values must not contain control characters');
  }
  return value;
}
/** RFC6570-style parameter serialization. Undefined nested-style semantics are rejected. */
export function serializeParameter(
  parameter: ParameterEncoding,
  value: unknown
): SerializedParameter {
  if (
    !parameter ||
    typeof parameter.name !== 'string' ||
    !parameter.name ||
    !['path', 'query', 'header', 'cookie'].includes(parameter.in)
  ) {
    throw new ApiContractError('Invalid parameter encoding');
  }
  const style =
    parameter.style ?? (parameter.in === 'query' || parameter.in === 'cookie' ? 'form' : 'simple');
  const allowed: Record<ParameterLocation, string[]> = {
    path: ['simple', 'label', 'matrix'],
    query: ['form', 'spaceDelimited', 'pipeDelimited', 'deepObject'],
    header: ['simple'],
    cookie: ['form', 'cookie'],
  };
  if (!allowed[parameter.in].includes(style)) {
    throw new ApiContractError('Parameter style is not defined for this location');
  }
  const explode =
    parameter.explode ?? (style === 'form' || style === 'cookie' || style === 'deepObject');
  const encode = (value: unknown) =>
    parameter.in === 'header'
      ? headerValue(scalar(value))
      : encoded(scalar(value), parameter.in === 'query' && parameter.allowReserved === true);
  const name = parameter.in === 'header' ? headerName(parameter.name) : encoded(parameter.name);
  const array = Array.isArray(value) ? value.map(encode) : undefined;
  const entries =
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? Object.entries(object(value)).map(
          ([key, item]) =>
            [parameter.in === 'header' ? headerValue(key) : encoded(key), encode(item)] as const
        )
      : undefined;
  const flat = entries?.flat().join(',');
  const exploded = entries?.map(([key, value]) => `${key}=${value}`);
  if (style === 'deepObject') {
    if (!entries || !explode) {
      throw new ApiContractError('deepObject requires a flat object with explode enabled');
    }
    return { value: '', pairs: entries.map(([key, value]) => [`${name}%5B${key}%5D`, value]) };
  }
  if (style === 'spaceDelimited' || style === 'pipeDelimited') {
    if (!array || explode) {
      throw new ApiContractError('Delimited query styles require an array without explode');
    }
    return { value: '', pairs: [[name, array.join(style === 'spaceDelimited' ? '%20' : '%7C')]] };
  }
  if (style === 'form' || style === 'cookie') {
    const pairs: Array<readonly [string, string]> = array
      ? explode
        ? array.map((value) => [name, value])
        : [[name, array.join(',')]]
      : entries
        ? explode
          ? entries
          : [[name, flat!]]
        : [[name, encode(value)]];
    return { value: '', pairs };
  }
  const result = array
    ? array.join(style === 'label' && explode ? '.' : ',')
    : entries
      ? explode
        ? exploded!.join(style === 'label' ? '.' : ',')
        : flat!
      : encode(value);
  if (style === 'simple') {
    return { value: result, pairs: [] };
  }
  if (style === 'label') {
    return { value: `.${result}`, pairs: [] };
  }
  if (array && explode) {
    return {
      value: array.map((value) => `;${name}${value ? `=${value}` : ''}`).join(''),
      pairs: [],
    };
  }
  if (entries && explode) {
    return { value: entries.map(([key, value]) => `;${key}=${value}`).join(''), pairs: [] };
  }
  return { value: `;${name}${result ? `=${result}` : ''}`, pairs: [] };
}
export interface ContentCodec {
  /** Bytes may use any buffer; `encodeContent` copies a `SharedArrayBuffer` view. */
  readonly encode: (value: unknown) => string | Uint8Array;
}
export type ContentCodecs = Readonly<Record<string, ContentCodec>>;
export function mediaType(value: string): string {
  if (typeof value !== 'string' || /[\r\n\0]/.test(value) || !value.includes('/')) {
    throw new ApiContractError('Invalid media type');
  }
  return value.split(';')[0]!.trim().toLowerCase();
}
/**
 * Encoded bytes always own an ordinary `ArrayBuffer`, so they are valid Fetch bodies
 * (`BodyInit`). Codec output backed by a `SharedArrayBuffer` is copied.
 */
export function encodeContent(
  contentType: string,
  value: unknown,
  codecs: ContentCodecs = {}
): string | Uint8Array<ArrayBuffer> {
  const type = mediaType(contentType);
  const codec = codecs[contentType] ?? codecs[type];
  if (codec) {
    const result = codec.encode(value);
    if (typeof result === 'string') {
      return result;
    }
    if (!(result instanceof Uint8Array)) {
      if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
        void Promise.resolve(result).catch(() => {});
      }
      throw new ApiContractError('Content codecs must synchronously return text or Uint8Array');
    }
    return result.buffer instanceof ArrayBuffer
      ? (result as Uint8Array<ArrayBuffer>)
      : new Uint8Array(result);
  }
  if (type === 'application/json' || type.endsWith('+json')) {
    const result = JSON.stringify(value);
    if (result === undefined) {
      throw new ApiContractError('JSON content is not serializable');
    }
    return result;
  }
  if (type.startsWith('text/')) {
    return scalar(value);
  }
  if (type === 'application/x-www-form-urlencoded') {
    return Object.entries(object(value))
      .flatMap(([name, value]) => serializeParameter({ name, in: 'query' }, value).pairs)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
  }
  throw new ApiContractError(`No content codec is registered for ${type}`);
}
