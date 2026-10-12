const { ModelProvider, ProviderError, validateResult } = require('../model-provider');
const { jsonValue } = require('../tool-schemas');

// Scripts contain normalized provider-neutral responses. Exhaustion fails instead
// of silently repeating a response; each instance owns its cursor.
class FakeProvider extends ModelProvider {
  #script; #cursor = 0;
  constructor({ script = [] } = {}) {
    super({ name: 'Fake', model: 'offline-script-v1' });
    try {
      this.#script = jsonValue(script, { maxBytes: 8 * 1024 * 1024 });
      if (!Array.isArray(this.#script)) throw new Error();
    } catch { throw new ProviderError('invalid_request'); }
  }
  async _generate({ tools, limits, signal }) {
    if (signal.aborted) throw new ProviderError('aborted');
    if (this.#cursor >= this.#script.length) throw new ProviderError('script_exhausted');
    return { result: validateResult(this.#script[this.#cursor++], tools, limits) };
  }
}
module.exports = { FakeProvider };
