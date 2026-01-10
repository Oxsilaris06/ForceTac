import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

// FIX CRITIQUE : Assure que le nom correspond à MainActivity.java
// Si app.json contient "name": "ForceTac", cela fonctionnera.
AppRegistry.registerComponent(appName, () => App);
