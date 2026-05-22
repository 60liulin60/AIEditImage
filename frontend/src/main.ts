import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import './styles/main.scss';
import App from './App.vue';
import { router } from './router';

// 创建唯一的 Vue 应用实例，后续插件都挂载到同一个根实例上。
const app = createApp(App);

// Pinia 存放登录用户和轻量页面状态，敏感 API Key 仍只在 IndexedDB 中加密保存。
app.use(createPinia());
// 路由必须早于挂载注册，确保首屏能先经过登录态守卫。
app.use(router);
// Element Plus 提供全局组件和服务，避免各页面重复注册基础组件。
app.use(ElementPlus);
app.mount('#app');
