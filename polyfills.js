/**
 * Polyfills pour Hermes et l'environnement React Native
 */

// 1. Timers (Crucial pour Hermes)
if (typeof setTimeout === 'undefined') {
    global.setTimeout = (fn, ms, ...args) => {
        return global.nativeSetTimeout(fn, ms, ...args);
    };
}

if (typeof clearTimeout === 'undefined') {
    global.clearTimeout = (id) => {
        return global.nativeClearTimeout(id);
    };
}

if (typeof setImmediate === 'undefined') {
    global.setImmediate = (fn, ...args) => {
        return global.nativeSetImmediate(fn, ...args);
    };
}

// 2. Fetch API (Souvent manquant dans le contexte de build strict)
if (typeof fetch === 'undefined') {
    global.fetch = require('whatwg-fetch').fetch;
}
if (typeof Headers === 'undefined') {
    global.Headers = require('whatwg-fetch').Headers;
}
if (typeof Request === 'undefined') {
    global.Request = require('whatwg-fetch').Request;
}
if (typeof Response === 'undefined') {
    global.Response = require('whatwg-fetch').Response;
}

// 3. Objets Globaux
if (typeof self === 'undefined') {
    global.self = global;
}
if (typeof window === 'undefined') {
    global.window = global;
}
if (typeof navigator === 'undefined') {
    global.navigator = {
        userAgent: 'ReactNative',
        product: 'ReactNative',
        onLine: true
    };
}

// 4. Performance
if (typeof performance === 'undefined') {
    global.performance = {
        now: () => Date.now()
    };
}
