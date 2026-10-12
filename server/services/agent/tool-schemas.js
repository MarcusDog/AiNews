// Deliberately small JSON Schema subset. Unknown keywords fail at registration.
const KEYWORDS = {
  object: ['type', 'properties', 'required', 'additionalProperties'],
  array: ['type', 'items', 'maxItems', 'minItems'],
  string: ['type', 'maxLength', 'minLength', 'enum'],
  integer: ['type', 'minimum', 'maximum', 'enum'],
  number: ['type', 'minimum', 'maximum', 'enum'],
  boolean: ['type'], null: ['type']
};
const plain = (value) => value !== null && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const integer = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max;

function assertSchema(schema, depth = 0) {
  if (!plain(schema) || depth > 16) throw new TypeError('invalid_declaration');
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const type = types.find((value) => value !== 'null') || 'null';
  if (!types.length || !KEYWORDS[type] || types.some((value) => value !== type && value !== 'null') || new Set(types).size !== types.length
    || Object.keys(schema).some((key) => !KEYWORDS[type].includes(key))) throw new TypeError('invalid_declaration');
  if (type === 'object') {
    if (!plain(schema.properties) || schema.additionalProperties !== false || !Array.isArray(schema.required)
      || schema.required.some((key) => !Object.hasOwn(schema.properties, key))
      || Object.keys(schema.properties).some((key) => ['__proto__', 'prototype', 'constructor'].includes(key))) throw new TypeError('invalid_declaration');
    Object.values(schema.properties).forEach((child) => assertSchema(child, depth + 1));
  } else if (type === 'array') {
    if (!integer(schema.maxItems, 1000) || (schema.minItems !== undefined && (!integer(schema.minItems, schema.maxItems)))) throw new TypeError('invalid_declaration');
    assertSchema(schema.items, depth + 1);
  } else if (type === 'string') {
    if (!integer(schema.maxLength, 100000) || (schema.minLength !== undefined && !integer(schema.minLength, schema.maxLength))) throw new TypeError('invalid_declaration');
  } else if (type === 'number' || type === 'integer') {
    if (!Number.isFinite(schema.minimum) || !Number.isFinite(schema.maximum) || schema.minimum > schema.maximum) throw new TypeError('invalid_declaration');
    if (type === 'integer' && (!Number.isSafeInteger(schema.minimum) || !Number.isSafeInteger(schema.maximum))) throw new TypeError('invalid_declaration');
  }
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || !schema.enum.length || schema.enum.some((value) => !validate({ ...schema, enum: undefined }, value)))) throw new TypeError('invalid_declaration');
}

function validate(schema, value) {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (value === null) return types.includes('null');
  const type = types.find((item) => item !== 'null');
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (type === 'object') return plain(value) && Object.keys(value).every((key) => Object.hasOwn(schema.properties, key))
    && schema.required.every((key) => Object.hasOwn(value, key)) && Object.entries(value).every(([key, item]) => validate(schema.properties[key], item));
  if (type === 'array') return Array.isArray(value) && value.length <= schema.maxItems && value.length >= (schema.minItems || 0) && value.every((item) => validate(schema.items, item));
  if (type === 'string') return typeof value === 'string' && [...value].length <= schema.maxLength && [...value].length >= (schema.minLength || 0);
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'number' || type === 'integer') return typeof value === 'number' && Number.isFinite(value) && (type !== 'integer' || Number.isSafeInteger(value)) && value >= schema.minimum && value <= schema.maximum;
  return false;
}

// No getters/toJSON/coercion. Sorting keys gives stable JSON; budgets stop hostile graphs.
function jsonValue(value, { maxBytes = 262144, maxNodes = 20000 } = {}) {
  const ancestors = new Set(); let nodes = 0; let bytes = 0;
  const visit = (item, depth) => {
    if (++nodes > maxNodes || depth > 32) throw new TypeError('invalid_json');
    if (item === null || typeof item === 'boolean' || typeof item === 'string' || (typeof item === 'number' && Number.isFinite(item))) {
      bytes += Buffer.byteLength(JSON.stringify(item));
      if (bytes > maxBytes) throw new RangeError('json_too_large');
      return item;
    }
    if (!Array.isArray(item) && !plain(item)) throw new TypeError('invalid_json');
    if (ancestors.has(item) || Object.getOwnPropertySymbols(item).length) throw new TypeError('invalid_json');
    ancestors.add(item);
    const result = Array.isArray(item) ? [] : {};
    const keys = Object.keys(item).sort();
    if (Array.isArray(item) && (keys.length !== item.length || keys.some((key) => !/^\d+$/.test(key)))) throw new TypeError('invalid_json');
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!Object.hasOwn(descriptor, 'value') || ['__proto__', 'constructor', 'prototype'].includes(key)) throw new TypeError('invalid_json');
      bytes += Buffer.byteLength(key);
      result[key] = visit(descriptor.value, depth + 1);
    }
    ancestors.delete(item);
    return result;
  };
  const result = visit(value, 0);
  if (Buffer.byteLength(JSON.stringify(result)) > maxBytes) throw new RangeError('json_too_large');
  return result;
}

const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const text = (maxLength = 600) => ({ type: 'string', maxLength });
const count = (maximum = Number.MAX_SAFE_INTEGER) => ({ type: 'integer', minimum: 0, maximum });
const list = (items, maxItems = 50) => ({ type: 'array', items, maxItems });
module.exports = { assertSchema, validate, jsonValue, object, text, count, list };
