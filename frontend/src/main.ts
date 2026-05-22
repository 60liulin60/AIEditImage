import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import './styles/main.scss';
import App from './App.vue';
import { router } from './router';

const app = createApp(App);

// Pinia 存放登录用户和轻量页面状态，敏感 API Key 仍只在 IndexedDB 中加密保存。
app.use(createPinia());
app.use(router);
app.use(ElementPlus);
app.mount('#app');
