import { createApp } from 'vue';
import App from './App.vue';
import { installPluginTheme } from './theme.ts';
import './styles.css';

installPluginTheme();
createApp(App).mount('#app');
