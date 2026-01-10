// 1. Les polyfills DOIVENT être le tout premier import
import './polyfills'; 

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

// Enregistrement du composant
AppRegistry.registerComponent(appName, () => App);
