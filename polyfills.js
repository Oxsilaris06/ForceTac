// Polyfills pour la compatibilité Web/Node dans React Native

// 1. TextEncoder / TextDecoder (Souvent requis par les libs de crypto ou buffers)
import 'text-encoding-polyfill';

// 2. Crypto (Pour uuid, nanoid, ou libs de sécurité)
import 'react-native-get-random-values';

// 3. URL et URLSearchParams
import 'react-native-url-polyfill/auto';

// 4. Buffer (Indispensable pour manipuler les données binaires NFC/Hex)
global.Buffer = global.Buffer || require('buffer').Buffer;

// 5. process (Certaines libs Node en ont besoin)
if (typeof process === 'undefined') {
  global.process = require('process');
} else {
  const bProcess = require('process');
  for (var p in bProcess) {
    if (!(p in process)) {
      process[p] = bProcess[p];
    }
  }
}

// 6. Console (Evite les crashs si console.x n'existe pas)
if (!global.console) {
  global.console = {};
}
if (!global.console.log) { global.console.log = () => {}; }
if (!global.console.warn) { global.console.warn = () => {}; }
if (!global.console.error) { global.console.error = () => {}; }
