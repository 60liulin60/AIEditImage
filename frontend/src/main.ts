import { createApp } from 'vue';
import { createPinia } from 'pinia';
import 'element-plus/es/components/message/style/css';
import 'element-plus/es/components/message-box/style/css';
import 'element-plus/es/components/notification/style/css';
import './styles/main.scss';
import App from './App.vue';
import { router } from './router';

// 创建唯一的 Vue 应用实例，后续插件都挂载到同一个根实例上。
const app = createApp(App);

// Pinia 存放登录用户和轻量页面状态，敏感 API Key 仍只在 IndexedDB 中加密保存。
app.use(createPinia());
// 路由必须早于挂载注册，确保首屏能先经过登录态守卫。
app.use(router);
// Element Plus 组件通过 unplugin-vue-components 自动按需导入
app.mount('#app');
