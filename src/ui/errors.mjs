/**
 * Turn a thrown error into a message in the user's language.
 *
 * The calc layer throws `CalcError` with a code and raw params (see
 * src/calc/errors.mjs). This is where that becomes prose. Anything that is not
 * a CalcError falls back to its own message, because an unexpected exception
 * still needs to be shown — hiding it would be worse than showing it in the
 * wrong language.
 */
export function errorMessage(e, t) {
  if (!e) return '';
  if (e.code) {
    const key = `errors.${e.code}`;
    const params = { ...(e.params ?? {}) };
    // Field names arrive as keys and need translating too, otherwise an
    // English user sees "must be greater than 0" about a field called "浓度".
    if (typeof params.name === 'string') {
      params.name = t(`fields.${params.name}`);
    }
    const out = t(key, params);
    if (typeof params.name !== 'string') return out;
    // A Latin tail running into a CJK head needs a space. Apply it to the
    // rendered string, once, at the first occurrence of the name.
    const at = out.indexOf(params.name);
    if (at === -1) return out;
    const next = out[at + params.name.length];
    const last = params.name[params.name.length - 1];
    if (/[\x00-\x7F]/.test(last) && next && /[一-鿿]/.test(next)) {
      return `${out.slice(0, at + params.name.length)} ${out.slice(at + params.name.length)}`;
    }
    return out;
  }
  return e.message ?? String(e);
}
